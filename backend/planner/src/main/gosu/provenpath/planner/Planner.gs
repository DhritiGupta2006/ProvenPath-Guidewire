package provenpath.planner

uses java.io.File
uses java.math.BigDecimal
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.time.LocalDate
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.UUID
uses com.fasterxml.jackson.databind.ObjectMapper
uses provenpath.contracts.Citation
uses provenpath.contracts.Clause
uses provenpath.contracts.ClauseKind
uses provenpath.contracts.EventPort
uses provenpath.contracts.Json
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PlannerPort
uses provenpath.contracts.Proposal
uses provenpath.contracts.RegulatorySource
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.VerifyPort

/**
 * Track C — Live Gemini Planner.
 *
 * Loaded by class name when LLM_MODE=live (provenpath.planner.Planner).
 * Depends ONLY on :contracts — never uses provenpath.core.* or provenpath.app.*.
 *
 * Flow:
 *   1. RAG-lite: keyword-retrieve relevant sources from sources.yaml into the system prompt.
 *   2. Call Gemini with the 4 tool function declarations.
 *   3. Replay tool calls: propose_product → add_coverage → verify_compliance.
 *      The actual verify is done via VerifyPort (the deterministic gate).
 *   4. If BLOCKED, feed named failures back to Gemini (repair loop, max 2 iterations).
 *   5. If still blocked after 2 iterations, fall back to the fixture.
 *   6. Return the LAST Verdict unchanged.
 *
 * Demo path (tuned):
 *   Extortion ₹40L on ₹50L aggregate → CYB-RNG-002 BLOCKED → repair to ≤₹25L → PASSED.
 */
class Planner implements PlannerPort {

  static final var MAPPER : ObjectMapper = new ObjectMapper()
  static final var MAX_REPAIR_ITERATIONS : int = 2

  var _apiKey : String
  var _gemini : GeminiClient
  var _sources : List<RegulatorySource>
  var _fixturesFallback : String

  /** No-arg constructor required: the backend loads this by Class.forName(...).getDeclaredConstructor({}).newInstance({}). */
  construct() {
    _apiKey = System.getenv("GEMINI_API_KEY") ?: ""
    var toolsDir = resolveDir("PROVENPATH_TOOLS_DIR", "shared/tools")
    var rulesDir = resolveDir("PROVENPATH_RULES_DIR", "rules")
    _fixturesFallback = resolveDir("PROVENPATH_FIXTURES_DIR", "fixtures")
    _gemini = new GeminiClient(_apiKey, toolsDir)
    _sources = loadSources(rulesDir)
  }

