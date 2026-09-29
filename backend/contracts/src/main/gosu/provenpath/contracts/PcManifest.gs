package provenpath.contracts

uses java.util.List

/**
 * The signed description of a PolicyCenter overlay package (stored as provenpath-manifest.json inside the zip).
 * RunId / ProposalHash / RulesetHash let the PC agent recompute the gate token on its own; Signature is an
 * HMAC over the canonical JSON of every other field (see Signing), so no file hash or term range can be
 * changed after the backend built the package.
 */
class PcManifest {
  var _productCode : String as ProductCode
  var _files : List<PcFile> as Files
  var _verdictHash : String as VerdictHash
  var _gateToken : String as GateToken
  var _reviewId : String as ReviewId
  var _reviewer : String as Reviewer
  var _termRanges : List<PcTermRange> as TermRanges
  var _generatedAt : String as GeneratedAt
  var _runId : String as RunId
  var _proposalHash : String as ProposalHash
  var _rulesetHash : String as RulesetHash
  var _signature : String as Signature

  construct() {}
}
