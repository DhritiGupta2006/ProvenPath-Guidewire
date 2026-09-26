package provenpath.core.engine

uses java.util.ArrayList
uses java.util.List
uses java.util.regex.Pattern
uses provenpath.contracts.Clause
uses provenpath.contracts.ClauseKind
uses provenpath.contracts.Proposal

/**
 * Parses and matches the `applies_to` selector from rule YAML.
 *
 * Supported selectors:
 *   proposal              → matches the whole proposal (target is null clause)
 *   coverage[*]           → all COVERAGE clauses
 *   exclusion[*]          → all EXCLUSION clauses
 *   rating[*]             → all RATING clauses
 *   clause[*]             → all clauses regardless of kind
 *   coverage[patternCode=X]  → only the coverage with the given patternCode
 *   exclusion[patternCode=X] → only the exclusion with the given patternCode
 */
class Selector {

  var _raw : String
  var _targetType : String  // "proposal", "coverage", "exclusion", "rating", "clause"
  var _filterField : String // null, or "patternCode"
  var _filterValue : String // null, or the value to match

  static final var PATTERN : Pattern = Pattern.compile(
    "^(proposal|coverage|exclusion|rating|clause)(?:\\[(?:(\\*)|([a-zA-Z]+)=([^\\]]+))\\])?$"
  )

  construct(raw : String) {
    _raw = raw
    parse()
  }

  private function parse() {
    var m = PATTERN.matcher(_raw)
    if (!m.matches()) {
      throw new IllegalArgumentException("Invalid applies_to selector: " + _raw)
    }
    _targetType = m.group(1)
    if (m.group(2) != null) {
      // wildcard [*]
      _filterField = null
      _filterValue = null
    } else if (m.group(3) != null) {
      // field=value filter
      _filterField = m.group(3)
      _filterValue = m.group(4)
    }
    // else bare "proposal" with no brackets
  }

  /**
   * Returns the list of matching targets from the proposal.
   * For "proposal" selector, returns a list with a single null entry (meaning proposal-level rule).
   * For clause selectors, returns matching clauses.
   */
  function selectTargets(proposal : Proposal) : List<Clause> {
    if (_targetType == "proposal") {
      // Return empty list with a sentinel null — callers check for proposal-level
      return null // Callers handle this specially
    }

    var results = new ArrayList<Clause>()
    if (proposal.Clauses == null) return results

    for (var clause in proposal.Clauses) {
      if (matchesClause(clause)) {
        results.add(clause)
      }
    }
    return results
  }

  /**
   * Returns true if this is a proposal-level selector.
   */
  function isProposalLevel() : boolean {
    return _targetType == "proposal"
  }

  private function matchesClause(clause : Clause) : boolean {
    // Check kind match
    if (_targetType == "coverage" && clause.Kind != ClauseKind.COVERAGE) return false
    if (_targetType == "exclusion" && clause.Kind != ClauseKind.EXCLUSION) return false
    if (_targetType == "rating" && clause.Kind != ClauseKind.RATING) return false
    // "clause" matches all kinds

    // Check filter
    if (_filterField != null && _filterValue != null) {
      if (_filterField == "patternCode") {
        return _filterValue == clause.PatternCode
      }
    }
    return true
  }

  property get Raw() : String { return _raw }
  property get TargetType() : String { return _targetType }
}
