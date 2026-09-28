package provenpath.planner

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.ArrayList
uses java.util.LinkedHashMap
uses java.util.Map
uses provenpath.contracts.EventPort
uses provenpath.contracts.Json
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.PlannerPort
uses provenpath.contracts.Proposal
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.VerifyPort

/**
 * Internal fallback used by Planner when Gemini is unavailable or fails.
 * Replays the same fixture files as FixturePlanner in :app, but defined here in :planner
 * so the module compiles without a dependency on :app.
 *
 * Event shapes must match FixturePlanner exactly (the UI depends on them).
 */
class FixtureFallback implements PlannerPort {

  var _fixturesDir : String

  construct(fixturesDir : String) {
    _fixturesDir = fixturesDir
  }

  override function run(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict {
    var proposalId = "PP-" + executionId.substring(Math.max(0, executionId.length() - 8)).toUpperCase()

    var first = load("proposal_demo_blocked.json", executionId, proposalId, 1)
    emit(events, executionId, "planner.step", m({"step" -> 1, "action" -> "propose_product",
        "note" -> "Decompose the request into an SMCyber product on GLLine", "mode" -> "live-fallback"}))
    emit(events, executionId, "tool.called", m({"tool" -> "propose_product",
        "args" -> m({"line" -> "SMCyber", "aggregateLimitInr" -> first.AggregateLimitInr, "turnoverInr" -> first.TurnoverInr})}))
    emit(events, executionId, "tool.result", m({"tool" -> "propose_product",
        "result" -> m({"proposalId" -> proposalId, "iteration" -> 1})}))

    emit(events, executionId, "planner.step", m({"step" -> 2, "action" -> "add_coverage",
        "note" -> "Add mandatory coverages, exclusions and rating", "mode" -> "live-fallback"}))
    emit(events, executionId, "tool.called", m({"tool" -> "add_coverage",
        "args" -> m({"clauses" -> first.Clauses.map(\ c -> c.PatternCode)})}))
    emit(events, executionId, "tool.result", m({"tool" -> "add_coverage",
        "result" -> m({"clauseCount" -> first.Clauses.size()})}))

    emit(events, executionId, "planner.step", m({"step" -> 3, "action" -> "verify_compliance",
        "note" -> "Hand the proposal to the deterministic gate", "mode" -> "live-fallback"}))
    emit(events, executionId, "tool.called", m({"tool" -> "verify_compliance",
        "args" -> m({"proposalId" -> proposalId, "iteration" -> 1})}))
    var verdict = verifier.verify(first)
    emit(events, executionId, "tool.result", m({"tool" -> "verify_compliance",
        "result" -> m({"runId" -> verdict.RunId, "status" -> verdict.Status.name(), "verdictHash" -> verdict.VerdictHash})}))

    if (verdict.Status == VerdictStatus.BLOCKED) {
      var failure = verdict.Nodes.firstWhere(\ n -> n.Result == NodeStatus.FAILED or n.Result == NodeStatus.NEEDS_REVIEW)
      emit(events, executionId, "planner.repair", m({
          "runId" -> verdict.RunId, "iteration" -> 2, "failedRule" -> failure?.RuleCode, "clauseId" -> failure?.ClauseId,
          "expected" -> failure?.Expected, "actual" -> failure?.Actual,
          "reason" -> (failure?.Reason ?: "blocked by the gate")}))

      var second = load("proposal_demo_fixed.json", executionId, proposalId, 2)
      emit(events, executionId, "planner.step", m({"step" -> 4, "action" -> "add_coverage",
          "note" -> "Repair: lower the extortion sublimit within the verified range", "mode" -> "live-fallback"}))
      emit(events, executionId, "tool.called", m({"tool" -> "add_coverage",
          "args" -> m({"clauseId" -> failure?.ClauseId, "limitMaxInr" -> changedLimit(second, failure?.ClauseId)})}))
      emit(events, executionId, "tool.result", m({"tool" -> "add_coverage",
          "result" -> m({"iteration" -> 2})}))

      emit(events, executionId, "planner.step", m({"step" -> 5, "action" -> "verify_compliance",
          "note" -> "Re-verify the repaired proposal", "mode" -> "live-fallback"}))
      emit(events, executionId, "tool.called", m({"tool" -> "verify_compliance",
          "args" -> m({"proposalId" -> proposalId, "iteration" -> 2})}))
      verdict = verifier.verify(second)
      emit(events, executionId, "tool.result", m({"tool" -> "verify_compliance",
          "result" -> m({"runId" -> verdict.RunId, "status" -> verdict.Status.name(), "verdictHash" -> verdict.VerdictHash})}))
    }
    return verdict
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

  private static function emit(events : EventPort, executionId : String, type : String, payload : Map<String, Object>) {
    events.emit(executionId, type, payload)
  }

  private static function m(kv : Map<String, Object>) : Map<String, Object> {
    return new LinkedHashMap<String, Object>(kv)
  }
}
