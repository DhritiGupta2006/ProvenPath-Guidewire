package provenpath.app.services

uses java.nio.charset.StandardCharsets
uses java.security.MessageDigest
uses java.util.List
uses java.util.Map
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.contracts.Json

/**
 * Endpoints for the ProvenPath PC Agent on the Guidewire VM (pull model). The agent long-polls for
 * the next queued package, re-verifies it itself, installs it into PolicyCenter and reports each step.
 */
class AgentService {

  static final var STEPS : List<String> = {"write", "restart", "ready", "verified", "failed"}

  var _repo : Repository
  var _bus : EventBus
  var _agentKey : String
  var _pollMs : long

  construct(repo : Repository, bus : EventBus, agentKey : String, pollMs : long) {
    _repo = repo
    _bus = bus
    _agentKey = agentKey
    _pollMs = pollMs
  }

  function authorize(authorizationHeader : String) {
    if (_agentKey == null or _agentKey.Empty) {
      throw new ApiException(503, "agent_key_not_configured", "PC_AGENT_KEY is not set on the backend")
    }
    var presented = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.substring(7).trim() : null
    if (presented == null or !MessageDigest.isEqual(presented.getBytes(StandardCharsets.UTF_8), _agentKey.getBytes(StandardCharsets.UTF_8))) {
      throw new ApiException(401, "unauthorized", "invalid agent key")
    }
  }

  /** Waits up to the long-poll window for a queued package. Returns null when there is nothing to do. */
  function next(agentName : String) : Map<String, Object> {
    var deadline = System.currentTimeMillis() + _pollMs
    while (true) {
      var row = _repo.claimNextQueuedDeployment()
      if (row != null) {
        var executionId = row.get("execution_id") as String
        var deploymentId = row.get("id") as String
        _bus.emit(executionId, "pc.pulled", VerifyService.map({"deploymentId" -> deploymentId, "agent" -> agentName}))
        return VerifyService.map({
            "deploymentId" -> deploymentId, "executionId" -> executionId, "runId" -> row.get("run_id"),
            "manifest" -> Json.MAPPER.readValue(row.get("manifest") as String, Map),
            "packageBase64" -> DeploymentService.b64(row.get("package_zip") as byte[])})
      }
      if (System.currentTimeMillis() >= deadline) {
        return null
      }
      Thread.sleep(500)
    }
  }

  function report(deploymentId : String, step : String, detail : String) : Map<String, Object> {
    var s = step?.trim()?.toLowerCase()
    if (s == null or !STEPS.contains(s)) {
      throw new ApiException(400, "invalid_step", "step must be one of " + STEPS)
    }
    var d = _repo.deployment(deploymentId)
    if (d == null) {
      throw new ApiException(404, "unknown_deployment", "deployment not found: " + deploymentId)
    }
    var current = d.get("status") as String
    if (current == "verified" or current == "failed" or current == "queued") {
      throw new ApiException(409, "invalid_transition", "deployment is '" + current + "'; cannot report '" + s + "'")
    }
    var executionId = d.get("execution_id") as String
    _repo.updateDeploymentStatus(deploymentId, s, detail)
    _bus.emit(executionId, "pc." + s, VerifyService.map({"deploymentId" -> deploymentId, "detail" -> detail}))
    if (s == "verified") {
      _repo.setExecutionStatus(executionId, "deployed")
      _bus.emit(executionId, "run.completed", VerifyService.map({"status" -> "deployed", "deploymentId" -> deploymentId}))
    } else if (s == "failed") {
      _repo.setExecutionStatus(executionId, "deploy_failed")
    }
    return VerifyService.map({"deploymentId" -> deploymentId, "status" -> s})
  }
}
