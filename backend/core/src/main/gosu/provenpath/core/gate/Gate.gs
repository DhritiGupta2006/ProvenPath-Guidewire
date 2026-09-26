package provenpath.core.gate

uses java.util.ArrayList
uses java.util.HashMap
uses java.util.HashSet
uses java.util.List
uses java.util.Map
uses java.util.Set
uses java.util.UUID
uses provenpath.contracts.Clause
uses provenpath.contracts.ClauseKind
uses provenpath.contracts.Json
uses provenpath.contracts.Layer
uses provenpath.contracts.NodeResult
uses provenpath.contracts.NodeStatus
uses provenpath.contracts.Proposal
uses provenpath.contracts.RegulatorySource
uses provenpath.contracts.Verdict
uses provenpath.contracts.VerdictStatus
uses provenpath.contracts.VerifyPort
uses provenpath.core.engine.BuiltinFunctions
uses provenpath.core.engine.LogicEvaluator
uses provenpath.core.engine.RuleDefinition
uses provenpath.core.engine.RuleGraph
uses provenpath.core.engine.RuleLoader
uses provenpath.core.engine.Selector
uses provenpath.core.layers.Check
uses provenpath.core.layers.TypeCheck
uses provenpath.core.layers.RangeCheck
uses provenpath.core.layers.ConsistencyCheck
uses provenpath.core.layers.RuleMatchCheck
uses provenpath.core.layers.SourceCheck
uses provenpath.core.layers.GroundingCheck

class Gate implements VerifyPort {

  var _loader : RuleLoader
  var _graph : RuleGraph
  var _checks : Map<String, Check>

  construct(loader : RuleLoader) {
    _loader = loader
    _graph = new RuleGraph(loader.Rules)
    _checks = new HashMap<String, Check>()
    _checks.put("TYPE", new TypeCheck())
    _checks.put("RANGE", new RangeCheck())
    _checks.put("CONSISTENCY", new ConsistencyCheck())
    _checks.put("RULE_MATCH", new RuleMatchCheck())
    _checks.put("SOURCE", new SourceCheck())
    _checks.put("GROUNDING", new GroundingCheck())
  }

