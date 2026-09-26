package provenpath.app

uses io.javalin.Javalin
uses io.javalin.http.Context
uses io.javalin.http.sse.SseClient
uses java.util.Map
uses java.util.concurrent.Executors
uses java.util.concurrent.ScheduledExecutorService
uses java.util.concurrent.TimeUnit
uses provenpath.app.events.ReplayingSubscriber
uses provenpath.contracts.Json
uses provenpath.contracts.Proposal
uses provenpath.app.services.VerifyService

/** HTTP routes. JSON in/out via the shared contracts ObjectMapper; errors as {error, message}. */
class Server {

  var _s : Services
  var _app : Javalin
  var _pinger : ScheduledExecutorService

  construct(services : Services) {
    _s = services
  }

  function start(port : int) : Javalin {
    _app = Javalin.create(\ cfg -> {
      cfg.showJavalinBanner = false
    })
    routes(_app)
    _app.start(port)
    return _app
  }

  function stop() {
    _pinger?.shutdownNow()
    _app?.stop()
  }

  private function routes(app : Javalin) {
    // CORS: Mission Control runs on another port (and on the VM everything is localhost).
    app.before(\ ctx -> {
      ctx.header("Access-Control-Allow-Origin", "*")
      ctx.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      ctx.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Last-Event-ID, ngrok-skip-browser-warning")
    })
    app.options("/*", \ ctx -> { ctx.status(204) })

    app.exception(ApiException, \ e, ctx -> {
      json(ctx, e.Status, VerifyService.map({"error" -> e.Code, "message" -> e.Message}))
    })
    app.exception(Exception, \ e, ctx -> {
      e.printStackTrace()
      json(ctx, 500, VerifyService.map({"error" -> "internal_error", "message" -> String.valueOf(e.Message ?: e.toString())}))
    })

    app.get("/api/v1/health", \ ctx -> {
      json(ctx, 200, VerifyService.map({"status" -> "ok", "rulesetHash" -> _s.Verify.RulesetHash, "llmMode" -> _s.LlmMode,
          "planner" -> (_s.PlannerStatus), "packageBuilder" -> (_s.BuilderStatus)}))
    })
    app.get("/api/v1/users", \ ctx -> { json(ctx, 200, _s.Repo.users()) })
    app.get("/api/v1/rules", \ ctx -> { json(ctx, 200, _s.Query.rules()) })
    app.get("/api/v1/metrics", \ ctx -> {
      ctx.contentType("application/json")
      ctx.result(_s.Query.metrics())
    })

    // ---- executions
    app.get("/api/v1/executions", \ ctx -> { json(ctx, 200, _s.Repo.listExecutions(50)) })
    app.post("/api/v1/executions", \ ctx -> {
      var body = body(ctx)
      var id = _s.Executions.start(body.get("prompt") as String)
      json(ctx, 202, VerifyService.map({"executionId" -> id, "stream" -> "/api/v1/executions/" + id + "/stream"}))
    })
    app.get("/api/v1/executions/{id}", \ ctx -> { json(ctx, 200, _s.Query.execution(ctx.pathParam("id"))) })
    app.post("/api/v1/executions/{id}/replay", \ ctx -> { json(ctx, 200, _s.Query.replay(ctx.pathParam("id"))) })
    app.sse("/api/v1/executions/{id}/stream", \ client -> stream(client))

    // ---- verification (stateless) and tools
    app.post("/api/v1/verify", \ ctx -> {
      var p = Json.parse(requireBody(ctx), Proposal)
      json(ctx, 200, _s.Verify.check(p))
    })
    app.post("/api/v1/tools/{name}", \ ctx -> { json(ctx, 200, _s.Tools.call(ctx.pathParam("name"), body(ctx))) })

    // ---- review + deployment
    app.post("/api/v1/reviews", \ ctx -> {
      var b = body(ctx)
      json(ctx, 201, _s.Reviews.decide(b.get("executionId") as String, b.get("runId") as String, b.get("reviewerId") as String,
          b.get("decision") as String, b.get("comment") as String))
    })
    app.post("/api/v1/deployments", \ ctx -> {
      json(ctx, 202, _s.Deployments.deploy(body(ctx).get("executionId") as String))
    })
    app.get("/api/v1/deployments/{id}", \ ctx -> { json(ctx, 200, _s.Deployments.summary(ctx.pathParam("id"))) })
    app.get("/api/v1/deployments/{id}/package", \ ctx -> {
      var zip = _s.Deployments.packageZip(ctx.pathParam("id"))
      ctx.contentType("application/zip")
      ctx.header("Content-Disposition", "attachment; filename=provenpath-" + ctx.pathParam("id") + ".zip")
      ctx.result(zip)
    })

    // ---- PC agent (pull model; bearer PC_AGENT_KEY)
    app.get("/api/v1/pc-agent/next", \ ctx -> {
      _s.Agent.authorize(ctx.header("Authorization"))
      var job = _s.Agent.next(ctx.queryParam("agent") ?: "pcagent")
      if (job == null) {
        ctx.status(204)
      } else {
        json(ctx, 200, job)
      }
    })
    app.post("/api/v1/pc-agent/status", \ ctx -> {
      _s.Agent.authorize(ctx.header("Authorization"))
      var b = body(ctx)
      json(ctx, 200, _s.Agent.report(b.get("deploymentId") as String, b.get("step") as String, b.get("detail") as String))
    })

    app.get("/api/v1/provenance/{clauseId}", \ ctx -> {
      json(ctx, 200, _s.Query.provenance(ctx.pathParam("clauseId"), ctx.queryParam("executionId")))
    })

    // SSE keep-alive comments so idle connections are not dropped by proxies.
    _pinger = Executors.newSingleThreadScheduledExecutor()
  }

