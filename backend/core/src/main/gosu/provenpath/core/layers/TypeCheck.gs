package provenpath.core.layers

uses provenpath.contracts.Clause
uses provenpath.contracts.Layer
uses provenpath.contracts.NodeResult
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.Proposal
uses provenpath.contracts.RegulatorySource
uses provenpath.core.engine.BuiltinFunctions
uses provenpath.core.engine.LogicEvaluator
uses provenpath.core.engine.RuleDefinition
uses java.util.Map

class TypeCheck extends Check {
  override function evaluate(rule : RuleDefinition, target : Clause, proposal : Proposal,
                             sources : Map<String, RegulatorySource>) : NodeResult {
    var result = new NodeResult()
    result.RuleCode = rule.RuleCode
    result.ClauseId = target != null ? target.ClauseId : null
    result.Layer = Layer.TYPE
    result.SourceCode = rule.SourceCode
    
    // Check if this is a built-in function
    var logic = rule.Logic
    if (logic != null && "FN" == logic.get("operator") as String) {
      var fnName = logic.get("name") as String
      var evalResult = BuiltinFunctions.invoke(fnName, target, proposal, sources)
      result.Result = evalResult.Passed ? NodeStatus.PASSED : NodeStatus.FAILED
      result.Expected = evalResult.Expected
      result.Actual = evalResult.Actual
      result.Reason = evalResult.Reason
      return result
    }
    
    // Use LogicEvaluator for expression-based logic
    var evalResult = LogicEvaluator.evaluate(logic, target, proposal)
    result.Result = evalResult.Passed ? NodeStatus.PASSED : NodeStatus.FAILED
    result.Expected = evalResult.Expected
    result.Actual = evalResult.Actual
    result.Reason = evalResult.Reason
    return result
  }
}
