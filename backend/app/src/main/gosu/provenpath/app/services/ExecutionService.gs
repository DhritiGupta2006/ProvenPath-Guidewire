package provenpath.app.services

uses java.util.Map
uses java.util.UUID
uses java.util.concurrent.ExecutorService
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.contracts.PlannerPort
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus

/**
 * Execution lifecycle:
 *   planning → verified_fail                       (still BLOCKED after the planner's repairs)
 *   planning → review_pending → approved | rejected (PASSED → named Compliance Reviewer decides)
 *   approved → deploying → deployed | deploy_failed (deploy_failed may be redeployed)
 *   any → error                                     (planner crashed; the error is in the event log)
 */
class ExecutionService {

  var _repo : Repository
  var _bus : EventBus
  var _verify : VerifyService
  var _planner : PlannerPort
  var _plannerError : String
  var _mode : String
  var _executor : ExecutorService

  construct(repo : Repository, bus : EventBus, verify : VerifyService, planner : PlannerPort, plannerError : String,
            mode : String, executor : ExecutorService) {
    _repo = repo
    _bus = bus
    _verify = verify
    _planner = planner
    _plannerError = plannerError
    _mode = mode
    _executor = executor
  }

  /** Creates the execution and starts the planner in the background. Returns the execution id immediately. */
  function start(prompt : String) : String {
    var id = create(prompt, _mode)
    if (_executor == null) {
      runPlanner(id, prompt)
    } else {
      _executor.execute(\ -> runPlanner(id, prompt))
    }
    return id
  }

  /** Creates an execution without running the planner (used by the MCP tools). */
  function create(prompt : String, mode : String) : String {
    if (prompt == null or prompt.trim().Empty) {
      throw new ApiException(400, "prompt_required", "prompt is required")
    }
    var id = "exec-" + UUID.randomUUID().toString()
    _repo.insertExecution(id, prompt.trim(), mode)
    _bus.emit(id, "run.started", VerifyService.map({"prompt" -> prompt.trim(), "mode" -> mode}))
    return id
  }

  function runPlanner(id : String, prompt : String) {
    try {
      if (_planner == null) {
        throw new IllegalStateException("No planner available: " + _plannerError)
      }
      var verdict = _planner.run(id, prompt.trim(), _verify, _bus)
      afterVerification(id, verdict)
    } catch (e : Throwable) {
      _repo.setExecutionStatus(id, "error")
      _bus.emit(id, "run.completed", VerifyService.map({"status" -> "error", "error" -> String.valueOf(e.Message ?: e.toString())}))
    }
  }

  /** Moves the execution on after a verdict: PASSED → review queue, BLOCKED → stays blocked. */
  function afterVerification(id : String, verdict : Verdict) {
    if (verdict == null) {
      throw new IllegalStateException("planner returned no verdict")
    }
    var run = _repo.run(verdict.RunId)
    if (run == null or run.get("execution_id") != id) {
      // The verdict must come from VerifyService for THIS execution; anything else is ignored.
      throw new IllegalStateException("verdict " + verdict.RunId + " was not produced by the verifier for " + id)
    }
    var iterations = run.get("iteration") as int
    if (verdict.Status == VerdictStatus.PASSED) {
      _repo.setExecutionStatus(id, "review_pending")
      _bus.emit(id, "review.requested", VerifyService.map({
          "runId" -> verdict.RunId, "iteration" -> iterations, "verdictHash" -> verdict.VerdictHash,
          "reviewers" -> _repo.users().where(\ u -> u.get("role") == "reviewer").map(\ u -> u.get("full_name"))}))
    } else {
      _repo.setExecutionStatus(id, "verified_fail")
      _bus.emit(id, "run.completed", VerifyService.map({"status" -> "blocked", "iterations" -> iterations, "runId" -> verdict.RunId}))
    }
  }
}
