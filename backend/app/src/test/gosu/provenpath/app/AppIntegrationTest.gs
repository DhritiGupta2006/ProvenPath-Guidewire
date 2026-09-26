package provenpath.app

uses java.io.File
uses java.net.ServerSocket
uses java.net.URI
uses java.net.http.HttpClient
uses java.net.http.HttpRequest
uses java.net.http.HttpResponse
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.time.Duration
uses java.util.ArrayList
uses java.util.List
uses java.util.Map
uses java.util.concurrent.CountDownLatch
uses java.util.concurrent.LinkedBlockingQueue
uses java.util.concurrent.TimeUnit
uses org.junit.jupiter.api.AfterAll
uses org.junit.jupiter.api.Assertions
uses org.junit.jupiter.api.Assumptions
uses org.junit.jupiter.api.BeforeAll
uses org.junit.jupiter.api.Test
uses io.zonky.test.db.postgres.embedded.EmbeddedPostgres
uses provenpath.app.db.Db
uses provenpath.contracts.Event
uses provenpath.contracts.Json
uses provenpath.contracts.Proposal

/**
 * End-to-end tests of the backend against a real PostgreSQL (see backend/test-with-db.sh).
 * Skipped when PROVENPATH_TEST_DB_URL is not set.
 */
class AppIntegrationTest {

  static final var PROMPT = "Cyber insurance for Indian startups, up to ₹50L coverage"
  static var _db : Db
  static var _pg : EmbeddedPostgres
  static var _s : Services
  static var _server : Server
  static var _port : int
  static var _http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()

  @BeforeAll
  static function setUp() {
    var url = System.getenv("PROVENPATH_TEST_DB_URL")
    if (url != null and !url.Empty) {
      _db = new Db(url, System.getenv("PROVENPATH_TEST_DB_USER") ?: "provenpath", System.getenv("PROVENPATH_TEST_DB_PASSWORD") ?: "provenpath")
    } else {
      // No DB given: start a throwaway embedded PostgreSQL (no Docker needed). Postgres refuses to run as root,
      // so inside a root container this is skipped; use backend/test-with-db.sh there.
      try {
        _pg = EmbeddedPostgres.start()
      } catch (e : Exception) {
        Assumptions.abort("embedded PostgreSQL unavailable (" + e.Message + "); run backend/test-with-db.sh")
      }
      _db = new Db(_pg.getJdbcUrl("postgres", "postgres"), "postgres", "postgres")
    }
    _db.resetForTests()
    _s = new Services(new Config(), _db, null, new TestPackageBuilder())
    Seeder.seed(_s.Repo, _s.Loader)
    var sock = new ServerSocket(0)
    _port = sock.LocalPort
    sock.close()
    _server = new Server(_s)
    _server.start(_port)
  }

  @AfterAll
  static function tearDown() {
    _server?.stop()
    _db?.close()
    _pg?.close()
  }

  // ------------------------------------------------------------------ helpers

  private function flow() : String {
    return _s.Executions.start(PROMPT)
  }

  private function reviewerId() : String {
    return _s.Repo.users().firstWhere(\ u -> u.get("role") == "reviewer").get("id") as String
  }

  private function approvedFlow() : String {
    var id = flow()
    _s.Reviews.decide(id, _s.Repo.latestRun(id).get("id") as String, reviewerId(), "approve", null)
    return id
  }

  private function types(id : String) : List<String> {
    return _s.Bus.history(id, 0).map(\ e -> e.Type)
  }

