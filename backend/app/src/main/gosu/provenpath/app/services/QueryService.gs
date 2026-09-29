package provenpath.app.services

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.List
uses java.util.Map
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.contracts.Json
uses provenpath.contracts.Proposal
uses provenpath.core.engine.RuleLoader

/** Read-side endpoints: execution detail, rules graph, replay, provenance, metrics. */
class QueryService {

  var _repo : Repository
  var _verify : VerifyService
  var _loader : RuleLoader
  var _evalDir : String

  construct(repo : Repository, verify : VerifyService, loader : RuleLoader, evalDir : String) {
    _repo = repo
    _verify = verify
    _loader = loader
    _evalDir = evalDir
  }

  function execution(id : String) : Map<String, Object> {
    var exec = _repo.execution(id)
    if (exec == null) {
      throw new ApiException(404, "unknown_execution", "execution not found: " + id)
    }
    var result = VerifyService.map(exec)
    result.put("proposals", _repo.proposalsForExecution(id))
    result.put("runs", _repo.runsForExecution(id))
    result.put("reviews", _repo.reviewsForExecution(id))
    result.put("deployments", _repo.deploymentsForExecution(id))
    var latest = _repo.latestRun(id)
    if (latest != null) {
      var row = _repo.proposalRow(latest.get("proposal_row_id") as String)
      result.put("latestRunId", latest.get("id"))
      result.put("latestProposal", Json.MAPPER.readValue(row.get("proposal") as String, Map))
    }
    return result
  }

  function rules() : Map<String, Object> {
    var list = new ArrayList<Map<String, Object>>()
    for (r in _loader.Rules) {
      list.add(VerifyService.map({"ruleCode" -> r.RuleCode, "name" -> r.Name, "layer" -> r.LayerStr, "appliesTo" -> r.AppliesTo,
          "dependsOn" -> r.DependsOn, "sourceCode" -> r.SourceCode, "pcMapping" -> r.PcMapping}))
    }
    return VerifyService.map({"rulesetHash" -> _loader.RulesetHash, "count" -> list.size(), "rules" -> list})
  }

  /** Re-runs the gate on the stored proposal of the latest run. Deterministic → identical hash. */
  function replay(executionId : String) : Map<String, Object> {
    var run = _repo.latestRun(executionId)
    if (run == null) {
      throw new ApiException(404, "no_run", "execution has no verification run yet")
    }
    var row = _repo.proposalRow(run.get("proposal_row_id") as String)
    var proposal = Json.parse(row.get("proposal") as String, Proposal)
    var v = _verify.check(proposal)
    return VerifyService.map({
        "executionId" -> executionId, "runId" -> run.get("id"), "iteration" -> run.get("iteration"),
        "originalHash" -> run.get("verdict_hash"), "verdictHash" -> v.VerdictHash, "match" -> (v.VerdictHash == run.get("verdict_hash")),
        "status" -> v.Status.name(), "originalStatus" -> run.get("status"),
        "rulesetChanged" -> (v.RulesetHash != run.get("ruleset_hash"))})
  }

  /** Clause → the rules that checked it (per layer) → the cited regulatory text. */
  function provenance(clauseId : String, executionId : String) : Map<String, Object> {
    var row = _repo.latestProposalWithClause(clauseId, executionId)
    if (row == null) {
      throw new ApiException(404, "unknown_clause", "clause not found: " + clauseId)
    }
    var proposal = Json.parse(row.get("proposal") as String, Proposal)
    var clause = proposal.Clauses.firstWhere(\ c -> c.ClauseId == clauseId)
    var run = _repo.DB.queryOne("SELECT id, status, verdict_hash FROM pp_verification_run WHERE proposal_row_id = ?::uuid " +
        "ORDER BY created_at DESC LIMIT 1", {row.get("id")})
    var checks = new ArrayList<Map<String, Object>>()
    if (run != null) {
      for (n in _repo.nodesForRun(run.get("id") as String)) {
        if (n.get("clause_id") == clauseId) {
          var rule = _loader.RulesByCode.get(n.get("rule_code") as String)
          var c = VerifyService.map(n)
          c.put("ruleName", rule?.Name)
          checks.add(c)
        }
      }
    }
    var citations = new ArrayList<Map<String, Object>>()
    if (clause.Citations != null) {
      for (cit in clause.Citations) {
        var src = _repo.source(cit.SourceCode)
        citations.add(VerifyService.map({
            "sourceCode" -> cit.SourceCode, "section" -> cit.Section, "textSnippet" -> cit.TextSnippet,
            "found" -> (src != null), "title" -> src?.get("title"), "fullText" -> src?.get("full_text"),
            "effectiveDate" -> src?.get("effective_date"), "jurisdiction" -> src?.get("jurisdiction"),
            "kind" -> src?.get("kind"), "issuer" -> src?.get("issuer"), "document" -> src?.get("document"), "url" -> src?.get("url"),
            "snippetMatchesSource" -> (src != null and cit.TextSnippet != null and (src.get("full_text") as String).contains(cit.TextSnippet))}))
      }
    }
    return VerifyService.map({
        "clauseId" -> clauseId, "executionId" -> row.get("execution_id"), "proposalId" -> row.get("proposal_id"),
        "iteration" -> row.get("iteration"), "clause" -> clause, "runId" -> run?.get("id"), "runStatus" -> run?.get("status"),
        "checks" -> checks, "citations" -> citations,
        "cited" -> (!citations.Empty and citations.allMatch(\ c -> c.get("snippetMatchesSource") == true))})
  }

  function metrics() : String {
    var f = new File(_evalDir, "metrics.json")
    if (!f.exists()) {
      throw new ApiException(404, "no_metrics", "eval/metrics.json not found; run the eval harness (gradle :eval:run)")
    }
    return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)
  }
}
