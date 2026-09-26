package provenpath.core.engine

uses java.util.List
uses java.util.Map

/**
 * In-memory representation of a rule loaded from YAML.
 * Mirrors the YAML schema: rule_code, name, layer, applies_to, depends_on, logic, source_code, error_template, pc_mapping.
 */
class RuleDefinition {

  var _ruleCode : String as RuleCode
  var _name : String as Name
  var _layer : String as LayerStr
  var _appliesTo : String as AppliesTo
  var _dependsOn : List<String> as DependsOn
  var _logic : Map<String, Object> as Logic
  var _sourceCode : String as SourceCode
  var _errorTemplate : String as ErrorTemplate
  var _pcMapping : String as PcMapping

  construct() {
    _dependsOn = {}
  }

  construct(ruleCode : String, name : String, layer : String, appliesTo : String,
            dependsOn : List<String>, logic : Map<String, Object>, sourceCode : String,
            errorTemplate : String, pcMapping : String) {
    _ruleCode = ruleCode
    _name = name
    _layer = layer
    _appliesTo = appliesTo
    _dependsOn = dependsOn != null ? dependsOn : {}
    _logic = logic
    _sourceCode = sourceCode
    _errorTemplate = errorTemplate
    _pcMapping = pcMapping
  }

  override function toString() : String {
    return "Rule[" + _ruleCode + ": " + _name + "]"
  }
}