  override function verify(proposal : Proposal) : Verdict {
    var runId = UUID.randomUUID().toString()
    var allNodes = new ArrayList<NodeResult>()
    var ruleResults = new HashMap<String, NodeStatus>()  // ruleCode -> worst status across all targets
    var matchedClauses = new HashSet<String>()  // Track which clauses are matched by at least one rule

    // Run rules in topological order
    for (var ruleCode in _graph.OrderedRuleCodes) {
      var rule = _loader.RulesByCode.get(ruleCode)
      var check = _checks.get(rule.LayerStr)
      if (check == null) {
        throw new IllegalStateException("No check implementation for layer: " + rule.LayerStr)
      }

      // Check if any dependency failed or was skipped
      var depsFailed = false
      for (var dep in rule.DependsOn) {
        var depStatus = ruleResults.get(dep)
        if (depStatus == NodeStatus.FAILED || depStatus == NodeStatus.SKIPPED) {
          depsFailed = true
          break
        }
      }

      var selector = new Selector(rule.AppliesTo)

      if (selector.isProposalLevel()) {
        // Proposal-level rule
        if (depsFailed) {
          var skippedNode = makeSkippedNode(rule, null)
          allNodes.add(skippedNode)
          ruleResults.put(ruleCode, NodeStatus.SKIPPED)
        } else {
          var node = check.evaluate(rule, null, proposal, _loader.SourcesByCode)
          allNodes.add(node)
          ruleResults.put(ruleCode, node.Result)
        }
      } else {
        // Clause-level rule
        var targets = selector.selectTargets(proposal)
        var worstStatus = NodeStatus.PASSED
        if (targets != null && !targets.isEmpty()) {
          for (var clause in targets) {
            matchedClauses.add(clause.ClauseId)
            if (depsFailed) {
              var skippedNode = makeSkippedNode(rule, clause.ClauseId)
              allNodes.add(skippedNode)
              worstStatus = NodeStatus.SKIPPED
            } else {
              var node = check.evaluate(rule, clause, proposal, _loader.SourcesByCode)
              allNodes.add(node)
              if (node.Result == NodeStatus.FAILED) {
                worstStatus = NodeStatus.FAILED
              } else if (node.Result == NodeStatus.SKIPPED && worstStatus != NodeStatus.FAILED) {
                worstStatus = NodeStatus.SKIPPED
              }
            }
          }
        }
        // If no targets matched, the rule is not applicable — no nodes generated
        if (targets == null || targets.isEmpty()) {
          ruleResults.put(ruleCode, NodeStatus.PASSED)
        } else {
          ruleResults.put(ruleCode, worstStatus)
        }
      }
    }

    // Check for unmatched clauses (patternCode no rule covers) → NEEDS_REVIEW
    if (proposal.Clauses != null) {
      for (var clause in proposal.Clauses) {
        if (!isPatternCovered(clause.PatternCode)) {
          var reviewNode = new NodeResult()
          reviewNode.RuleCode = "UNMATCHED"
          reviewNode.ClauseId = clause.ClauseId
          reviewNode.Layer = Layer.TYPE
          reviewNode.Result = NodeStatus.NEEDS_REVIEW
          reviewNode.Expected = "pattern covered by rule graph"
          reviewNode.Actual = "clause " + clause.PatternCode + " not matched by any rule"
          reviewNode.Reason = "Clause " + clause.PatternCode + " (" + clause.ClauseId + ") is not covered by any rule"
          allNodes.add(reviewNode)
        }
      }
    }

    // Determine status
    var hasFailed = false
    var hasNeedsReview = false
    for (var node in allNodes) {
      if (node.Result == NodeStatus.FAILED) hasFailed = true
      if (node.Result == NodeStatus.NEEDS_REVIEW) hasNeedsReview = true
    }
    var status = (hasFailed || hasNeedsReview) ? VerdictStatus.BLOCKED : VerdictStatus.PASSED

    // Compute hashes
    var proposalHash = Hashing.hashObject(proposal)
    var rulesetHash = _loader.RulesetHash

    // Build verdict hash payload
    var verdictPayload = new HashMap<String, Object>()
    verdictPayload.put("status", status.name())
    verdictPayload.put("nodes", allNodes)
    verdictPayload.put("rulesetHash", rulesetHash)
    verdictPayload.put("proposalHash", proposalHash)
    var verdictHash = Hashing.sha256Hex(Json.canonical(verdictPayload))

    // Gate token only when PASSED
    var gateToken : String = null
    if (status == VerdictStatus.PASSED) {
      gateToken = GateToken.issue(runId, proposalHash, rulesetHash)
    }

    var verdict = new Verdict()
    verdict.RunId = runId
    verdict.Status = status
    verdict.Nodes = allNodes
    verdict.RulesetHash = rulesetHash
    verdict.ProposalHash = proposalHash
    verdict.VerdictHash = verdictHash
    verdict.GateToken = gateToken
    return verdict
  }

  private function makeSkippedNode(rule : RuleDefinition, clauseId : String) : NodeResult {
    var node = new NodeResult()
    node.RuleCode = rule.RuleCode
    node.ClauseId = clauseId
    node.Layer = Layer.valueOf(rule.LayerStr)
    node.Result = NodeStatus.SKIPPED
    node.Expected = ""
    node.Actual = ""
    node.Reason = "Skipped due to failed dependency"
    node.SourceCode = rule.SourceCode
    return node
  }

  private function isPatternCovered(patternCode : String) : boolean {
    if (patternCode == null) return false
    var covered = {
      "SMCyberDataBreachCov",
      "SMCyberPrivacyLiabilityCov",
      "SMCyberExtortionCov",
      "SMCyberBusinessInterruptionCov",
      "SMCyberRegulatoryFinesCov",
      "SMCyberWarExcl",
      "SMCyberPriorKnownExcl",
      "SMCyberIntentionalActsExcl",
      "SMCyberInfraFailureExcl",
      "SMCyberBaseRatingCov"
    }
    if (covered.contains(patternCode)) return true
    for (rule in _loader.Rules) {
      if (rule.AppliesTo != null && rule.AppliesTo.contains("patternCode=" + patternCode)) {
        return true
      }
    }
    return false
  }
}
