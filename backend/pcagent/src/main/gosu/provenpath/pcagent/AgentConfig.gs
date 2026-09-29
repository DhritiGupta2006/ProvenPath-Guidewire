package provenpath.pcagent

uses java.io.File
uses java.nio.charset.StandardCharsets
uses java.nio.file.Files
uses java.util.HashMap
uses java.util.Map

/**
 * Agent settings from agent.env (KEY=VALUE lines, # comments), overridden by real environment variables.
 * The file lives next to the agent on the VM and is never committed (it holds the agent key and the gate secret).
 */
class AgentConfig {

  var _values : Map<String, String>

  construct(values : Map<String, String>) {
    _values = values
  }

  static function load(envFile : File) : AgentConfig {
    var values = new HashMap<String, String>()
    if (envFile != null and envFile.File) {
      for (raw in Files.readAllLines(envFile.toPath(), StandardCharsets.UTF_8)) {
        var line = raw.trim()
        if (line.Empty or line.startsWith("#") or !line.contains("=")) continue
        var i = line.indexOf("=")
        values.put(line.substring(0, i).trim(), unquote(line.substring(i + 1).trim()))
      }
    }
    for (e in System.getenv().entrySet()) {
      if (e.Value != null and !e.Value.Empty) values.put(e.Key, e.Value)
    }
    return new AgentConfig(values)
  }

  function get(key : String, dflt : String) : String {
    var v = _values.get(key)
    return (v == null or v.trim().Empty) ? dflt : v.trim()
  }

  function require(key : String) : String {
    var v = get(key, null)
    if (v == null) throw new IllegalStateException(key + " is not set (agent.env or environment)")
    return v
  }

  property get BackendUrl() : String { return get("BACKEND_URL", "http://localhost:8080").replaceAll("/+$", "") }
  property get AgentKey() : String { return require("PC_AGENT_KEY") }
  property get Secret() : String { return require("PROVENPATH_GATE_SECRET") }
  property get AgentName() : String { return get("AGENT_NAME", "pcagent") }
  property get PcHome() : File { return new File(require("PC_HOME")) }
  property get PcUrl() : String { return get("PC_URL", "http://localhost:8180/pc").replaceAll("/+$", "") }
  property get PcUser() : String { return get("PC_USER", "su") }
  property get PcPassword() : String { return get("PC_PASSWORD", "gw") }
  property get StopCmd() : String { return get("PC_STOP_CMD", null) }
  property get StartCmd() : String { return get("PC_START_CMD", null) }
  /** JAVA_HOME for PolicyCenter's own processes (the agent itself runs on Temurin 11; PC keeps its JDK). */
  property get PcJavaHome() : String { return get("PC_JAVA_HOME", null) }
  property get InboxDir() : File { return get("INBOX_DIR", null) == null ? null : new File(get("INBOX_DIR", null)) }
  property get BackupDir() : File { return new File(get("BACKUP_DIR", new File(PcHome.AbsoluteFile.ParentFile, "ProvenPath-backup").Path)) }
  property get LogDir() : File { return new File(get("LOG_DIR", new File(BackupDir, "logs").Path)) }
  property get ReadyTimeoutMinutes() : int { return Integer.parseInt(get("PC_READY_TIMEOUT_MIN", "45")) }
  property get StopTimeoutSeconds() : int { return Integer.parseInt(get("PC_STOP_TIMEOUT_SEC", "600")) }
  /** Restart even when no file changed (default: only restart when something changed or PC is down). */
  property get AlwaysRestart() : boolean { return get("PC_ALWAYS_RESTART", "false").equalsIgnoreCase("true") }

  private static function unquote(v : String) : String {
    if (v.length() >= 2 and ((v.startsWith("\"") and v.endsWith("\"")) or (v.startsWith("'") and v.endsWith("'")))) {
      return v.substring(1, v.length() - 1)
    }
    return v
  }

  static function asMap(cfg : AgentConfig) : Map<String, String> {
    return cfg._values
  }
}
