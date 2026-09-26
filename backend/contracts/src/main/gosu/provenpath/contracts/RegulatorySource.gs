package provenpath.contracts

uses java.time.LocalDate
uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class RegulatorySource {
  var _sourceCode : String as SourceCode
  var _title : String as Title
  var _section : String as Section
  var _fullText : String as FullText
  var _effectiveDate : LocalDate as EffectiveDate
  var _expiryDate : LocalDate as ExpiryDate
  var _jurisdiction : String as Jurisdiction

  construct() {}
}
