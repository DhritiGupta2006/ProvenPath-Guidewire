package provenpath.contracts

uses java.util.List
uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class Verdict {
  var _runId : String as RunId
  var _status : VerdictStatus as Status
  var _nodes : List<NodeResult> as Nodes
  var _rulesetHash : String as RulesetHash
  var _proposalHash : String as ProposalHash
  var _verdictHash : String as VerdictHash
  var _gateToken : String as GateToken

  construct() {}
}
