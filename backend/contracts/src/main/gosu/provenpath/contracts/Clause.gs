package provenpath.contracts

uses java.util.List
uses java.util.Map
uses java.math.BigDecimal
uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class Clause {
  var _clauseId : String as ClauseId
  var _kind : ClauseKind as Kind
  var _patternCode : String as PatternCode
  var _name : String as Name
  var _category : String as Category
  var _owningEntityType : String as OwningEntityType
  var _existence : String as Existence
  var _limitMaxInr : Long as LimitMaxInr
  var _deductibleInr : Long as DeductibleInr
  var _waitingHours : Integer as WaitingHours
  var _conditions : List<String> as Conditions
  var _factors : Map<String, BigDecimal> as Factors
  var _excludesPatternCodes : List<String> as ExcludesPatternCodes
  var _citations : List<Citation> as Citations

  construct() {}
}
