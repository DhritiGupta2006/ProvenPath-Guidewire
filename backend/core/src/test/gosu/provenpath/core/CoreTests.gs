package provenpath.core

uses org.junit.jupiter.api.Test
uses org.junit.jupiter.api.BeforeAll
uses org.junit.jupiter.api.Assertions
uses provenpath.core.engine.RuleLoader
uses provenpath.core.engine.RuleGraph
uses provenpath.core.engine.LogicEvaluator
uses provenpath.core.engine.RuleDefinition
uses provenpath.core.gate.Gate
uses provenpath.core.gate.GateToken
uses provenpath.core.gate.Hashing
uses provenpath.contracts.Json
uses provenpath.contracts.Proposal
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.Clause
uses provenpath.contracts.ClauseKind
uses java.io.File
uses java.math.BigDecimal
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.HashMap
uses java.util.List
uses java.util.Map

/**
 * Comprehensive JUnit 5 tests for the ProvenPath verification core.
 */
class CoreTests {

  static var _rulesDir : String
  static var _fixturesDir : String

  @BeforeAll
  static function setUp() {
    // Resolve directories
    var envDir = System.getenv("PROVENPATH_RULES_DIR")
    if (envDir != null && envDir.length() > 0) {
      _rulesDir = envDir
    } else {
      // Try relative to working directory
      var candidates = {"../rules", "../../rules", "rules"}
      for (var c in candidates) {
        var f = new File(c)
        if (f.exists() && new File(f, "sources.yaml").exists()) {
          _rulesDir = f.getAbsolutePath()
          break
        }
      }
    }
    if (_rulesDir == null) {
      throw new IllegalStateException("Cannot find rules directory. Set PROVENPATH_RULES_DIR env var.")
    }

    // Find fixtures
    var fixtureCandidates = {"../fixtures", "../../fixtures", "fixtures"}
    for (var c in fixtureCandidates) {
      var f = new File(c)
      if (f.exists() && new File(f, "proposal_demo_blocked.json").exists()) {
        _fixturesDir = f.getAbsolutePath()
        break
      }
    }
    if (_fixturesDir == null) {
      throw new IllegalStateException("Cannot find fixtures directory.")
    }

    // Set test mode for GateToken
    System.setProperty("provenpath.test", "true")
  }

  // ─── Loader tests ─────────────────────────────────────────────

