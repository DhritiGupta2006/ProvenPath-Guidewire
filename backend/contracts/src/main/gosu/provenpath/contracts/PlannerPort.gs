package provenpath.contracts

/**
 * The planner (LLM or fixture) turns a PM prompt into proposals and calls the verifier.
 * It only PROPOSES: the Verdict it returns is whatever VerifyPort returned, unchanged.
 * Implementations: provenpath.planner.* (Track C) and the fixture planner in :app.
 */
interface PlannerPort {
  /** Run the plan → verify (→ repair → verify) loop. Returns the LAST verdict from the verifier. */
  function run(executionId : String, prompt : String, verifier : VerifyPort, events : EventPort) : Verdict
}