  private function fixture(name : String) : Proposal {
    var f = new File(System.getenv("PROVENPATH_FIXTURES_DIR"), name)
    return Json.parse(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8), Proposal)
  }

  private function expectApi(code : String, work : block()) : ApiException {
    var e = Assertions.assertThrows(ApiException, \ -> { work() })
    Assertions.assertEquals(code, e.Code, e.Message)
    return e
  }

  private function get(path : String) : HttpResponse<String> {
    return _http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + _port + path)).GET().build(),
        HttpResponse.BodyHandlers.ofString())
  }

  private function post(path : String, body : String, auth : String) : HttpResponse<String> {
    var b = HttpRequest.newBuilder(URI.create("http://localhost:" + _port + path))
        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body))
    if (auth != null) {
      b.header("Authorization", auth)
    }
    return _http.send(b.build(), HttpResponse.BodyHandlers.ofString())
  }

  // ------------------------------------------------------------------ event log

  @Test
  function eventLogIsAppendOnly() {
    var id = _s.Executions.create("append-only check", "test")
    Assertions.assertThrows(Exception, \ -> { _db.update("UPDATE pp_event_log SET type = 'x' WHERE execution_id = ?", {id}) })
    Assertions.assertThrows(Exception, \ -> { _db.update("DELETE FROM pp_event_log WHERE execution_id = ?", {id}) })
    Assertions.assertEquals(1, _s.Bus.history(id, 0).size())
  }

  @Test
  function concurrentEmitsGetContiguousSeq() {
    var id = _s.Executions.create("seq check", "test")
    var threads = new ArrayList<Thread>()
    for (t in 0..|8) {
      var th = new Thread(\ -> {
        for (i in 0..|10) {
          _s.Bus.emit(id, "test.event", {"t" -> t, "i" -> i})
        }
      })
      threads.add(th)
      th.start()
    }
    for (th in threads) {
      th.join()
    }
    var seqs = _s.Bus.history(id, 0).map(\ e -> e.Seq)
    Assertions.assertEquals(81, seqs.size())
    for (i in 0..|seqs.size()) {
      Assertions.assertEquals(i + 1, seqs.get(i))
    }
  }

  // ------------------------------------------------------------------ planner loop

  @Test
  function fixtureFlowBlocksThenRepairsThenPasses() {
    var id = flow()
    Assertions.assertEquals("review_pending", _s.Repo.execution(id).get("status"))
    var runs = _s.Repo.runsForExecution(id)
    Assertions.assertEquals(2, runs.size())
    Assertions.assertEquals("BLOCKED", runs.get(0).get("status"))
    Assertions.assertEquals("PASSED", runs.get(1).get("status"))
    var failedNodes = _s.Repo.nodesForRun(runs.get(0).get("id") as String).where(\ n -> n.get("result") == "FAILED")
    Assertions.assertTrue(failedNodes.hasMatch(\ n -> n.get("rule_code") == "CYB-RNG-002"), "run 1 must fail CYB-RNG-002")
    var t = types(id)
    var order = {"run.started", "proposal.created", "verify.started", "gate.blocked", "planner.repair", "gate.passed", "review.requested"}
    var last = -1
    for (typ in order) {
      var idx = t.indexOf(typ)
      Assertions.assertTrue(idx > last, typ + " out of order in " + t)
      last = idx
    }
    Assertions.assertEquals(1, t.where(\ x -> x == "gate.blocked").size())
  }

  // ------------------------------------------------------------------ review gate

  @Test
  function reviewRules() {
    var id = flow()
    var runId = _s.Repo.latestRun(id).get("id") as String
    var firstRun = _s.Repo.runsForExecution(id).get(0).get("id") as String
    expectApi("comment_required", \ -> { _s.Reviews.decide(id, runId, reviewerId(), "reject", "  ") })
    expectApi("stale_run", \ -> { _s.Reviews.decide(id, firstRun, reviewerId(), "approve", null) })
    var pm = _s.Repo.users().firstWhere(\ u -> u.get("role") == "proposer").get("id") as String
    expectApi("invalid_reviewer", \ -> { _s.Reviews.decide(id, runId, pm, "approve", null) })
    expectApi("invalid_decision", \ -> { _s.Reviews.decide(id, runId, reviewerId(), "maybe", null) })
    _s.Reviews.decide(id, runId, reviewerId(), "approve", null)
    Assertions.assertEquals("approved", _s.Repo.execution(id).get("status"))
    expectApi("not_reviewable", \ -> { _s.Reviews.decide(id, runId, reviewerId(), "approve", null) })
    Assertions.assertTrue(types(id).contains("review.decided"))
  }

  @Test
  function rejectionEndsTheRun() {
    var id = flow()
    _s.Reviews.decide(id, _s.Repo.latestRun(id).get("id") as String, reviewerId(), "reject", "Waiting-period wording unclear")
    Assertions.assertEquals("rejected", _s.Repo.execution(id).get("status"))
    expectApi("not_approved", \ -> { _s.Deployments.deploy(id) })
    Assertions.assertTrue(_s.Repo.deploymentsForExecution(id).Empty)
  }

  // ------------------------------------------------------------------ write-path gate

  @Test
  function blockedProposalCanNeverBeDeployed() {
    var blocked = fixture("proposal_demo_blocked.json")
    var args = Json.MAPPER.convertValue(blocked, Map) as Map<String, Object>
    args.remove("executionId")
    args.put("prompt", "tools path, blocked")
    var created = _s.Tools.call("propose_product", args)
    var id = created.get("executionId") as String
    var verdict = _s.Tools.call("verify_compliance", {"executionId" -> id})
    Assertions.assertEquals("BLOCKED", verdict.get("status"))
    Assertions.assertEquals("verified_fail", _s.Repo.execution(id).get("status"))
    expectApi("not_reviewable", \ -> { _s.Reviews.decide(id, verdict.get("runId") as String, reviewerId(), "approve", null) })
    expectApi("not_approved", \ -> { _s.Tools.call("deploy_product", {"executionId" -> id}) })
    Assertions.assertTrue(_s.Repo.deploymentsForExecution(id).Empty, "a BLOCKED run must produce no package")
  }

  @Test
  function tamperedStoredProposalIsRefused() {
    var id = approvedFlow()
    var run = _s.Repo.latestRun(id)
    _db.update("UPDATE pp_proposal SET proposal = jsonb_set(proposal, '{aggregateLimitInr}', '99999999') WHERE id = ?::uuid",
        {run.get("proposal_row_id")})
    expectApi("proposal_tampered", \ -> { _s.Deployments.deploy(id) })
    Assertions.assertTrue(_s.Repo.deploymentsForExecution(id).Empty)
  }

  @Test
  function deployThenAgentPullsAndReports() {
    var id = approvedFlow()
    var dep = _s.Deployments.deploy(id)
    var depId = dep.get("deploymentId") as String
    Assertions.assertEquals("deploying", _s.Repo.execution(id).get("status"))
    expectApi("not_approved", \ -> { _s.Deployments.deploy(id) })

    var job = _s.Agent.next("test-agent")
    Assertions.assertNotNull(job)
    Assertions.assertEquals(depId, job.get("deploymentId"))
    var manifest = job.get("manifest") as Map<String, Object>
    Assertions.assertEquals(_s.Repo.latestRun(id).get("gate_token"), manifest.get("gateToken"))
    Assertions.assertNotNull(job.get("packageBase64"))
    expectApi("invalid_step", \ -> { _s.Agent.report(depId, "pulled", null) })
    for (step in {"write", "restart", "ready", "verified"}) {
      _s.Agent.report(depId, step, "ok: " + step)
    }
    Assertions.assertEquals("deployed", _s.Repo.execution(id).get("status"))
    expectApi("invalid_transition", \ -> { _s.Agent.report(depId, "write", null) })
    var t = types(id)
    for (typ in {"pc.export", "pc.queued", "pc.pulled", "pc.write", "pc.restart", "pc.ready", "pc.verified", "run.completed"}) {
      Assertions.assertTrue(t.contains(typ), "missing " + typ)
    }
    Assertions.assertNull(_s.Agent.next("test-agent"), "queue must be empty")
  }

  // ------------------------------------------------------------------ replay + provenance

  @Test
  function replayGivesIdenticalHash() {
    var id = flow()
    var r = _s.Query.replay(id)
    Assertions.assertEquals(true, r.get("match"), String.valueOf(r))
    Assertions.assertEquals("PASSED", r.get("status"))
  }

  @Test
  function provenanceTracesClauseToRuleAndSource() {
    var id = flow()
    var p = fixture("proposal_demo_fixed.json")
    var extortion = p.Clauses.firstWhere(\ c -> c.PatternCode == "SMCyberExtortionCov")
    var prov = _s.Query.provenance(extortion.ClauseId, id)
    var checks = prov.get("checks") as List<Map<String, Object>>
    Assertions.assertTrue(checks.hasMatch(\ c -> c.get("rule_code") == "CYB-RNG-002" and c.get("result") == "PASSED"), String.valueOf(checks))
    Assertions.assertEquals(true, prov.get("cited"))
  }

  // ------------------------------------------------------------------ HTTP + SSE

  @Test
  function httpEndpoints() {
    Assertions.assertEquals(200, get("/api/v1/health").statusCode())
    Assertions.assertEquals(_s.Loader.Rules.size(), (Json.MAPPER.readValue(get("/api/v1/rules").body(), Map).get("count") as Integer).intValue())

    // Tamper button: a real source code with altered text is blocked at the SOURCE layer.
    var p = fixture("proposal_demo_fixed.json")
    var c = p.Clauses.get(0).Citations.get(0)
    c.TextSnippet = c.TextSnippet + " (and anything else we like)"
    var res = post("/api/v1/verify", Json.canonical(p), null)
    Assertions.assertEquals(200, res.statusCode())
    var v = Json.MAPPER.readValue(res.body(), Map)
    Assertions.assertEquals("BLOCKED", v.get("status"))
    Assertions.assertTrue(res.body().contains("\"layer\":\"SOURCE\"") and res.body().contains("\"result\":\"FAILED\""))

    Assertions.assertEquals(401, get("/api/v1/pc-agent/next").statusCode())
    Assertions.assertEquals(401, post("/api/v1/pc-agent/status", "{}", "Bearer wrong").statusCode())
    Assertions.assertEquals(400, post("/api/v1/reviews", "not json", null).statusCode())
    Assertions.assertEquals(404, get("/api/v1/executions/exec-nope").statusCode())
  }

  @Test
  function sseReplaysHistoryThenStreamsLive() {
    var id = flow()
    var stored = _s.Bus.history(id, 0).size()
    var lines = new LinkedBlockingQueue<String>()
    var req = HttpRequest.newBuilder(URI.create("http://localhost:" + _port + "/api/v1/executions/" + id + "/stream")).header("Accept", "text/event-stream").GET().build()
    var fut = _http.sendAsync(req, HttpResponse.BodyHandlers.ofLines())
    var reader = new Thread(\ -> {
      try {
        fut.get().body().forEach(\ line -> { if (line.startsWith("data:")) lines.add(line.substring(5).trim()) })
      } catch (e : Exception) {
        // connection closed at the end of the test
      }
    })
    reader.Daemon = true
    reader.start()

    var seen = new ArrayList<Integer>()
    while (seen.size() < stored) {
      var line = lines.poll(10, TimeUnit.SECONDS)
      Assertions.assertNotNull(line, "timed out after " + seen.size() + "/" + stored + " replayed events")
      seen.add((Json.MAPPER.readValue(line, Map).get("seq") as Integer).intValue())
    }
    for (i in 0..|seen.size()) {
      Assertions.assertEquals(i + 1, seen.get(i))
    }
    _s.Bus.emit(id, "test.live", {"hello" -> "world"})
    var live = lines.poll(10, TimeUnit.SECONDS)
    Assertions.assertNotNull(live, "live event not delivered")
    var ev = Json.MAPPER.readValue(live, Map)
    Assertions.assertEquals("test.live", ev.get("type"))
    Assertions.assertEquals(stored + 1, (ev.get("seq") as Integer).intValue())
    fut.cancel(true)
  }
}
