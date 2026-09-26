package provenpath.contracts

uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class NodeResult {
  var _ruleCode : String as RuleCode
  var _clauseId : String as ClauseId
  var _layer : Layer as Layer
  var _result : NodeStatus as Result
  var _expected : String as Expected
  var _actual : String as Actual
  var _reason : String as Reason
  var _sourceCode : String as SourceCode

  construct() {}
}
