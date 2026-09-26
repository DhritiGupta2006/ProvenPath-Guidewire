package provenpath.app

uses java.util.concurrent.ExecutorService
uses provenpath.app.db.Db
uses provenpath.app.db.Repository
uses provenpath.app.events.EventBus
uses provenpath.app.planner.FixturePlanner
uses provenpath.app.services.AgentService
uses provenpath.app.services.DeploymentService
uses provenpath.app.services.ExecutionService
uses provenpath.app.services.QueryService
uses provenpath.app.services.ReviewService
uses provenpath.app.services.ToolService
uses provenpath.app.services.VerifyService
uses provenpath.contracts.PackageBuilderPort
uses provenpath.contracts.PlannerPort
uses provenpath.core.engine.RuleLoader
uses provenpath.core.gate.Gate

/**
 * Wiring. The planner (Track C) and the PolicyCenter package builder (Track B) are loaded by class
 * name, so :app never compiles against the LLM code and the boundary stays one-way.
 */
class Services {

  var _config : Config as readonly Cfg
  var _db : Db as readonly DB
  var _repo : Repository as readonly Repo
  var _loader : RuleLoader as readonly Loader
  var _bus : EventBus as readonly Bus
  var _verify : VerifyService as readonly Verify
  var _executions : ExecutionService as readonly Executions
  var _reviews : ReviewService as readonly Reviews
  var _deployments : DeploymentService as readonly Deployments
  var _agent : AgentService as readonly Agent
  var _tools : ToolService as readonly Tools
  var _query : QueryService as readonly Query
  var _plannerStatus : String as readonly PlannerStatus
  var _builderStatus : String as readonly BuilderStatus

  /**
   * @param executor null = run planners inline (tests)
   * @param builderOverride non-null replaces the class-name lookup (tests)
   */
  construct(config : Config, db : Db, executor : ExecutorService, builderOverride : PackageBuilderPort) {
    _config = config
    _db = db
    _repo = new Repository(db)
    _loader = new RuleLoader(config.RulesDir)
    _loader.load()
    _bus = new EventBus(_repo)
    _verify = new VerifyService(new Gate(_loader), _loader, _repo, _bus, config.NodeDelayMs)

    var planner : PlannerPort = null
    if (config.LlmMode == "fixture") {
      planner = new FixturePlanner(config.FixturesDir)
      _plannerStatus = "fixture"
    } else {
      try {
        planner = instantiate(config.PlannerClass) as PlannerPort
        _plannerStatus = config.PlannerClass
      } catch (e : Throwable) {
        _plannerStatus = "unavailable: " + config.PlannerClass + " (" + e.toString() + ")"
      }
    }

    var builder : PackageBuilderPort = builderOverride
    if (builder != null) {
      _builderStatus = builder.IntrinsicType.Name
    } else {
      try {
        builder = instantiate(config.PackageBuilderClass) as PackageBuilderPort
        _builderStatus = config.PackageBuilderClass
      } catch (e : Throwable) {
        _builderStatus = "unavailable: " + config.PackageBuilderClass + " (" + e.toString() + ")"
      }
    }

    _executions = new ExecutionService(_repo, _bus, _verify, planner, _plannerStatus, config.LlmMode, executor)
    _reviews = new ReviewService(_repo, _bus)
    _deployments = new DeploymentService(_repo, _bus, builder, _builderStatus, _loader.RulesetHash)
    _agent = new AgentService(_repo, _bus, config.AgentKey, config.AgentPollMs)
    _tools = new ToolService(_repo, _bus, _executions, _verify, _deployments)
    _query = new QueryService(_repo, _verify, _loader, config.EvalDir)
  }

  property get LlmMode() : String {
    return _config.LlmMode
  }

  private static function instantiate(className : String) : Object {
    return Class.forName(className).getDeclaredConstructor({}).newInstance({})
  }
}
