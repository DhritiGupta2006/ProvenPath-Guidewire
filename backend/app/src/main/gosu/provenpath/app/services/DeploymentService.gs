package provenpath.app.services

uses java.util.Base64
uses java.util.Map
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.contracts.Json
uses provenpath.contracts.PackageBuilderPort
uses provenpath.contracts.Proposal
uses provenpath.contracts.Signing
uses provenpath.core.gate.GateToken
uses provenpath.core.gate.Hashing

/**
 * The pre-commit gate on the write path. A PolicyCenter package is only built and queued when:
 *   - the execution is approved (or a previous deploy failed),
 *   - the approved review points at a PASSED run carrying a gate token,
 *   - the stored proposal still hashes to what was verified (no tampering in the DB),
 *   - the ruleset is unchanged since verification, and
 *   - the HMAC gate token verifies.
 * A BLOCKED execution therefore can never produce a package, so nothing reaches PolicyCenter.
 */
class DeploymentService {

  var _repo : Repository
  var _bus : EventBus
  var _builder : PackageBuilderPort
  var _builderError : String
  var _currentRulesetHash : String

  construct(repo : Repository, bus : EventBus, builder : PackageBuilderPort, builderError : String, currentRulesetHash : String) {
    _repo = repo
    _bus = bus
    _builder = builder
    _builderError = builderError
    _currentRulesetHash = currentRulesetHash
  }

  function deploy(executionId : String) : Map<String, Object> {
    var exec = _repo.execution(executionId)
    if (exec == null) {
      throw new ApiException(404, "unknown_execution", "execution not found: " + executionId)
    }
    var status = exec.get("status") as String
    if (status != "approved" and status != "deploy_failed") {
      throw new ApiException(409, "not_approved",
          "execution is '" + status + "'. Only an approved execution can be deployed; nothing was sent to PolicyCenter")
    }
    var review = _repo.latestApprovedReview(executionId)
    if (review == null) {
      throw new ApiException(409, "no_approved_review", "no approved Compliance Reviewer decision; nothing was sent to PolicyCenter")
    }
    var runId = review.get("run_id") as String
    var run = _repo.run(runId)
    if (run == null or run.get("status") != "PASSED" or run.get("gate_token") == null) {
      throw new ApiException(409, "run_not_passed", "the approved run is not PASSED; nothing was sent to PolicyCenter")
    }
    var proposalRow = _repo.proposalRow(run.get("proposal_row_id") as String)
    var proposal = Json.parse(proposalRow.get("proposal") as String, Proposal)
    var proposalHash = Hashing.hashObject(proposal)
    if (proposalHash != run.get("proposal_hash")) {
      throw new ApiException(409, "proposal_tampered",
          "stored proposal no longer matches the verified proposal hash; re-verification required")
    }
    if (run.get("ruleset_hash") != _currentRulesetHash) {
      throw new ApiException(409, "ruleset_changed", "rules changed since this run was verified; re-verification required")
    }
    if (!GateToken.verify(run.get("gate_token") as String, runId, proposalHash, run.get("ruleset_hash") as String)) {
      throw new ApiException(409, "invalid_gate_token", "gate token does not verify; nothing was sent to PolicyCenter")
    }
    if (_builder == null) {
      throw new ApiException(503, "exporter_unavailable", "PolicyCenter package builder is not available: " + _builderError)
    }
    if (!_repo.transitionExecution(executionId, {"approved", "deploy_failed"}, "deploying")) {
      throw new ApiException(409, "not_approved", "execution changed state concurrently")
    }
    try {
      var verdict = _repo.verdictForRun(runId)
      var pkg = _builder.build(proposal, verdict, review.get("id") as String, review.get("reviewer") as String)
      if (pkg == null or pkg.Manifest == null or pkg.ZipBytes == null) {
        throw new IllegalStateException("package builder returned an empty package")
      }
      if (pkg.Manifest.GateToken != verdict.GateToken or pkg.Manifest.VerdictHash != verdict.VerdictHash) {
        throw new IllegalStateException("package manifest does not carry the verified gate token / verdict hash")
      }
      // The PC agent recomputes the gate token from these and checks the manifest HMAC, so both must be right here.
      if (pkg.Manifest.RunId != runId or pkg.Manifest.ProposalHash != proposalHash or pkg.Manifest.RulesetHash != run.get("ruleset_hash")) {
        throw new IllegalStateException("package manifest is not bound to the approved run")
      }
      if (!Signing.verifySignature(pkg.Manifest, GateToken.getSecret())) {
        throw new IllegalStateException("package manifest signature does not verify")
      }
      var manifestJson = Json.canonical(pkg.Manifest)
      var deploymentId = _repo.insertDeployment(executionId, runId, review.get("id") as String, manifestJson, pkg.ZipBytes)
      _bus.emit(executionId, "pc.export", VerifyService.map({
          "deploymentId" -> deploymentId, "runId" -> runId, "productCode" -> pkg.Manifest.ProductCode,
          "files" -> (pkg.Manifest.Files == null ? 0 : pkg.Manifest.Files.size()), "packageBytes" -> pkg.ZipBytes.length,
          "manifestSha256" -> Hashing.sha256Hex(manifestJson)}))
      _bus.emit(executionId, "pc.queued", VerifyService.map({"deploymentId" -> deploymentId}))
      return VerifyService.map({"deploymentId" -> deploymentId, "executionId" -> executionId, "runId" -> runId, "status" -> "queued"})
    } catch (e : ApiException) {
      _repo.setExecutionStatus(executionId, "deploy_failed")
      throw e
    } catch (e : Exception) {
      _repo.setExecutionStatus(executionId, "deploy_failed")
      _bus.emit(executionId, "pc.failed", VerifyService.map({"stage" -> "export", "detail" -> String.valueOf(e.Message)}))
      throw new ApiException(500, "export_failed", "could not build the PolicyCenter package: " + e.Message)
    }
  }

  function summary(deploymentId : String) : Map<String, Object> {
    var d = _repo.deployment(deploymentId)
    if (d == null) {
      throw new ApiException(404, "unknown_deployment", "deployment not found: " + deploymentId)
    }
    var result = VerifyService.map(d)
    result.put("manifest", Json.MAPPER.readValue(d.get("manifest") as String, Map))
    return result
  }

  function packageZip(deploymentId : String) : byte[] {
    var zip = _repo.deploymentPackage(deploymentId)
    if (zip == null) {
      throw new ApiException(404, "unknown_deployment", "deployment not found: " + deploymentId)
    }
    return zip
  }

  static function b64(bytes : byte[]) : String {
    return Base64.getEncoder().encodeToString(bytes)
  }
}
