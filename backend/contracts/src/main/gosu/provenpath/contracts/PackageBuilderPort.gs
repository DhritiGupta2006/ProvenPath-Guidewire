package provenpath.contracts

/**
 * Builds the PolicyCenter overlay package for an approved, PASSED proposal.
 * Implemented by provenpath.pcexport (Track B). Called only by the backend AFTER
 * the gate token and the approved review have been re-checked.
 */
interface PackageBuilderPort {
  function build(proposal : Proposal, verdict : Verdict, reviewId : String, reviewer : String) : PcPackage
}
