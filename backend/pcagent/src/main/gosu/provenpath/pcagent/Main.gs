package provenpath.pcagent

uses java.io.File
uses java.io.FileWriter
uses java.io.PrintWriter
uses java.net.URI
uses java.net.URLEncoder
uses java.net.http.HttpClient
uses java.net.http.HttpRequest
uses java.net.http.HttpResponse
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.nio.file.StandardCopyOption
uses java.time.Duration
uses java.time.LocalDateTime
uses java.util.Base64
uses java.util.LinkedHashMap
uses java.util.Map
uses provenpath.contracts.Json

/**
 * The ProvenPath PC agent: runs next to PolicyCenter (on the VM, as the normal user, from a console).
 *   java -jar provenpath-pcagent.jar [path\to\agent.env]
 * Long-polls the backend for approved packages (GET /api/v1/pc-agent/next) and also installs zips dropped into
 * INBOX_DIR. Each package is verified, installed and confirmed by Agent, and every step is reported back.
 */
class Main {

  static var _log : PrintWriter

  static function main(args : String[]) {
    var envFile = new File(args.length > 0 ? args[0] : (System.getenv("AGENT_ENV") ?: "agent.env"))
    var cfg = AgentConfig.load(envFile)
    cfg.LogDir.mkdirs()
    _log = new PrintWriter(new FileWriter(new File(cfg.LogDir, "pcagent.log"), true), true)

    var pm = new ProductModelClient(cfg.PcUrl, cfg.PcUser, cfg.PcPassword)
    var agent = new Agent(cfg.Secret, new Installer(cfg.PcHome, cfg.BackupDir), new CommandPcControl(cfg), pm,
        cfg.ReadyTimeoutMinutes * 60000L, 5000L, 30000L, cfg.AlwaysRestart)
    var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    log("ProvenPath PC agent '" + cfg.AgentName + "' started. Backend " + cfg.BackendUrl + ", PC_HOME " + cfg.PcHome
        + ", PolicyCenter " + cfg.PcUrl + (cfg.InboxDir == null ? "" : ", inbox " + cfg.InboxDir))
    if (!new File(cfg.PcHome, "modules/configuration").Directory) {
      log("WARNING: " + cfg.PcHome + " has no modules/configuration; packages will fail until PC_HOME is right")
    }

    while (true) {
      try {
        scanInbox(cfg, agent)
        var next = HttpRequest.newBuilder(URI.create(cfg.BackendUrl + "/api/v1/pc-agent/next?agent="
            + URLEncoder.encode(cfg.AgentName, StandardCharsets.UTF_8)))
            .timeout(Duration.ofSeconds(90))
            .header("Authorization", "Bearer " + cfg.AgentKey)
            .GET().build()
        var res = http.send(next, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
        if (res.statusCode() == 204) continue
        if (res.statusCode() != 200) {
          log("backend answered " + res.statusCode() + ": " + res.body())
          Thread.sleep(10000)
          continue
        }
        var job = Json.MAPPER.readValue(res.body(), Map) as Map<String, Object>
        var deploymentId = job.get("deploymentId") as String
        log("pulled deployment " + deploymentId + " (execution " + job.get("executionId") + ")")
        var zip = Base64.getDecoder().decode(job.get("packageBase64") as String)
        var ok = agent.process(zip, job.get("runId") as String, deploymentId, new BackendReporter(http, cfg, deploymentId))
        log("deployment " + deploymentId + (ok ? " verified in PolicyCenter" : " FAILED"))
      } catch (e : Exception) {
        log("error: " + e.Message + "; retrying in 5 s")
        Thread.sleep(5000)
      }
    }
  }

  /** Fallback when the backend is unreachable: install zips dropped into INBOX_DIR (results only in the log). */
  static function scanInbox(cfg : AgentConfig, agent : Agent) {
    var inbox = cfg.InboxDir
    if (inbox == null or !inbox.Directory) return
    for (f in inbox.listFiles().where(\ x -> x.File and x.Name.toLowerCase().endsWith(".zip"))) {
      log("inbox: processing " + f.Name)
      var label = "inbox-" + f.Name.replaceAll("\\.zip$", "")
      var ok = agent.process(Files.readAllBytes(f.toPath()), null, label, \ step, detail -> log("inbox " + f.Name + " [" + step + "] " + detail))
      var dest = new File(inbox, ok ? "processed" : "rejected")
      dest.mkdirs()
      Files.move(f.toPath(), new File(dest, f.Name).toPath(), {StandardCopyOption.REPLACE_EXISTING})
    }
  }

  static function log(msg : String) {
    var line = LocalDateTime.now().withNano(0) + "  " + msg
    print(line)
    _log?.println(line)
  }

  /** Reports to POST /api/v1/pc-agent/status (and to the log). A reporting failure never stops the install. */
  static class BackendReporter implements Reporter {
    var _http : HttpClient
    var _cfg : AgentConfig
    var _deploymentId : String

    construct(http : HttpClient, cfg : AgentConfig, deploymentId : String) {
      _http = http
      _cfg = cfg
      _deploymentId = deploymentId
    }

    override function report(step : String, detail : String) {
      log("[" + step + "] " + detail)
      try {
        var body = new LinkedHashMap<String, Object>()
        body.put("deploymentId", _deploymentId)
        body.put("step", step)
        body.put("detail", detail)
        var req = HttpRequest.newBuilder(URI.create(_cfg.BackendUrl + "/api/v1/pc-agent/status"))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer " + _cfg.AgentKey)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(Json.MAPPER.writeValueAsString(body), StandardCharsets.UTF_8))
            .build()
        var res = _http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
        if (res.statusCode() != 200) log("status report rejected (" + res.statusCode() + "): " + res.body())
      } catch (e : Exception) {
        log("could not report '" + step + "': " + e.Message)
      }
    }
  }
}
