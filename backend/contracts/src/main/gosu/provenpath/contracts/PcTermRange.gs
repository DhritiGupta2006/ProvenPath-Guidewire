package provenpath.contracts

uses java.math.BigDecimal

class PcTermRange {
  var _patternCode : String as PatternCode
  var _termCode : String as TermCode
  var _min : BigDecimal as Min
  var _max : BigDecimal as Max
  var _ruleCode : String as RuleCode

  construct() {}

  construct(patternCode : String, termCode : String, min : BigDecimal, max : BigDecimal, ruleCode : String) {
    _patternCode = patternCode
    _termCode = termCode
    _min = min
    _max = max
    _ruleCode = ruleCode
  }
}
