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
  /** REGULATION, REGULATOR_GUIDANCE (verbatim official text) or UNDERWRITING_GUIDELINE, TECHNICAL_SPEC, GOVERNANCE (our own). */
  var _kind : String as Kind
  var _issuer : String as Issuer
  var _document : String as Document
  var _url : String as Url

  construct() {}
}
