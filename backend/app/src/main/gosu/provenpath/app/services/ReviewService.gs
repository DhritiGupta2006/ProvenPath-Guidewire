package provenpath.app.services

uses java.util.Map
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus

/**
 * The named Compliance Reviewer checkpoint (invariant 9). A decision is only accepted for the
 * LATEST run of an execution, that run must be PASSED, and a rejection must carry a reason.
 */
class ReviewService {

  var _repo : Repository
  var _bus : EventBus

  construct(repo : Repository, bus : EventBus) {
    _repo = repo
    _bus = bus
  }

  function decide(executionId : String, runId : String, reviewerId : String, decision : String, comment : String) : Map<String, Object> {
    var normalized = normalize(decision)
    var exec = _repo.execution(executionId)
    if (exec == null) {
      throw new ApiException(404, "unknown_execution", "execution not found: " + executionId)
    }
    if (exec.get("status") != "review_pending") {
      throw new ApiException(409, "not_reviewable", "execution is '" + exec.get("status") + "', only 'review_pending' can be reviewed")
    }
    var latest = _repo.latestRun(executionId)
    if (latest == null or latest.get("id") != runId) {
      throw new ApiException(409, "stale_run", "reviews must target the latest verification run (" + latest?.get("id") + ")")
    }
    if (latest.get("status") != "PASSED" or latest.get("gate_token") == null) {
      throw new ApiException(409, "run_not_passed", "only a PASSED run can be reviewed")
    }
    var reviewer = _repo.user(reviewerId)
    if (reviewer == null or reviewer.get("role") != "reviewer") {
      throw new ApiException(400, "invalid_reviewer", "reviewerId must be a user with the 'reviewer' role")
    }
    var cleanComment = comment?.trim()
    if (normalized == "rejected" and (cleanComment == null or cleanComment.Empty)) {
      throw new ApiException(400, "comment_required", "a rejection must include a comment explaining why")
    }
    var toState = normalized == "approved" ? "approved" : "rejected"
    if (!_repo.transitionExecution(executionId, {"review_pending"}, toState)) {
      throw new ApiException(409, "not_reviewable", "execution changed state concurrently")
    }
    var reviewId = _repo.insertReview(executionId, runId, reviewerId, normalized, cleanComment)
    _repo.setProposalStatus(latest.get("proposal_row_id") as String, toState)
    _bus.emit(executionId, "review.decided", VerifyService.map({
        "runId" -> runId, "reviewId" -> reviewId, "decision" -> normalized, "reviewer" -> reviewer.get("full_name"),
        "reviewerId" -> reviewerId, "comment" -> cleanComment}))
    if (normalized == "rejected") {
      _bus.emit(executionId, "run.completed", VerifyService.map({"status" -> "rejected", "runId" -> runId}))
    }
    return VerifyService.map({"reviewId" -> reviewId, "executionId" -> executionId, "runId" -> runId,
        "decision" -> normalized, "status" -> toState})
  }

  private static function normalize(decision : String) : String {
    var d = decision?.trim()?.toLowerCase()
    if (d == "approve" or d == "approved") {
      return "approved"
    }
    if (d == "reject" or d == "rejected") {
      return "rejected"
    }
    throw new ApiException(400, "invalid_decision", "decision must be 'approve' or 'reject'")
  }
}