  override function run(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict {
    if (_apiKey == null or _apiKey.trim().Empty) {
      events.emit(executionId, "planner.step", m({"step" -> 0, "action" -> "fallback",
          "note" -> "GEMINI_API_KEY not set — falling back to fixture", "mode" -> "live"}))
      return runFixtureFallback(executionId, prompt, verifier, events)
    }

    events.emit(executionId, "planner.step", m({"step" -> 1, "action" -> "plan",
        "note" -> "Building SMCyber product proposal via Gemini", "mode" -> "live"}))

    try {
      return runLive(executionId, prompt, verifier, events)
    } catch (e : Throwable) {
      events.emit(executionId, "planner.step", m({"step" -> 99, "action" -> "fallback",
          "note" -> "Gemini call failed (" + e.Message + ") — falling back to fixture", "mode" -> "live"}))
      return runFixtureFallback(executionId, prompt, verifier, events)
    }
  }

  // ─── Live Gemini path ────────────────────────────────────────────────────────

  private function runLive(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict {
    var ragContext = ragLite(prompt)
    var systemPrompt = buildSystemPrompt(ragContext)
    var userPrompt = buildUserPrompt(prompt)

    // Build multi-turn history: start with user message
    var history = new ArrayList<Map<String, Object>>()
    history.add(m({"role" -> "user", "parts" -> list(m({"text" -> userPrompt}))}))

    var proposal : Proposal = null
    var verdict : Verdict = null

    // Iteration 1: propose + add coverages + verify
    var stepN = 1
    var response = _gemini.generateWithHistory(systemPrompt, history)
    var functionCalls = GeminiClient.extractFunctionCalls(response)

    // Process initial tool calls from the model
    proposal = processFunctionCalls(executionId, functionCalls, proposal, events, history, stepN)
    stepN += functionCalls.size()

    // Always verify what we have
    events.emit(executionId, "planner.step", m({"step" -> stepN, "action" -> "verify_compliance",
        "note" -> "Submitting proposal to the deterministic gate", "mode" -> "live"}))

    if (proposal == null) {
      proposal = buildMinimalProposal(executionId, 1)
    }
    verdict = verifyProposal(executionId, proposal, verifier, events)

    // Repair loop (up to MAX_REPAIR_ITERATIONS)
    var repairIteration = 0
    while (verdict.Status == VerdictStatus.BLOCKED and repairIteration < MAX_REPAIR_ITERATIONS) {
      repairIteration++
      var failures = collectFailures(verdict)

      // Contract (docs/events.md): runId, iteration, failedRule, clauseId, expected, actual, reason.
      // The full list rides along in "failures" for multi-rule repairs.
      var first = failures.isEmpty() ? m({}) : failures.get(0)
      events.emit(executionId, "planner.repair", m({
          "runId" -> verdict.RunId,
          "iteration" -> (repairIteration + 1),
          "failedRule" -> first.get("ruleCode"),
          "clauseId" -> first.get("clauseId"),
          "expected" -> first.get("expected"),
          "actual" -> first.get("actual"),
          "reason" -> first.get("reason"),
          "failures" -> failures,
          "note" -> "Feeding " + failures.size() + " failure(s) back to Gemini for repair"}))

      // Append model response and function responses to history
      appendModelTurn(history, response)
      appendRepairRequest(history, failures, verdict.RunId)

      response = _gemini.generateWithHistory(systemPrompt, history)
      functionCalls = GeminiClient.extractFunctionCalls(response)

      if (!functionCalls.isEmpty()) {
        proposal.Iteration = repairIteration + 1
        proposal = processFunctionCalls(executionId, functionCalls, proposal, events, history, stepN + repairIteration * 10)
      } else {
        // Model returned text instead of tool calls — try to parse or break
        var extractedText = GeminiClient.extractText(response)
        var msgText = "Gemini returned text instead of tool calls: " + extractedText.substring(0, Math.min(200, extractedText.length()))
        events.emit(executionId, "planner.step", m({"step" -> (stepN + repairIteration * 10),
            "action" -> "repair_text",
            "note" -> msgText,
            "mode" -> "live"}))
        break
      }

      verdict = verifyProposal(executionId, proposal, verifier, events)
    }

    return verdict
  }

  // ─── Tool call processing ────────────────────────────────────────────────────

  private function processFunctionCalls(executionId : String, calls : List<Map<String, Object>>,
      existing : Proposal, events : EventPort, history : List<Map<String, Object>>, stepOffset : int) : Proposal {
    var p = existing
    var stepN = stepOffset

    for (fc in calls) {
      var name = fc.get("name") as String
      var args = (fc.get("args") ?: new LinkedHashMap<String, Object>()) as Map<String, Object>
      args.put("executionId", executionId)

      events.emit(executionId, "tool.called", m({"tool" -> name, "args" -> sanitizeArgs(args)}))

      var result : Map<String, Object>

      switch (name) {
        case "propose_product":
          // A re-propose during repair keeps the iteration, the proposal id and the clauses so far.
          var prior = p
          p = buildProposalFromArgs(executionId, args, prior == null ? 1 : prior.Iteration)
          if (prior != null) {
            p.ProposalId = prior.ProposalId
            p.Clauses.addAll(prior.Clauses)
            if (p.ProseSummary.Empty) p.ProseSummary = prior.ProseSummary
          }
          result = m({"proposalId" -> p.ProposalId, "iteration" -> p.Iteration, "clauseCount" -> 0})
          events.emit(executionId, "planner.step", m({"step" -> stepN, "action" -> name,
              "note" -> "Proposal skeleton created", "mode" -> "live"}))
          break
        case "add_coverage":
          if (p == null) p = buildMinimalProposal(executionId, 1)
          var clauses = parseClauses(args)
          if (clauses != null) {
            for (c in clauses) {
              p.Clauses.removeWhere(\ x -> x.ClauseId == c.ClauseId)
              p.Clauses.add(c)
            }
          }
          if (args.containsKey("proseSummary")) {
            p.ProseSummary = args.get("proseSummary") as String
          }
          result = m({"clauseCount" -> p.Clauses.size()})
          events.emit(executionId, "planner.step", m({"step" -> stepN, "action" -> name,
              "note" -> "Added " + (clauses == null ? 0 : clauses.size()) + " clause(s)", "mode" -> "live"}))
          break
        default:
          // verify_compliance and deploy_product are handled outside this loop
          result = m({"skipped" -> "handled by verifier"})
          break
      }

      events.emit(executionId, "tool.result", m({"tool" -> name, "result" -> result}))
      stepN++
    }
    return p
  }

  // ─── Verification ────────────────────────────────────────────────────────────

  private function verifyProposal(executionId : String, p : Proposal, verifier : VerifyPort, events : EventPort) : Verdict {
    events.emit(executionId, "tool.called", m({"tool" -> "verify_compliance",
        "args" -> m({"proposalId" -> p.ProposalId, "iteration" -> p.Iteration})}))
    var verdict = verifier.verify(p)
    events.emit(executionId, "tool.result", m({"tool" -> "verify_compliance",
        "result" -> m({"runId" -> verdict.RunId, "status" -> verdict.Status.name(), "verdictHash" -> verdict.VerdictHash})}))
    return verdict
  }

  // ─── Failure extraction for repair prompt ────────────────────────────────────

  private function collectFailures(verdict : Verdict) : List<Map<String, Object>> {
    var failures = new ArrayList<Map<String, Object>>()
    for (n in verdict.Nodes) {
      if (n.Result == NodeStatus.FAILED or n.Result == NodeStatus.NEEDS_REVIEW) {
        failures.add(m({"ruleCode" -> n.RuleCode, "clauseId" -> n.ClauseId,
            "layer" -> n.Layer?.name(), "expected" -> n.Expected,
            "actual" -> n.Actual, "reason" -> n.Reason}))
      }
    }
    return failures
  }

  private function appendModelTurn(history : List<Map<String, Object>>, response : Object) {
    var r = response as Map<String, Object>
    var candidates = r.get("candidates") as List<Object>
    if (candidates == null or candidates.isEmpty()) return
    var content = (candidates.get(0) as Map<String, Object>).get("content") as Map<String, Object>
    if (content != null) {
      history.add(content)
    }
  }

  private function appendRepairRequest(history : List<Map<String, Object>>, failures : List<Map<String, Object>>, runId : String) {
    var sb = new java.lang.StringBuilder()
    sb.append("The compliance gate returned BLOCKED (runId=").append(runId).append("). ")
    sb.append("Failing rules:\n")
    for (f in failures) {
      sb.append("  - ").append(f.get("ruleCode")).append(": ").append(f.get("reason"))
      sb.append(" (expected=").append(f.get("expected")).append(", actual=").append(f.get("actual")).append(")\n")
    }
    sb.append("\nPlease repair the proposal by calling add_coverage with corrected clause values. ")
    sb.append("All citations must be VERBATIM from sources.yaml. Remember:\n")
    sb.append("  - CYB-RNG-002: extortion sublimit must be <= 50% of aggregateLimitInr\n")
    sb.append("  - CYB-CON-001: sum of first-party limits must not exceed aggregate\n")
    sb.append("  - Citations must be byte-exact copies from sources.yaml full_text fields\n")
    history.add(m({"role" -> "user", "parts" -> list(m({"text" -> sb.toString()}))}))
  }

  // ─── Prompt builders ─────────────────────────────────────────────────────────

  private function buildSystemPrompt(ragContext : String) : String {
    return "You are a compliance-aware insurance product configurator for ProvenPath, a Guidewire PolicyCenter integration.\n" +
        "You PROPOSE product configurations for Indian SME Cyber Insurance (SMCyber). The deterministic ProvenPath gate DECIDES compliance.\n" +
        "You must NEVER claim compliance or inject {\"compliant\": true} — the gate does that.\n\n" +
        "CRITICAL RULES:\n" +
        "1. Call propose_product FIRST with aggregateLimitInr, turnoverInr, minimumPremiumInr, targetEffectiveDate.\n" +
        "2. Call add_coverage with ALL required coverages and exclusions.\n" +
        "3. owningEntityType MUST be \"GeneralLiabilityLine\" on every clause.\n" +
        "4. patternCode MUST match ^SMCyber[A-Za-z]+(Cov|Excl)$.\n" +
        "5. Citations textSnippet MUST be VERBATIM from the regulatory sources below.\n" +
        "6. Required coverages: SMCyberDataBreachCov, SMCyberPrivacyLiabilityCov.\n" +
        "7. Required exclusions: SMCyberWarExcl, SMCyberPriorKnownExcl, SMCyberIntentionalActsExcl, SMCyberInfraFailureExcl.\n" +
        "8. Extortion coverage (SMCyberExtortionCov) limitMaxInr MUST be <= aggregateLimitInr * 0.5.\n" +
        "9. minimumPremiumInr MUST be >= 10000.\n" +
        "9b. turnoverInr MUST be <= 5000000000 (MSME medium-enterprise limit, S.O. 1364(E) 2025).\n" +
        "9c. Cite official sources (IRDAI-CYBER-2021-*, CERT-IN-*) for coverages and exclusions. A citation textSnippet must be an exact substring of one full_text below, and the source must be in force on targetEffectiveDate.\n" +
        "10. All monetary values in INR integers.\n\n" +
        "REGULATORY SOURCES (cite these VERBATIM):\n" + ragContext
  }

  private function buildUserPrompt(prompt : String) : String {
    return "Please create an SMCyber insurance product configuration for the following request:\n\n" +
        prompt + "\n\n" +
        "Start with propose_product, then add all coverages and exclusions with add_coverage. " +
        "Use targetEffectiveDate of " + LocalDate.now().plusMonths(1).toString() + ". " +
        "Include all mandatory coverages and exclusions. Extortion sublimit must be at most 50% of the aggregate limit. " +
        "Every clause needs at least one citation with text copied VERBATIM from the sources in the system prompt."
  }

  // ─── RAG-lite ────────────────────────────────────────────────────────────────

  private function ragLite(prompt : String) : String {
    if (_sources.isEmpty()) return "(no sources loaded)"
    var keywords = extractKeywords(prompt)
    var relevant = new ArrayList<RegulatorySource>()
    for (src in _sources) {
      var text = (src.Title ?: "") + " " + (src.FullText ?: "")
      for (kw in keywords) {
        if (text.toLowerCase().contains(kw.toLowerCase())) {
          if (!relevant.contains(src)) {
            relevant.add(src)
          }
          break
        }
      }
    }
    // Always include the CERT-In source
    for (src in _sources) {
      if (src.SourceCode != null and src.SourceCode.startsWith("CERT-IN") and !relevant.contains(src)) {
        relevant.add(src)
      }
    }
    // The whole registry is small (~27 sources, ~9 KB) and the model can only quote verbatim what it is shown,
    // so the keyword hits come first and every other source follows.
    for (src in _sources) {
      if (!relevant.contains(src)) relevant.add(src)
    }

    var sb = new java.lang.StringBuilder()
    for (src in relevant) {
      sb.append("source_code: ").append(src.SourceCode).append("\n")
      sb.append("section: ").append(src.Section).append("\n")
      sb.append("title: ").append(src.Title).append("\n")
      sb.append("full_text: ").append(src.FullText).append("\n\n")
    }
    return sb.toString()
  }

  private function extractKeywords(prompt : String) : List<String> {
    var keywords = new ArrayList<String>()
    var lower = prompt.toLowerCase()
    // Cyber coverage keywords
    for (kw in {"extortion", "ransomware", "data breach", "privacy", "business interruption",
        "regulatory", "fines", "deductible", "aggregate", "cyber", "startup", "sme"}) {
      if (lower.contains(kw)) keywords.add(kw)
    }
    // Always include range and mandatory keywords
    keywords.add("mandatory")
    keywords.add("aggregate")
    return keywords
  }

  // ─── Proposal builders from LLM args ─────────────────────────────────────────

  private function buildProposalFromArgs(executionId : String, args : Map<String, Object>, iteration : int) : Proposal {
    var p = new Proposal()
    p.ExecutionId = executionId
    p.ProposalId = "PP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
    p.Iteration = iteration
    p.Line = "SMCyber"
    p.Jurisdiction = "IN"
    p.AggregateLimitInr = toLong(args.get("aggregateLimitInr"), 5000000L)
    p.TurnoverInr = toLong(args.get("turnoverInr"), 200000000L)
    p.MinimumPremiumInr = toLong(args.get("minimumPremiumInr"), 25000L)
    var dateStr = args.get("targetEffectiveDate") as String
    p.TargetEffectiveDate = dateStr != null ? LocalDate.parse(dateStr) : LocalDate.now().plusMonths(1)
    p.ProseSummary = (args.get("proseSummary") as String) ?: ""
    p.Clauses = new ArrayList<Clause>()
    return p
  }

  private function buildMinimalProposal(executionId : String, iteration : int) : Proposal {
    var p = new Proposal()
    p.ExecutionId = executionId
    p.ProposalId = "PP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
    p.Iteration = iteration
    p.Line = "SMCyber"
    p.Jurisdiction = "IN"
    p.AggregateLimitInr = 5000000L
    p.TurnoverInr = 200000000L
    p.MinimumPremiumInr = 25000L
    p.TargetEffectiveDate = LocalDate.now().plusMonths(1)
    p.ProseSummary = ""
    p.Clauses = new ArrayList<Clause>()
    return p
  }

  private function parseClauses(args : Map<String, Object>) : List<Clause> {
    var result = new ArrayList<Clause>()
    if (args.get("clause") != null) {
      result.add(parseClause(args.get("clause")))
    }
    if (args.get("clauses") != null) {
      for (c in args.get("clauses") as List<Object>) {
        result.add(parseClause(c))
      }
    }
    return result
  }

  private function parseClause(obj : Object) : Clause {
    if (obj typeis Clause) return obj
    return Json.MAPPER.convertValue(obj, Clause)
  }

  // ─── Fixture fallback ─────────────────────────────────────────────────────────

  private function runFixtureFallback(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict {
    var fp = new FixtureFallback(_fixturesFallback)
    return fp.run(executionId, prompt, verifier, events)
  }

  // ─── Source loading ───────────────────────────────────────────────────────────

  private static function loadSources(rulesDir : String) : List<RegulatorySource> {
    var result : List<RegulatorySource> = new ArrayList<RegulatorySource>()
    try {
      var f = new File(rulesDir, "sources.yaml")
      if (!f.exists()) {
        f = new File(rulesDir + "/rules", "sources.yaml")
      }
      if (!f.exists()) return result
      var yaml = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)
      // Parse using the existing RegulatorySource structure via SnakeYAML (available in :core, not :planner)
      // Fall back to simple text extraction
      result = parseSourcesYaml(yaml)
    } catch (e : Throwable) {
      // If parsing fails, return empty — the prompt will still work without RAG context
    }
    return result
  }

  private static function parseSourcesYaml(yaml : String) : List<RegulatorySource> {
    var result = new ArrayList<RegulatorySource>()
    // Simple line-by-line parser for the sources.yaml format (no SnakeYAML dependency in :planner)
    var current : RegulatorySource = null
    for (rawLine in yaml.split("\n")) {
      var line = rawLine.trim()
      if (line.startsWith("- source_code:")) {
        if (current != null) result.add(current)
        current = new RegulatorySource()
        current.SourceCode = extractValue(line, "- source_code:")
      } else if (line.startsWith("source_code:") and current == null) {
        current = new RegulatorySource()
        current.SourceCode = extractValue(line, "source_code:")
      } else if (line.startsWith("title:") and current != null) {
        current.Title = extractValue(line, "title:")
      } else if (line.startsWith("section:") and current != null) {
        current.Section = extractValue(line, "section:")
      } else if (line.startsWith("full_text:") and current != null) {
        current.FullText = extractQuotedValue(line, "full_text:")
      } else if (line.startsWith("jurisdiction:") and current != null) {
        current.Jurisdiction = extractValue(line, "jurisdiction:")
      }
    }
    if (current != null) result.add(current)
    return result
  }

  private static function extractValue(line : String, prefix : String) : String {
    var val = line.substring(prefix.length()).trim()
    if (val.startsWith("\"") and val.endsWith("\"")) {
      val = val.substring(1, val.length() - 1)
    }
    return val
  }

  private static function extractQuotedValue(line : String, prefix : String) : String {
    var rest = line.substring(prefix.length()).trim()
    if (rest.startsWith("\"")) {
      // Strip surrounding quotes
      if (rest.endsWith("\"") and rest.length() > 1) {
        rest = rest.substring(1, rest.length() - 1)
      } else {
        rest = rest.substring(1)
      }
    }
    return rest
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  private static function toLong(val : Object, defaultVal : long) : long {
    if (val == null) return defaultVal
    if (val typeis Number) return (val as Number).longValue()
    try { return Long.parseLong(val.toString()) } catch (e) { return defaultVal }
  }

  private static function sanitizeArgs(args : Map<String, Object>) : Map<String, Object> {
    // Don't log the full clause list in events — keep it readable
    var safe = new LinkedHashMap<String, Object>(args)
    safe.remove("executionId")
    return safe
  }

  private static function m(kv : Map<String, Object>) : Map<String, Object> {
    return new LinkedHashMap<String, Object>(kv)
  }

  private static function list(item : Object) : List<Object> {
    var l = new ArrayList<Object>()
    l.add(item)
    return l
  }

  private static function resolveDir(envName : String, name : String) : String {
    var fromEnv = System.getenv(envName)
    if (fromEnv != null and !fromEnv.trim().Empty) return fromEnv.trim()
    for (candidate in {"../" + name, name, "../../" + name, "../../../" + name}) {
      var f = new File(candidate)
      if (f.Directory) return f.CanonicalPath
    }
    return new File(name).AbsolutePath
  }
}
