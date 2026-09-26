package provenpath.app

uses java.util.concurrent.Executors
uses provenpath.app.db.Db

/** ProvenPath backend. Configuration: see Config (env vars with localhost defaults). */
class Main {

  static function main(args : String[]) {
    var secret = System.getenv("PROVENPATH_GATE_SECRET")
    if (secret == null or secret.trim().Empty) {
      System.err.println("PROVENPATH_GATE_SECRET is not set; refusing to start (gate tokens would be forgeable).")
      System.exit(2)
    }
    var config = new Config()
    System.out.println("ProvenPath backend: db=" + config.DbUrl + " rules=" + config.RulesDir + " fixtures=" + config.FixturesDir +
        " eval=" + config.EvalDir + " llmMode=" + config.LlmMode)
    var db = new Db(config.DbUrl, config.DbUser, config.DbPassword)
    db.migrate()
    var services = new Services(config, db, Executors.newFixedThreadPool(4), null)
    Seeder.seed(services.Repo, services.Loader)
    System.out.println("Ruleset " + services.Loader.RulesetHash + " (" + services.Loader.Rules.size() + " rules); planner=" +
        services.PlannerStatus + "; packageBuilder=" + services.BuilderStatus)
    new Server(services).start(config.Port)
  }
}