  /** SSE: subscribe first, then replay stored history, then live, with no gaps or duplicates. */
  private function stream(client : SseClient) {
    client.keepAlive()
    var ctx = client.ctx()
    var executionId = ctx.pathParam("id")
    if (_s.Repo.execution(executionId) == null) {
      client.sendEvent("error", Json.canonical(VerifyService.map({"error" -> "unknown_execution", "executionId" -> executionId})), null)
      client.close()
      return
    }
    var after = parseInt(ctx.header("Last-Event-ID") ?: ctx.queryParam("after"))
    var sub = new ReplayingSubscriber(after, \ ev -> {
      client.sendEvent("message", Json.canonical(ev), String.valueOf(ev.Seq))
    })
    _s.Bus.subscribe(executionId, sub)
    var ping = _pinger.scheduleAtFixedRate(\ -> {
      try {
        client.sendComment("ping")
      } catch (e : Exception) {
        // closed; onClose cleans up
      }
    }, 15, 15, TimeUnit.SECONDS)
    client.onClose(\ -> {
      ping.cancel(false)
      _s.Bus.unsubscribe(executionId, sub)
    })
    sub.replay(_s.Bus.history(executionId, after))
  }

  private static function parseInt(s : String) : int {
    try {
      return s == null ? 0 : Integer.parseInt(s.trim())
    } catch (e : NumberFormatException) {
      return 0
    }
  }

  private static function requireBody(ctx : Context) : String {
    var b = ctx.body()
    if (b == null or b.trim().Empty) {
      throw new ApiException(400, "body_required", "a JSON body is required")
    }
    return b
  }

  private static function body(ctx : Context) : Map<String, Object> {
    var b = ctx.body()
    if (b == null or b.trim().Empty) {
      return new java.util.LinkedHashMap<String, Object>()
    }
    try {
      return Json.MAPPER.readValue(b, Map) as Map<String, Object>
    } catch (e : Exception) {
      throw new ApiException(400, "invalid_json", "request body is not valid JSON")
    }
  }

  static function json(ctx : Context, status : int, obj : Object) {
    ctx.status(status)
    ctx.contentType("application/json")
    ctx.result(Json.MAPPER.writeValueAsString(obj))
  }
}
