package provenpath.app.planner

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.Map
uses provenpath.app.services.VerifyService
uses provenpath.contracts.EventPort
uses provenpath.contracts.Json
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PlannerPort
uses provenpath.contracts.Proposal
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.VerifyPort

/**
 * LLM_MODE=fixture: replays the recorded demo proposals (fixtures/proposal_demo_blocked.json, then
 * proposal_demo_fixed.json) through the REAL verifier. No LLM call, fully offline, deterministic.
 * The live Gemini planner (Track C) implements the same PlannerPort.
 */
class FixturePlanner implements PlannerPort {

  var _fixturesDir : String

  construct(fixturesDir : String) {
    _fixturesDir = fixturesDir
  }

  override function run(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict {
    var proposalId = "PP-" + executionId.substring(executionId.length() - 8).toUpperCase()

    var first = load("proposal_demo_blocked.json", executionId, proposalId, 1)
    step(events, executionId, 1, "propose_product", "Decompose the request into an SMCyber product on GLLine")
    tool(events, executionId, "propose_product",
        VerifyService.map({"line" -> "SMCyber", "aggregateLimitInr" -> first.AggregateLimitInr, "turnoverInr" -> first.TurnoverInr}),
        VerifyService.map({"proposalId" -> proposalId, "iteration" -> 1}))
    step(events, executionId, 2, "add_coverage", "Add mandatory coverages, exclusions and rating")
    tool(events, executionId, "add_coverage", VerifyService.map({"clauses" -> first.Clauses.map(\ c -> c.PatternCode)}),
        VerifyService.map({"clauseCount" -> first.Clauses.size()}))
    step(events, executionId, 3, "verify_compliance", "Hand the proposal to the deterministic gate")
    var verdict = verifyVia(verifier, events, executionId, first)

    if (verdict.Status == VerdictStatus.BLOCKED) {
      var failure = verdict.Nodes.firstWhere(\ n -> n.Result == NodeStatus.FAILED or n.Result == NodeStatus.NEEDS_REVIEW)
      events.emit(executionId, "planner.repair", VerifyService.map({
          "runId" -> verdict.RunId, "iteration" -> 2, "failedRule" -> failure?.RuleCode, "clauseId" -> failure?.ClauseId,
          "expected" -> failure?.Expected, "actual" -> failure?.Actual,
          "reason" -> (failure?.Reason ?: "blocked by the gate")}))
      var second = load("proposal_demo_fixed.json", executionId, proposalId, 2)
      step(events, executionId, 4, "add_coverage", "Repair: lower the extortion sublimit within the verified range")
      tool(events, executionId, "add_coverage",
          VerifyService.map({"clauseId" -> failure?.ClauseId, "limitMaxInr" -> changedLimit(second, failure?.ClauseId)}),
          VerifyService.map({"iteration" -> 2}))
      step(events, executionId, 5, "verify_compliance", "Re-verify the repaired proposal")
      verdict = verifyVia(verifier, events, executionId, second)
    }
    return verdict
  }

  private function verifyVia(verifier : VerifyPort, events : EventPort, executionId : String, p : Proposal) : Verdict {
    events.emit(executionId, "tool.called", VerifyService.map({"tool" -> "verify_compliance",
        "args" -> VerifyService.map({"proposalId" -> p.ProposalId, "iteration" -> p.Iteration})}))
    var v = verifier.verify(p)
    events.emit(executionId, "tool.result", VerifyService.map({"tool" -> "verify_compliance",
        "result" -> VerifyService.map({"runId" -> v.RunId, "status" -> v.Status.name(), "verdictHash" -> v.VerdictHash})}))
    return v
  }

  private function load(file : String, executionId : String, proposalId : String, iteration : int) : Proposal {
    var f = new File(_fixturesDir, file)
    var p = Json.parse(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8), Proposal)
    p.ExecutionId = executionId
    p.ProposalId = proposalId
    p.Iteration = iteration
    return p
  }

  private static function changedLimit(p : Proposal, clauseId : String) : Object {
    var c = p.Clauses.firstWhere(\ x -> x.ClauseId == clauseId)
    return c?.LimitMaxInr
  }

  private static function step(events : EventPort, executionId : String, n : int, action : String, note : String) {
    events.emit(executionId, "planner.step", VerifyService.map({"step" -> n, "action" -> action, "note" -> note, "mode" -> "fixture"}))
  }

  private static function tool(events : EventPort, executionId : String, name : String, args : Map<String, Object>, result : Map<String, Object>) {
    events.emit(executionId, "tool.called", VerifyService.map({"tool" -> name, "args" -> args}))
    events.emit(executionId, "tool.result", VerifyService.map({"tool" -> name, "result" -> result}))
  }
}
