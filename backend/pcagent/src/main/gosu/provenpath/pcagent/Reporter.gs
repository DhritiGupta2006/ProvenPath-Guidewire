package provenpath.pcagent

/**
 * Where the agent reports each step (write, restart, ready, verified, failed). For a package pulled from the
 * backend this is POST /api/v1/pc-agent/status, which turns into pc.* events in Mission Control.
 */
interface Reporter {
  function report(step : String, detail : String)
}
