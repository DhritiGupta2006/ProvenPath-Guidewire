package provenpath.core.layers

uses provenpath.contracts.Clause
uses provenpath.contracts.NodeResult
uses provenpath.contracts.Proposal
uses provenpath.core.engine.RuleDefinition
uses java.util.Map
uses provenpath.contracts.RegulatorySource

/**
 * Abstract base class for all verification checks.
 * Invariant 8: every check is a deterministic function from (rule, target, proposal, ctx) to NodeResult.
 */
abstract class Check {
  /**
   * Evaluate a rule against a target clause (or null for proposal-level rules) in the context of a proposal.
   * @param rule       The rule definition from YAML
   * @param target     The clause being checked, or null for proposal-level rules
   * @param proposal   The full proposal
   * @param sources    Map of sourceCode -> RegulatorySource
   * @return A NodeResult with the check outcome
   */
  abstract function evaluate(rule : RuleDefinition, target : Clause, proposal : Proposal,
                             sources : Map<String, RegulatorySource>) : NodeResult
}
