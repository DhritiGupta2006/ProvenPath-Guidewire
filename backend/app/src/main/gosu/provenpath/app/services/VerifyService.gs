package provenpath.app.services

uses java.util.ArrayList
uses java.util.HashMap
uses java.util.LinkedHashMap
uses java.util.List
uses java.util.Map
uses java.util.UUID
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.contracts.Json
uses provenpath.contracts.NodeResult
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.Proposal
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.VerifyPort
uses provenpath.core.engine.RuleLoader
uses provenpath.core.gate.Gate

/**
 * The only way a verdict is produced in the app. Wraps the deterministic Gate, persists the
 * proposal, the run and every node, and streams the result as events. The caller (planner, tools)
 * gets the Verdict exactly as the Gate returned it.
 */
class VerifyService implements VerifyPort {

  var _gate : Gate
  var _loader : RuleLoader
  var _repo : Repository
  var _bus : EventBus
  var _nodeDelayMs : long
  var _snapshots : Map<String, String>

  construct(gate : Gate, loader : RuleLoader, repo : Repository, bus : EventBus, nodeDelayMs : long) {
    _gate = gate
    _loader = loader
    _repo = repo
    _bus = bus
    _nodeDelayMs = nodeDelayMs
    _snapshots = new HashMap<String, String>()
    for (r in loader.Rules) {
      _snapshots.put(r.RuleCode, Json.canonical(r.Logic))
    }
  }

  property get RulesetHash() : String {
    return _loader.RulesetHash
  }

  /** Stateless check (no persistence, no events). Used by POST /verify, replay and the tamper button. */
  function check(p : Proposal) : Verdict {
    return _gate.verify(p)
  }

  override function verify(p : Proposal) : Verdict {
    if (p == null) {
      throw new ApiException(400, "invalid_proposal", "proposal is required")
    }
    if (p.ExecutionId == null or _repo.execution(p.ExecutionId) == null) {
      throw new ApiException(400, "unknown_execution", "proposal.executionId must reference an existing execution")
    }
    if (p.ProposalId == null) {
      p.ProposalId = "PP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
    }
    if (p.Iteration <= 0) {
      p.Iteration = 1
    }
    var exec = p.ExecutionId
    var rowId = _repo.upsertProposal(p)
    _bus.emit(exec, "proposal.created", map({
        "proposalId" -> p.ProposalId, "iteration" -> p.Iteration,
        "clauses" -> (p.Clauses == null ? 0 : p.Clauses.size()), "aggregateLimitInr" -> p.AggregateLimitInr}))

    var started = System.currentTimeMillis()
    var verdict = _gate.verify(p)
    var duration = (System.currentTimeMillis() - started) as int
    _repo.insertRun(exec, rowId, p.Iteration, verdict, _snapshots, duration)

    _bus.emit(exec, "verify.started", map({
        "runId" -> verdict.RunId, "iteration" -> p.Iteration, "proposalId" -> p.ProposalId,
        "ruleCount" -> _loader.Rules.size(), "nodeCount" -> verdict.Nodes.size(), "rulesetHash" -> verdict.RulesetHash}))
    for (n in verdict.Nodes) {
      _bus.emit(exec, "verify.node", nodePayload(verdict.RunId, n))
      if (_nodeDelayMs > 0) {
        Thread.sleep(_nodeDelayMs)
      }
    }

    if (verdict.Status == VerdictStatus.BLOCKED) {
      var failures = new ArrayList<Map<String, Object>>()
      var failed = new ArrayList<String>()
      var skipped = new ArrayList<String>()
      var review = new ArrayList<String>()
      for (n in verdict.Nodes) {
        if (n.Result == NodeStatus.FAILED or n.Result == NodeStatus.NEEDS_REVIEW) {
          failures.add(nodePayload(verdict.RunId, n))
        }
        if (n.Result == NodeStatus.FAILED and !failed.contains(n.RuleCode)) failed.add(n.RuleCode)
        if (n.Result == NodeStatus.SKIPPED and !skipped.contains(n.RuleCode)) skipped.add(n.RuleCode)
        if (n.Result == NodeStatus.NEEDS_REVIEW and !review.contains(n.ClauseId)) review.add(n.ClauseId)
      }
      _repo.setProposalStatus(rowId, "verified_fail")
      _bus.emit(exec, "gate.blocked", map({
          "runId" -> verdict.RunId, "iteration" -> p.Iteration, "verdictHash" -> verdict.VerdictHash,
          "failedRules" -> failed, "skippedRules" -> skipped, "needsReviewClauses" -> review, "failures" -> failures,
          "writtenToPolicyCenter" -> 0}))
    } else {
      _repo.setProposalStatus(rowId, "verified_pass")
      _bus.emit(exec, "gate.passed", map({
          "runId" -> verdict.RunId, "iteration" -> p.Iteration, "verdictHash" -> verdict.VerdictHash,
          "proposalHash" -> verdict.ProposalHash, "rulesetHash" -> verdict.RulesetHash, "nodeCount" -> verdict.Nodes.size()}))
    }
    return verdict
  }

  static function nodePayload(runId : String, n : NodeResult) : Map<String, Object> {
    return map({
        "runId" -> runId, "ruleCode" -> n.RuleCode, "clauseId" -> n.ClauseId, "layer" -> n.Layer?.name(),
        "result" -> n.Result.name(), "expected" -> n.Expected, "actual" -> n.Actual, "reason" -> n.Reason,
        "sourceCode" -> n.SourceCode})
  }

  /** Insertion-ordered copy, so JSON payloads keep a readable key order. */
  static function map(m : Map<String, Object>) : Map<String, Object> {
    return new LinkedHashMap<String, Object>(m)
  }
}
