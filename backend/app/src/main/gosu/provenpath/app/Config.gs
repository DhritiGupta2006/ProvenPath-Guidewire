package provenpath.app

uses java.io.File

/**
 * All configuration comes from environment variables with localhost defaults, so the same jar runs
 * in Docker on laptops and natively on the Guidewire VM (see docs/policycenter.md).
 */
class Config {

  var _port : int as readonly Port
  var _dbUrl : String as readonly DbUrl
  var _dbUser : String as readonly DbUser
  var _dbPassword : String as readonly DbPassword
  var _rulesDir : String as readonly RulesDir
  var _fixturesDir : String as readonly FixturesDir
  var _evalDir : String as readonly EvalDir
  var _agentKey : String as readonly AgentKey
  var _llmMode : String as readonly LlmMode
  var _plannerClass : String as readonly PlannerClass
  var _packageBuilderClass : String as readonly PackageBuilderClass
  var _nodeDelayMs : long as readonly NodeDelayMs
  var _agentPollMs : long as readonly AgentPollMs

  construct() {
    _port = Integer.parseInt(env("PORT", "8080"))
    _dbUrl = env("DB_URL", "jdbc:postgresql://localhost:5432/provenpath")
    _dbUser = env("DB_USER", "provenpath")
    _dbPassword = env("DB_PASSWORD", "provenpath")
    _rulesDir = resolveDir("PROVENPATH_RULES_DIR", "rules")
    _fixturesDir = resolveDir("PROVENPATH_FIXTURES_DIR", "fixtures")
    _evalDir = resolveDir("PROVENPATH_EVAL_DIR", "eval")
    _agentKey = env("PC_AGENT_KEY", "")
    _llmMode = env("LLM_MODE", "fixture")
    _plannerClass = env("PLANNER_CLASS", "provenpath.planner.Planner")
    _packageBuilderClass = env("PACKAGE_BUILDER_CLASS", "provenpath.pcexport.PackageBuilder")
    _nodeDelayMs = Long.parseLong(env("VERIFY_NODE_DELAY_MS", "150"))
    _agentPollMs = Long.parseLong(env("AGENT_LONG_POLL_MS", "25000"))
  }

  static function env(name : String, defaultValue : String) : String {
    var v = System.getenv(name)
    return (v == null or v.trim().Empty) ? defaultValue : v.trim()
  }

  /** Env var if set, otherwise ../name or ./name relative to the working directory (backend/ or repo root). */
  static function resolveDir(envName : String, name : String) : String {
    var fromEnv = System.getenv(envName)
    if (fromEnv != null and !fromEnv.trim().Empty) {
      return new File(fromEnv.trim()).AbsolutePath
    }
    for (candidate in {"../" + name, name, "../../" + name}) {
      var f = new File(candidate)
      if (f.Directory) {
        return f.CanonicalPath
      }
    }
    return new File(name).AbsolutePath
  }
}
