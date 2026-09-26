package provenpath.contracts

interface VerifyPort {
  function verify(p : Proposal) : Verdict
}
