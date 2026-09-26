package provenpath.contracts

uses com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(:ignoreUnknown = true, :value = {"intrinsicType", "allTypesInHierarchy"})
class Citation {
  var _sourceCode : String as SourceCode
  var _section : String as Section
  var _textSnippet : String as TextSnippet

  construct() {}

  construct(sourceCode : String, section : String, textSnippet : String) {
    _sourceCode = sourceCode
    _section = section
    _textSnippet = textSnippet
  }
}
