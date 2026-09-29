package provenpath.pcagent

uses java.io.File
uses java.lang.ProcessBuilder
uses java.time.LocalDateTime
uses java.time.format.DateTimeFormatter
uses java.util.ArrayList
uses java.util.List
uses java.util.concurrent.TimeUnit

/**
 * Runs PolicyCenter's own commands (on the VM: `gwb.bat stopServer` / `gwb.bat runServer` in PC_HOME) as child
 * processes of the agent, with their console output captured in LOG_DIR. PC_JAVA_HOME, when set, becomes the
 * children's JAVA_HOME so PolicyCenter keeps its own JDK; the agent never changes the global JAVA_HOME.
 */
class CommandPcControl implements PcControl {

  var _cfg : AgentConfig
  var _server : Process
  var _serverLog : File

  construct(cfg : AgentConfig) {
    _cfg = cfg
  }

  override function stop() {
    var cmd = _cfg.StopCmd
    if (cmd == null) throw new IllegalStateException("PC_STOP_CMD is not set")
    var log = logFile("pc-stop")
    var p = builder(cmd, log).start()
    if (!p.waitFor(_cfg.StopTimeoutSeconds, TimeUnit.SECONDS)) {
      p.destroy()
      throw new IllegalStateException("PC_STOP_CMD did not finish within " + _cfg.StopTimeoutSeconds + " s (log: " + log + ")")
    }
    // A non-zero exit usually means PolicyCenter was not running; the start and readiness checks decide.
    if (_server != null and _server.Alive) {
      _server.waitFor(60, TimeUnit.SECONDS)
    }
  }

  override function start() {
    var cmd = _cfg.StartCmd
    if (cmd == null) throw new IllegalStateException("PC_START_CMD is not set")
    _serverLog = logFile("pc-server")
    _server = builder(cmd, _serverLog).start()
  }

  override function startedProcessAlive() : boolean {
    return _server == null or _server.Alive
  }

  override property get LogHint() : String {
    return _serverLog == null ? "(no server log yet)" : _serverLog.AbsolutePath
  }

  private function builder(cmd : String, log : File) : ProcessBuilder {
    var windows = System.getProperty("os.name").toLowerCase().contains("win")
    var args = new ArrayList<String>()
    if (windows) {
      args.addAll({"cmd.exe", "/c", cmd})
    } else {
      args.addAll({"sh", "-c", cmd})
    }
    var pb = new ProcessBuilder(args)
    pb.directory(_cfg.PcHome)
    pb.redirectErrorStream(true)
    pb.redirectOutput(ProcessBuilder.Redirect.appendTo(log))
    if (_cfg.PcJavaHome != null) {
      pb.environment().put("JAVA_HOME", _cfg.PcJavaHome)
    }
    return pb
  }

  private function logFile(prefix : String) : File {
    var dir = _cfg.LogDir
    dir.mkdirs()
    return new File(dir, prefix + "-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".log")
  }
}
