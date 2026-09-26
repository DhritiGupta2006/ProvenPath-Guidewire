package provenpath.core.engine

uses java.util.ArrayList
uses java.util.HashMap
uses java.util.List
uses java.util.Map
uses org.jgrapht.graph.DefaultEdge
uses org.jgrapht.graph.DirectedAcyclicGraph
uses org.jgrapht.traverse.TopologicalOrderIterator

/**
 * Builds a JGraphT DAG from RuleDefinitions.
 * Provides cycle detection with clear error messages, and deterministic topological ordering
 * (ties broken by rule_code).
 */
class RuleGraph {

  var _dag : DirectedAcyclicGraph<String, DefaultEdge>
  var _orderedRuleCodes : List<String> as readonly OrderedRuleCodes
  var _rulesByCode : Map<String, RuleDefinition>

  construct(rules : List<RuleDefinition>) {
    _rulesByCode = new HashMap<String, RuleDefinition>()
    for (var rule in rules) {
      _rulesByCode.put(rule.RuleCode, rule)
    }
    buildGraph(rules)
  }

  private function buildGraph(rules : List<RuleDefinition>) {
    // Use DirectedAcyclicGraph which throws on cycle insertion
    _dag = new DirectedAcyclicGraph<String, DefaultEdge>(DefaultEdge)

    // Add all vertices first
    for (var rule in rules) {
      _dag.addVertex(rule.RuleCode)
    }

    // Add edges (dependency → dependent: edge from dep to rule)
    for (var rule in rules) {
      for (var dep in rule.DependsOn) {
        if (!_dag.containsVertex(dep)) {
          throw new IllegalStateException(
            "Rule " + rule.RuleCode + " depends on unknown rule: " + dep)
        }
        try {
          _dag.addEdge(dep, rule.RuleCode)
        } catch (e : IllegalArgumentException) {
          throw new IllegalStateException(
            "Cycle detected involving rules: " + dep + " -> " + rule.RuleCode +
            ". Adding edge from " + dep + " to " + rule.RuleCode + " would create a cycle.")
        }
      }
    }

    // Compute deterministic topological order (ties broken by rule_code alphabetically)
    var iter = new TopologicalOrderIterator<String, DefaultEdge>(_dag)
    var ordered = new ArrayList<String>()
    while (iter.hasNext()) {
      ordered.add(iter.next())
    }
    // TopologicalOrderIterator already produces a valid topological order,
    // but we need deterministic tie-breaking. We do a stable sort that
    // respects topological constraints while breaking ties alphabetically.
    _orderedRuleCodes = deterministicTopoSort(rules)
  }

  /**
   * Kahn's algorithm with alphabetical tie-breaking for deterministic order.
   */
  private function deterministicTopoSort(rules : List<RuleDefinition>) : List<String> {
    var inDegree = new HashMap<String, Integer>()
    var adjList = new HashMap<String, List<String>>()

    for (var rule in rules) {
      inDegree.put(rule.RuleCode, 0)
      adjList.put(rule.RuleCode, new ArrayList<String>())
    }

    for (var rule in rules) {
      for (var dep in rule.DependsOn) {
        adjList.get(dep).add(rule.RuleCode)
        inDegree.put(rule.RuleCode, inDegree.get(rule.RuleCode) + 1)
      }
    }

    // Use a TreeSet (sorted) for deterministic ordering when multiple nodes have in-degree 0
    var queue = new java.util.TreeSet<String>()
    for (var entry in inDegree.entrySet()) {
      if (entry.getValue() == 0) {
        queue.add(entry.getKey())
      }
    }

    var result = new ArrayList<String>()
    while (!queue.isEmpty()) {
      var node = queue.first()
      queue.remove(node)
      result.add(node)
      for (var neighbor in adjList.get(node)) {
        var newDeg = inDegree.get(neighbor) - 1
        inDegree.put(neighbor, newDeg)
        if (newDeg == 0) {
          queue.add(neighbor)
        }
      }
    }

    if (result.size() != rules.size()) {
      // Find the cycle for the error message
      var remaining = new ArrayList<String>()
      for (var rule in rules) {
        if (!result.contains(rule.RuleCode)) {
          remaining.add(rule.RuleCode)
        }
      }
      throw new IllegalStateException(
        "Cycle detected in rule graph involving: " + remaining.toString())
    }

    return result
  }

  /**
   * Returns the direct dependencies of a rule.
   */
  function getDependencies(ruleCode : String) : List<String> {
    var rule = _rulesByCode.get(ruleCode)
    return rule != null ? rule.DependsOn : new ArrayList<String>()
  }

  /**
   * Returns true if the given rule depends (directly or transitively) on the other.
   */
  function dependsOn(ruleCode : String, otherCode : String) : boolean {
    return _dag.getAncestors(ruleCode).contains(otherCode)
  }
}
