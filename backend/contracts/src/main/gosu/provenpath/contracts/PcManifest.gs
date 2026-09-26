package provenpath.contracts

uses java.util.List

class PcManifest {
  var _productCode : String as ProductCode
  var _files : List<PcFile> as Files
  var _verdictHash : String as VerdictHash
  var _gateToken : String as GateToken
  var _reviewId : String as ReviewId
  var _reviewer : String as Reviewer
  var _termRanges : List<PcTermRange> as TermRanges
  var _generatedAt : String as GeneratedAt

  construct() {}
}