  @Test
  function testLoaderLoadsAll22Rules() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    // 22 IRDAI rules + 1 grounding = 23 total rule files
    Assertions.assertTrue(loader.Rules.size() >= 22,
      "Expected at least 22 rules, got " + loader.Rules.size())
  }

  @Test
  function testLoaderDetectsCycle() {
    // Create a temp rule set with a cycle
    var tempDir = Files.createTempDirectory("provenpath-cycle-test").toFile()
    var rulesSubDir = new File(tempDir, "rules")
    rulesSubDir.mkdirs()

    // Write a minimal sources.yaml
    var sourcesContent = "- source_code: TEST-SRC\n  title: Test\n  section: S1\n  full_text: Test text\n  effective_date: \"2024-01-01\"\n  jurisdiction: IN\n"
    Files.write(new File(tempDir, "sources.yaml").toPath(), sourcesContent.getBytes(StandardCharsets.UTF_8))

    // Rule A depends on B, Rule B depends on A (cycle)
    var ruleA = "rule_code: CYCLE-A\nname: Cycle A\nlayer: TYPE\napplies_to: \"proposal\"\ndepends_on: [CYCLE-B]\nlogic:\n  operator: EQ\n  field: \"proposal.line\"\n  value: \"SMCyber\"\nsource_code: TEST-SRC\nerror_template: test\n"
    var ruleB = "rule_code: CYCLE-B\nname: Cycle B\nlayer: TYPE\napplies_to: \"proposal\"\ndepends_on: [CYCLE-A]\nlogic:\n  operator: EQ\n  field: \"proposal.line\"\n  value: \"SMCyber\"\nsource_code: TEST-SRC\nerror_template: test\n"
    Files.write(new File(rulesSubDir, "CYCLE-A.yaml").toPath(), ruleA.getBytes(StandardCharsets.UTF_8))
    Files.write(new File(rulesSubDir, "CYCLE-B.yaml").toPath(), ruleB.getBytes(StandardCharsets.UTF_8))

    var loader = new RuleLoader(tempDir.getAbsolutePath())
    loader.load()

    try {
      new RuleGraph(loader.Rules)
      Assertions.fail("Expected cycle detection exception")
    } catch (e : IllegalStateException) {
      Assertions.assertTrue(e.getMessage().contains("CYCLE-A") || e.getMessage().contains("CYCLE-B"),
        "Cycle error should name the involved rules: " + e.getMessage())
    }

    // Cleanup
    deleteRecursive(tempDir)
  }

  // ─── Evaluator operator tests ─────────────────────────────────

  @Test
  function testEvaluatorGTE() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "GTE")
    logic.put("field", "proposal.aggregateLimitInr")
    logic.put("value", 500000)
    var proposal = makeMinimalProposal()
    proposal.AggregateLimitInr = 5000000
    var result = LogicEvaluator.evaluate(logic, null, proposal)
    Assertions.assertTrue(result.Passed, "5000000 >= 500000 should pass")
  }

  @Test
  function testEvaluatorLTE() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "LTE")
    logic.put("field", "proposal.aggregateLimitInr")
    logic.put("value", 50000000)
    var proposal = makeMinimalProposal()
    proposal.AggregateLimitInr = 5000000
    var result = LogicEvaluator.evaluate(logic, null, proposal)
    Assertions.assertTrue(result.Passed, "5000000 <= 50000000 should pass")
  }

  @Test
  function testEvaluatorLTEFail() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "LTE")
    logic.put("field", "clause.limitMaxInr")
    logic.put("value_ref", "proposal.aggregateLimitInr * 0.5")
    var proposal = makeMinimalProposal()
    proposal.AggregateLimitInr = 5000000
    var clause = new Clause()
    clause.LimitMaxInr = 4000000L // 80%, should fail
    var result = LogicEvaluator.evaluate(logic, clause, proposal)
    Assertions.assertFalse(result.Passed, "4000000 > 2500000 (50% of 5000000), should fail LTE")
  }

  @Test
  function testEvaluatorEQ() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "EQ")
    logic.put("field", "clause.owningEntityType")
    logic.put("value", "SMCyberLine")
    var clause = new Clause()
    clause.OwningEntityType = "SMCyberLine"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorNEQ() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "NEQ")
    logic.put("field", "clause.owningEntityType")
    logic.put("value", "OtherLine")
    var clause = new Clause()
    clause.OwningEntityType = "SMCyberLine"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorIN() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "IN")
    logic.put("field", "clause.existence")
    var values = new ArrayList<Object>()
    values.add("Required")
    values.add("Suggested")
    values.add("Electable")
    values.add("Preset")
    logic.put("value", values)
    var clause = new Clause()
    clause.Existence = "Required"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorREGEX() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "REGEX")
    logic.put("field", "clause.patternCode")
    logic.put("value", "^SMCyber[A-Za-z]+(Cov|Excl)$")
    var clause = new Clause()
    clause.PatternCode = "SMCyberDataBreachCov"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed, "SMCyberDataBreachCov should match regex")
  }

  @Test
  function testEvaluatorREGEXFail() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "REGEX")
    logic.put("field", "clause.patternCode")
    logic.put("value", "^SMCyber[A-Za-z]+(Cov|Excl)$")
    var clause = new Clause()
    clause.PatternCode = "InvalidPattern123"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertFalse(result.Passed, "InvalidPattern123 should not match regex")
  }

  @Test
  function testEvaluatorEXISTS() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "EXISTS")
    logic.put("field", "clause.limitMaxInr")
    var clause = new Clause()
    clause.LimitMaxInr = 1000000L
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorAND() {
    var child1 = new HashMap<String, Object>()
    child1.put("operator", "GTE")
    child1.put("field", "proposal.aggregateLimitInr")
    child1.put("value", 500000)
    var child2 = new HashMap<String, Object>()
    child2.put("operator", "LTE")
    child2.put("field", "proposal.aggregateLimitInr")
    child2.put("value", 50000000)
    var children = new ArrayList<Map<String, Object>>()
    children.add(child1)
    children.add(child2)
    var logic = new HashMap<String, Object>()
    logic.put("operator", "AND")
    logic.put("children", children)
    var proposal = makeMinimalProposal()
    proposal.AggregateLimitInr = 5000000
    var result = LogicEvaluator.evaluate(logic, null, proposal)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorOR() {
    var child1 = new HashMap<String, Object>()
    child1.put("operator", "EQ")
    child1.put("field", "clause.existence")
    child1.put("value", "Required")
    var child2 = new HashMap<String, Object>()
    child2.put("operator", "EQ")
    child2.put("field", "clause.existence")
    child2.put("value", "Suggested")
    var children = new ArrayList<Map<String, Object>>()
    children.add(child1)
    children.add(child2)
    var logic = new HashMap<String, Object>()
    logic.put("operator", "OR")
    logic.put("children", children)
    var clause = new Clause()
    clause.Existence = "Suggested"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  @Test
  function testEvaluatorNOT() {
    var child = new HashMap<String, Object>()
    child.put("operator", "EQ")
    child.put("field", "clause.existence")
    child.put("value", "Forbidden")
    var children = new ArrayList<Map<String, Object>>()
    children.add(child)
    var logic = new HashMap<String, Object>()
    logic.put("operator", "NOT")
    logic.put("children", children)
    var clause = new Clause()
    clause.Existence = "Required"
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed, "NOT(existence==Forbidden) when existence=Required should pass")
  }

  @Test
  function testEvaluatorTYPE_IS() {
    var logic = new HashMap<String, Object>()
    logic.put("operator", "TYPE_IS")
    logic.put("field", "clause.limitMaxInr")
    logic.put("value", "Long")
    var clause = new Clause()
    clause.LimitMaxInr = 1000000L
    var result = LogicEvaluator.evaluate(logic, clause, null)
    Assertions.assertTrue(result.Passed)
  }

  // ─── ValueRef parser tests ────────────────────────────────────

  @Test
  function testValueRefSimple() {
    Assertions.assertTrue(LogicEvaluator.isValidValueRef("proposal.aggregateLimitInr"))
  }

  @Test
  function testValueRefWithMultiplier() {
    Assertions.assertTrue(LogicEvaluator.isValidValueRef("proposal.aggregateLimitInr * 0.5"))
  }

  @Test
  function testValueRefRejectsScript() {
    Assertions.assertFalse(LogicEvaluator.isValidValueRef("System.exit(0)"))
  }

  @Test
  function testValueRefRejectsEval() {
    Assertions.assertFalse(LogicEvaluator.isValidValueRef("eval('alert(1)')"))
  }

  @Test
  function testValueRefRejectsEmpty() {
    Assertions.assertFalse(LogicEvaluator.isValidValueRef(""))
    Assertions.assertFalse(LogicEvaluator.isValidValueRef(null))
  }

  @Test
  function testValueRefResolve() {
    var proposal = makeMinimalProposal()
    proposal.AggregateLimitInr = 5000000
    var result = LogicEvaluator.resolveValueRef("proposal.aggregateLimitInr * 0.5", null, proposal)
    Assertions.assertEquals(new BigDecimal("2500000.0"), result)
  }

  // ─── Demo fixture tests ───────────────────────────────────────

  @Test
  function testBlockedFixtureIsBlocked() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_blocked.json")
    var verdict = gate.verify(proposal)
    Assertions.assertEquals(VerdictStatus.BLOCKED, verdict.Status,
      "Blocked fixture should produce BLOCKED verdict")
  }

  @Test
  function testBlockedFixtureRNG002Failed() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_blocked.json")
    var verdict = gate.verify(proposal)

    // Find CYB-RNG-002 on the extortion clause
    var rng002Nodes = new ArrayList<provenpath.contracts.NodeResult>()
    for (var node in verdict.Nodes) {
      if (node.RuleCode == "CYB-RNG-002") {
        rng002Nodes.add(node)
      }
    }
    Assertions.assertFalse(rng002Nodes.isEmpty(), "Should have CYB-RNG-002 node")
    var failedNode = rng002Nodes.get(0)
    Assertions.assertEquals(NodeStatus.FAILED, failedNode.Result,
      "CYB-RNG-002 should be FAILED for extortion at 80%")
    Assertions.assertEquals("2500000.0", failedNode.Expected,
      "Expected value should be 50% of aggregate = 2500000")
    Assertions.assertEquals("4000000", failedNode.Actual,
      "Actual value should be 4000000")
  }

  @Test
  function testBlockedFixtureCON001Skipped() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_blocked.json")
    var verdict = gate.verify(proposal)

    // CYB-CON-001 depends on CYB-RNG-002 which failed, so CON-001 should be SKIPPED
    var con001Found = false
    for (var node in verdict.Nodes) {
      if (node.RuleCode == "CYB-CON-001") {
        Assertions.assertEquals(NodeStatus.SKIPPED, node.Result,
          "CYB-CON-001 should be SKIPPED because CYB-RNG-002 failed")
        con001Found = true
      }
    }
    Assertions.assertTrue(con001Found, "Should have CYB-CON-001 node")
  }

  @Test
  function testFixedFixturePasses() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    var verdict = gate.verify(proposal)
    Assertions.assertEquals(VerdictStatus.PASSED, verdict.Status,
      "Fixed fixture should produce PASSED verdict")
    Assertions.assertNotNull(verdict.GateToken, "PASSED verdict should have a gate token")
  }

  @Test
  function testFixedFixtureTokenVerifies() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    var verdict = gate.verify(proposal)
    Assertions.assertTrue(
      GateToken.verify(verdict.GateToken, verdict.RunId, verdict.ProposalHash, verdict.RulesetHash),
      "Gate token should verify successfully")
  }

  @Test
  function testTamperedProposalHashRejected() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    var verdict = gate.verify(proposal)
    // Tamper with proposal hash
    Assertions.assertFalse(
      GateToken.verify(verdict.GateToken, verdict.RunId, "tampered-hash", verdict.RulesetHash),
      "Tampered proposal hash should be rejected")
  }

  // ─── Tamper test (SOURCE layer) ───────────────────────────────

  @Test
  function testTamperedCitationSnippetBlocked() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    // Tamper with one citation snippet by changing one character
    if (proposal.Clauses != null && !proposal.Clauses.isEmpty()) {
      var firstClause = proposal.Clauses.get(0)
      if (firstClause.Citations != null && !firstClause.Citations.isEmpty()) {
        var origSnippet = firstClause.Citations.get(0).TextSnippet
        firstClause.Citations.get(0).TextSnippet = origSnippet.substring(0, origSnippet.length() - 1) + "X"
      }
    }
    var verdict = gate.verify(proposal)
    Assertions.assertEquals(VerdictStatus.BLOCKED, verdict.Status,
      "Tampered citation snippet should cause BLOCKED at SOURCE layer")
  }

  // ─── Injected "compliant": true test ──────────────────────────

  @Test
  function testInjectedCompliantTrueStillBlocked() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    // Load the blocked proposal JSON, add "compliant": true, re-parse
    var file = new File(_fixturesDir, "proposal_demo_blocked.json")
    var json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
    // Inject "compliant": true into the JSON
    var injected = json.replaceFirst("\\{", "{\"compliant\":true,")
    var proposal = Json.parse(injected, Proposal)
    var verdict = gate.verify(proposal)
    Assertions.assertEquals(VerdictStatus.BLOCKED, verdict.Status,
      "Injected 'compliant': true should still produce BLOCKED")
  }

  // ─── Unmatched clause → NEEDS_REVIEW → BLOCKED ───────────────

  @Test
  function testUnmatchedClauseNeedsReview() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    // Add a clause with a patternCode that no rule covers
    var unknownClause = new Clause()
    unknownClause.ClauseId = "unknown-clause-001"
    unknownClause.Kind = ClauseKind.COVERAGE
    unknownClause.PatternCode = "SMCyberUnknownCov"
    unknownClause.Name = "Unknown Coverage"
    unknownClause.Category = "CyberFirstParty"
    unknownClause.OwningEntityType = "SMCyberLine"
    unknownClause.Existence = "Suggested"
    unknownClause.LimitMaxInr = 100000L
    unknownClause.DeductibleInr = 5000L
    unknownClause.Conditions = new ArrayList<String>()
    unknownClause.Factors = new HashMap<String, BigDecimal>()
    unknownClause.ExcludesPatternCodes = new ArrayList<String>()
    unknownClause.Citations = new ArrayList<provenpath.contracts.Citation>()
    var cit = new provenpath.contracts.Citation()
    cit.SourceCode = "SMCYBER-PC-SPEC-1"
    cit.Section = "1"
    cit.TextSnippet = "SMCyber clause pattern codes follow SMCyber[A-Za-z]+(Cov|Excl)"
    unknownClause.Citations.add(cit)

    proposal.Clauses.add(unknownClause)
    var verdict = gate.verify(proposal)

    // Should have a NEEDS_REVIEW node and be BLOCKED
    var hasNeedsReview = false
    for (var node in verdict.Nodes) {
      if (node.Result == NodeStatus.NEEDS_REVIEW) {
        hasNeedsReview = true
      }
    }
    Assertions.assertTrue(hasNeedsReview, "Unmatched clause should produce NEEDS_REVIEW node")
    Assertions.assertEquals(VerdictStatus.BLOCKED, verdict.Status,
      "NEEDS_REVIEW should cause BLOCKED verdict")
  }

  // ─── Grounding test ───────────────────────────────────────────

  @Test
  function testGroundingMismatchFails() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var gate = new Gate(loader)
    var proposal = loadProposal("proposal_demo_fixed.json")
    // Change prose to say ₹40L while the extortion clause says 2000000 (₹20L)
    proposal.ProseSummary = proposal.ProseSummary.replace("₹20L", "₹40L")
    var verdict = gate.verify(proposal)
    Assertions.assertEquals(VerdictStatus.BLOCKED, verdict.Status,
      "Prose saying ₹40L while clause says 2000000 should cause BLOCKED")
  }

  // ─── Determinism test ─────────────────────────────────────────

  @Test
  function testDeterminism50Runs() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()
    var proposal = loadProposal("proposal_demo_fixed.json")

    var firstHash : String = null
    var i = 0
    while (i < 50) {
      var gate = new Gate(loader)
      var verdict = gate.verify(proposal)
      if (firstHash == null) {
        firstHash = verdict.VerdictHash
      } else {
        Assertions.assertEquals(firstHash, verdict.VerdictHash,
          "Verdict hash should be identical across all 50 runs (mismatch at run " + i + ")")
      }
      i++
    }
  }

  @Test
  function testRoundTripCamelCase() {
    var proposal = loadProposal("proposal_demo_fixed.json")
    var json = Json.canonical(proposal)
    Assertions.assertTrue(json.contains("\"proposalId\":"), "JSON should contain camelCase proposalId")
    Assertions.assertTrue(json.contains("\"aggregateLimitInr\":"), "JSON should contain camelCase aggregateLimitInr")
    Assertions.assertTrue(json.contains("\"clauses\":"), "JSON should contain camelCase clauses")
    Assertions.assertTrue(json.contains("\"patternCode\":"), "JSON should contain camelCase patternCode")
    Assertions.assertFalse(json.contains("\"ProposalId\":"), "JSON should NOT contain PascalCase ProposalId")
    Assertions.assertFalse(json.contains("\"AggregateLimitInr\":"), "JSON should NOT contain PascalCase AggregateLimitInr")
    var reloaded = Json.parse(json, Proposal)
    Assertions.assertEquals(proposal.ProposalId, reloaded.ProposalId)
    Assertions.assertEquals(proposal.AggregateLimitInr, reloaded.AggregateLimitInr)
    Assertions.assertEquals(proposal.Clauses.size(), reloaded.Clauses.size())
  }

  // ─── Eval corpus test ─────────────────────────────────────────

  @Test
  function testEvalCorpusZeroFalsePass() {
    var loader = new RuleLoader(_rulesDir)
    loader.load()

    var corpusDir = new File("../eval/corpus")
    if (!corpusDir.exists()) {
      corpusDir = new File("../../eval/corpus")
    }
    if (!corpusDir.exists()) {
      // Skip if corpus doesn't exist yet
      System.out.println("WARN: eval/corpus not found, skipping eval test")
      return
    }

    var files = corpusDir.listFiles()
    if (files == null || files.length == 0) return

    var falsePassCount = 0
    for (var file in files) {
      if (!file.getName().endsWith(".json")) continue
      var json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
      var mapper = Json.MAPPER
      var tree = mapper.readTree(json)
      var expectedStr = tree.get("expected").asText()
      var proposalNode = tree.get("proposal")
      var proposal = mapper.treeToValue(proposalNode, Proposal)
      var gate = new Gate(loader)
      var verdict = gate.verify(proposal)
      if (expectedStr == "BLOCKED" && verdict.Status == VerdictStatus.PASSED) {
        falsePassCount++
        System.out.println("FALSE PASS: " + file.getName())
      }
    }
    Assertions.assertEquals(0, falsePassCount,
      "False pass count should be 0, but got " + falsePassCount)
  }

  // ─── Helper functions ─────────────────────────────────────────

  private static function loadProposal(filename : String) : Proposal {
    var file = new File(_fixturesDir, filename)
    var json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
    return Json.parse(json, Proposal)
  }

  private static function makeMinimalProposal() : Proposal {
    var p = new Proposal()
    p.ProposalId = "test-001"
    p.ExecutionId = "exec-test-001"
    p.Iteration = 1
    p.Line = "SMCyber"
    p.AggregateLimitInr = 5000000
    p.TurnoverInr = 200000000
    p.MinimumPremiumInr = 25000
    p.TargetEffectiveDate = java.time.LocalDate.of(2026, 10, 1)
    p.Jurisdiction = "IN"
    p.Clauses = new ArrayList<Clause>()
    p.ProseSummary = ""
    p.LlmMeta = new HashMap<String, Object>()
    return p
  }

  private static function deleteRecursive(file : File) {
    if (file.isDirectory()) {
      var children = file.listFiles()
      if (children != null) {
        for (var child in children) {
          deleteRecursive(child)
        }
      }
    }
    file.delete()
  }
}
