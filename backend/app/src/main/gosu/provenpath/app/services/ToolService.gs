package provenpath.app.services

uses java.util.ArrayList
uses java.util.List
uses java.util.Map
uses java.util.UUID
uses java.util.concurrent.ConcurrentHashMap
uses provenpath.app.ApiException
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.contracts.Clause
uses provenpath.contracts.Json
uses provenpath.contracts.Proposal

/**
 * The 4 MCP tools (propose_product, add_coverage, verify_compliance, deploy_product) as plain
 * backend operations, so ANY agent (the Next.js MCP route, Claude Desktop, MCP Inspector) goes
 * through the same gate. Draft proposals live in memory until they are verified (then persisted).
 */
class ToolService {

  static final var TOOLS : List<String> = {"propose_product", "add_coverage", "verify_compliance", "deploy_product"}

  var _repo : Repository
  var _bus : EventBus
  var _executions : ExecutionService
  var _verify : VerifyService
  var _deployments : DeploymentService
  var _drafts = new ConcurrentHashMap<String, Draft>()

  static class Draft {
    var _proposal : Proposal as P
    var _verified : boolean as Verified
  }

  construct(repo : Repository, bus : EventBus, executions : ExecutionService, verify : VerifyService, deployments : DeploymentService) {
    _repo = repo
    _bus = bus
    _executions = executions
    _verify = verify
    _deployments = deployments
  }

  function call(name : String, args : Map<String, Object>) : Map<String, Object> {
    if (!TOOLS.contains(name)) {
      throw new ApiException(404, "unknown_tool", "unknown tool '" + name + "'; available: " + TOOLS)
    }
    var a = args ?: new java.util.LinkedHashMap<String, Object>()
    var executionId = a.get("executionId") as String
    if (executionId == null) {
      if (name != "propose_product") {
        throw new ApiException(400, "execution_required", "executionId is required for " + name)
      }
      executionId = _executions.create((a.get("prompt") as String) ?: "External agent via MCP", "mcp")
    } else if (_repo.execution(executionId) == null) {
      throw new ApiException(404, "unknown_execution", "execution not found: " + executionId)
    }
    _bus.emit(executionId, "tool.called", VerifyService.map({"tool" -> name, "args" -> a}))
    var result : Map<String, Object>
    switch (name) {
      case "propose_product":
        result = proposeProduct(executionId, a)
        break
      case "add_coverage":
        result = addCoverage(executionId, a)
        break
      case "verify_compliance":
        result = verifyCompliance(executionId)
        break
      default:
        result = _deployments.deploy(executionId)
    }
    _bus.emit(executionId, "tool.result", VerifyService.map({"tool" -> name, "result" -> result}))
    var out = VerifyService.map({"executionId" -> executionId})
    out.putAll(result)
    return out
  }

  private function proposeProduct(executionId : String, a : Map<String, Object>) : Map<String, Object> {
    var p = Json.MAPPER.convertValue(a, Proposal)
    p.ExecutionId = executionId
    p.ProposalId = p.ProposalId ?: "PP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
    p.Iteration = nextIteration(executionId)
    p.Line = p.Line ?: "SMCyber"
    p.Jurisdiction = p.Jurisdiction ?: "IN"
    if (p.Clauses == null) {
      p.Clauses = new ArrayList<Clause>()
    }
    var d = new Draft()
    d.P = p
    _drafts.put(executionId, d)
    return VerifyService.map({"proposalId" -> p.ProposalId, "iteration" -> p.Iteration, "clauseCount" -> p.Clauses.size()})
  }

  private function addCoverage(executionId : String, a : Map<String, Object>) : Map<String, Object> {
    var d = editableDraft(executionId)
    var incoming = new ArrayList<Clause>()
    if (a.get("clause") != null) {
      incoming.add(Json.MAPPER.convertValue(a.get("clause"), Clause))
    }
    if (a.get("clauses") != null) {
      for (c in a.get("clauses") as List<Object>) {
        incoming.add(Json.MAPPER.convertValue(c, Clause))
      }
    }
    if (incoming.Empty) {
      throw new ApiException(400, "clause_required", "add_coverage needs 'clause' or 'clauses'")
    }
    for (c in incoming) {
      if (c.ClauseId == null) {
        c.ClauseId = "c-" + UUID.randomUUID().toString().substring(0, 8)
      }
      d.P.Clauses.removeWhere(\ existing -> existing.ClauseId == c.ClauseId)
      d.P.Clauses.add(c)
    }
    if (a.get("proseSummary") != null) {
      d.P.ProseSummary = a.get("proseSummary") as String
    }
    return VerifyService.map({"proposalId" -> d.P.ProposalId, "iteration" -> d.P.Iteration, "clauseCount" -> d.P.Clauses.size(),
        "clauseIds" -> incoming.map(\ c -> c.ClauseId)})
  }

  private function verifyCompliance(executionId : String) : Map<String, Object> {
    var d = _drafts.get(executionId)
    if (d == null) {
      throw new ApiException(409, "no_draft", "call propose_product first")
    }
    var v = _verify.verify(d.P)
    d.Verified = true
    _executions.afterVerification(executionId, v)
    return VerifyService.map({"runId" -> v.RunId, "status" -> v.Status.name(), "verdictHash" -> v.VerdictHash,
        "failedRules" -> v.Nodes.where(\ n -> n.Result.name() == "FAILED").map(\ n -> n.RuleCode).toSet().toList()})
  }

  /** Editing a verified draft starts the next iteration (the verified one stays immutable in the DB). */
  private function editableDraft(executionId : String) : Draft {
    var d = _drafts.get(executionId)
    if (d == null) {
      throw new ApiException(409, "no_draft", "call propose_product first")
    }
    if (d.Verified) {
      var copy = Json.parse(Json.canonical(d.P), Proposal)
      copy.Iteration = nextIteration(executionId)
      var next = new Draft()
      next.P = copy
      _drafts.put(executionId, next)
      _repo.setExecutionStatus(executionId, "planning")
      return next
    }
    return d
  }

  private function nextIteration(executionId : String) : int {
    var stored = _repo.proposalsForExecution(executionId)
    var max = 0
    for (row in stored) {
      max = Math.max(max, row.get("iteration") as int)
    }
    var d = _drafts.get(executionId)
    if (d != null) {
      max = Math.max(max, d.P.Iteration)
    }
    return max + 1
  }
}
