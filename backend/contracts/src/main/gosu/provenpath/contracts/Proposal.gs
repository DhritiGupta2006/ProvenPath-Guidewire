package provenpath.contracts

uses java.util.List
uses java.util.Map
uses java.time.LocalDate
uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class Proposal {
  var _proposalId : String as ProposalId
  var _executionId : String as ExecutionId
  var _iteration : int as Iteration
  var _line : String as Line = "SMCyber"
  var _aggregateLimitInr : long as AggregateLimitInr
  var _turnoverInr : long as TurnoverInr
  var _minimumPremiumInr : long as MinimumPremiumInr
  var _targetEffectiveDate : LocalDate as TargetEffectiveDate
  var _jurisdiction : String as Jurisdiction = "IN"
  var _clauses : List<Clause> as Clauses
  var _proseSummary : String as ProseSummary
  var _llmMeta : Map<String, Object> as LlmMeta

  construct() {}
}
