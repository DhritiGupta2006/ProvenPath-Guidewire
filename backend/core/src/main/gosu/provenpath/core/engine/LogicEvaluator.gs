package provenpath.core.engine

uses java.math.BigDecimal
uses java.util.List
uses java.util.Map
uses java.util.regex.Pattern
uses provenpath.contracts.Clause
uses provenpath.contracts.Proposal

/**
 * Evaluates rule logic expressions against a clause and/or proposal.
 *
 * Operators: AND, OR, NOT, GT, GTE, LT, LTE, EQ, NEQ, IN, REGEX, EXISTS, TYPE_IS
 * Field paths: clause.limitMaxInr, proposal.aggregateLimitInr, etc.
 * value_ref grammar: <path> [* <number>] — hand-parsed, no eval/reflection.
 * Money math uses BigDecimal/Long, never double.
 */
class LogicEvaluator {

  /**
   * Result of evaluating a logic expression.
   */
  static class EvalResult {
    var _passed : boolean as Passed
    var _expected : String as Expected
    var _actual : String as Actual
    var _reason : String as Reason

    construct(passed : boolean, expected : String, actual : String, reason : String) {
      _passed = passed
      _expected = expected
      _actual = actual
      _reason = reason
    }
  }

  /**
   * Evaluate a logic map against a clause and proposal context.
   * For proposal-level rules, clause may be null.
   */
  static function evaluate(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    if (logic == null || logic.isEmpty()) {
      return new EvalResult(true, "", "", "No logic to evaluate")
    }
    var op = logic.get("operator") as String
    if (op == null) {
      return new EvalResult(true, "", "", "No operator specified")
    }

    switch (op) {
      case "AND":
        return evalAnd(logic, clause, proposal)
      case "OR":
        return evalOr(logic, clause, proposal)
      case "NOT":
        return evalNot(logic, clause, proposal)
      case "GT":
        return evalComparison(logic, clause, proposal, "GT")
      case "GTE":
        return evalComparison(logic, clause, proposal, "GTE")
      case "LT":
        return evalComparison(logic, clause, proposal, "LT")
      case "LTE":
        return evalComparison(logic, clause, proposal, "LTE")
      case "EQ":
        return evalEq(logic, clause, proposal)
      case "NEQ":
        return evalNeq(logic, clause, proposal)
      case "IN":
        return evalIn(logic, clause, proposal)
      case "REGEX":
        return evalRegex(logic, clause, proposal)
      case "EXISTS":
        return evalExists(logic, clause, proposal)
      case "TYPE_IS":
        return evalTypeIs(logic, clause, proposal)
      case "FN":
        // FN is handled by BuiltinFunctions — should not reach here in normal flow
        return new EvalResult(true, "", "", "FN handled externally")
      default:
        return new EvalResult(false, "", "", "Unknown operator: " + op)
    }
  }

  // ─── AND / OR / NOT ────────────────────────────────────────────

  private static function evalAnd(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var children = logic.get("children") as List<Map<String, Object>>
    if (children == null || children.isEmpty()) {
      return new EvalResult(true, "", "", "AND with no children")
    }
    for (var child in children) {
      var result = evaluate(child, clause, proposal)
      if (!result.Passed) {
        return result
      }
    }
    return new EvalResult(true, "", "", "All AND conditions passed")
  }

  private static function evalOr(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var children = logic.get("children") as List<Map<String, Object>>
    if (children == null || children.isEmpty()) {
      return new EvalResult(false, "", "", "OR with no children")
    }
    var lastResult : EvalResult = null
    for (var child in children) {
      var result = evaluate(child, clause, proposal)
      if (result.Passed) {
        return result
      }
      lastResult = result
    }
    return lastResult
  }

  private static function evalNot(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var children = logic.get("children") as List<Map<String, Object>>
    if (children == null || children.isEmpty()) {
      return new EvalResult(false, "", "", "NOT with no children")
    }
    var result = evaluate(children.get(0), clause, proposal)
    if (result.Passed) {
      return new EvalResult(false, result.Expected, result.Actual, "NOT condition was true but should be false")
    } else {
      return new EvalResult(true, result.Expected, result.Actual, "NOT condition correctly false")
    }
  }

  // ─── Comparison operators (GT, GTE, LT, LTE) ──────────────────

  private static function evalComparison(logic : Map<String, Object>, clause : Clause, proposal : Proposal, op : String) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    if (actualValue == null) {
      // If the field doesn't exist, skip comparison (treat as not applicable)
      return new EvalResult(true, "", "null", "Field " + field + " not present, skipping")
    }

    var expectedValue : BigDecimal
    var valueRef = logic.get("value_ref") as String
    if (valueRef != null) {
      expectedValue = resolveValueRef(valueRef, clause, proposal)
    } else {
      expectedValue = toBigDecimal(logic.get("value"))
    }

    var actualBd = toBigDecimal(actualValue)
    if (actualBd == null || expectedValue == null) {
      return new EvalResult(false, String.valueOf(expectedValue), String.valueOf(actualValue),
        "Cannot compare non-numeric values")
    }

    var cmp = actualBd.compareTo(expectedValue)
    var passed : boolean
    switch (op) {
      case "GT":  passed = cmp > 0; break
      case "GTE": passed = cmp >= 0; break
      case "LT":  passed = cmp < 0; break
      case "LTE": passed = cmp <= 0; break
      default:    passed = false
    }

    if (passed) {
      return new EvalResult(true, expectedValue.toPlainString(), actualBd.toPlainString(), "")
    } else {
      return new EvalResult(false, expectedValue.toPlainString(), actualBd.toPlainString(),
        "Expected " + op + " " + expectedValue.toPlainString() + " but got " + actualBd.toPlainString())
    }
  }

  // ─── EQ / NEQ ──────────────────────────────────────────────────

  private static function evalEq(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    var expectedValue = logic.get("value")
    var actualStr = actualValue != null ? actualValue.toString() : "null"
    var expectedStr = expectedValue != null ? expectedValue.toString() : "null"
    var passed = actualStr == expectedStr
    return new EvalResult(passed, expectedStr, actualStr,
      passed ? "" : "Expected " + expectedStr + " but got " + actualStr)
  }

  private static function evalNeq(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var result = evalEq(logic, clause, proposal)
    return new EvalResult(!result.Passed, result.Expected, result.Actual,
      result.Passed ? "Expected not equal to " + result.Expected : "")
  }

  // ─── IN ────────────────────────────────────────────────────────

  private static function evalIn(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    var values = logic.get("value") as List<Object>
    var actualStr = actualValue != null ? actualValue.toString() : "null"
    if (values == null) {
      return new EvalResult(false, "one of []", actualStr, "IN with no values list")
    }
    for (var v in values) {
      if (actualStr == v.toString()) {
        return new EvalResult(true, "one of " + values.toString(), actualStr, "")
      }
    }
    return new EvalResult(false, "one of " + values.toString(), actualStr,
      actualStr + " not found in " + values.toString())
  }

  // ─── REGEX ─────────────────────────────────────────────────────

  private static function evalRegex(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    var pattern = logic.get("value") as String
    var actualStr = actualValue != null ? actualValue.toString() : ""
    if (pattern == null) {
      return new EvalResult(false, "", actualStr, "REGEX with no pattern")
    }
    var matched = Pattern.matches(pattern, actualStr)
    return new EvalResult(matched, "matching " + pattern, actualStr,
      matched ? "" : actualStr + " does not match " + pattern)
  }

  // ─── EXISTS ────────────────────────────────────────────────────

  private static function evalExists(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    var exists = actualValue != null
    return new EvalResult(exists, "exists", exists ? "present" : "null",
      exists ? "" : "Field " + field + " does not exist")
  }

  // ─── TYPE_IS ───────────────────────────────────────────────────

  private static function evalTypeIs(logic : Map<String, Object>, clause : Clause, proposal : Proposal) : EvalResult {
    var field = logic.get("field") as String
    var actualValue = resolveFieldValue(field, clause, proposal)
    var expectedType = logic.get("value") as String
    if (actualValue == null) {
      return new EvalResult(false, expectedType, "null", "Field is null")
    }
    var actualType = actualValue.Class.SimpleName
    var passed = actualType.equalsIgnoreCase(expectedType)
    return new EvalResult(passed, expectedType, actualType,
      passed ? "" : "Expected type " + expectedType + " but got " + actualType)
  }

  // ─── Field resolution ─────────────────────────────────────────

  /**
   * Resolves a field path like "clause.limitMaxInr" or "proposal.aggregateLimitInr".
   */
  static function resolveFieldValue(fieldPath : String, clause : Clause, proposal : Proposal) : Object {
    if (fieldPath == null) return null
    var parts = fieldPath.split("\\.")
    if (parts.length < 2) return null

    var root = parts[0]
    var field = parts[1]

    if (root == "clause" && clause != null) {
      return getClauseField(clause, field)
    } else if (root == "proposal" && proposal != null) {
      return getProposalField(proposal, field)
    }
    return null
  }

  static function getClauseField(clause : Clause, field : String) : Object {
    switch (field) {
      case "clauseId": return clause.ClauseId
      case "kind": return clause.Kind != null ? clause.Kind.name() : null
      case "patternCode": return clause.PatternCode
      case "name": return clause.Name
      case "category": return clause.Category
      case "owningEntityType": return clause.OwningEntityType
      case "existence": return clause.Existence
      case "limitMaxInr": return clause.LimitMaxInr
      case "deductibleInr": return clause.DeductibleInr
      case "waitingHours": return clause.WaitingHours
      case "conditions": return clause.Conditions
      case "factors": return clause.Factors
      case "excludesPatternCodes": return clause.ExcludesPatternCodes
      case "citations": return clause.Citations
      default: return null
    }
  }

  static function getProposalField(proposal : Proposal, field : String) : Object {
    switch (field) {
      case "proposalId": return proposal.ProposalId
      case "executionId": return proposal.ExecutionId
      case "iteration": return proposal.Iteration
      case "line": return proposal.Line
      case "aggregateLimitInr": return proposal.AggregateLimitInr
      case "turnoverInr": return proposal.TurnoverInr
      case "minimumPremiumInr": return proposal.MinimumPremiumInr
      case "targetEffectiveDate": return proposal.TargetEffectiveDate
      case "jurisdiction": return proposal.Jurisdiction
      case "clauses": return proposal.Clauses
      case "proseSummary": return proposal.ProseSummary
      default: return null
    }
  }

  // ─── value_ref parser ──────────────────────────────────────────

  /**
   * Parses the value_ref grammar: <path> [* <number>]
   * Examples:
   *   "proposal.aggregateLimitInr"
   *   "proposal.aggregateLimitInr * 0.5"
   * No eval, no script engine, no reflection-eval.
   */
  static function resolveValueRef(valueRef : String, clause : Clause, proposal : Proposal) : BigDecimal {
    if (valueRef == null) return null
    var trimmed = valueRef.trim()

    // Check for multiplication: path * number
    var multiplyIdx = trimmed.indexOf(" * ")
    if (multiplyIdx >= 0) {
      var path = trimmed.substring(0, multiplyIdx).trim()
      var multiplierStr = trimmed.substring(multiplyIdx + 3).trim()
      var baseValue = resolveFieldValue(path, clause, proposal)
      var baseBd = toBigDecimal(baseValue)
      var multiplier = new BigDecimal(multiplierStr)
      if (baseBd != null) {
        return baseBd.multiply(multiplier)
      }
      return null
    }

    // Plain path reference
    var value = resolveFieldValue(trimmed, clause, proposal)
    return toBigDecimal(value)
  }

  /**
   * Parses a value_ref string and validates it conforms to the grammar.
   * Returns true if valid, false otherwise.
   * Grammar: <path> [* <number>]
   * <path> = word.word (dot-separated identifiers)
   * <number> = decimal number
   */
  static function isValidValueRef(valueRef : String) : boolean {
    if (valueRef == null || valueRef.trim().length() == 0) return false
    var trimmed = valueRef.trim()
    var VALUE_REF_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9]*\\.[a-zA-Z][a-zA-Z0-9]*(\\s*\\*\\s*[0-9]+(\\.[0-9]+)?)?$")
    return VALUE_REF_PATTERN.matcher(trimmed).matches()
  }

  // ─── Utility ───────────────────────────────────────────────────

  static function toBigDecimal(value : Object) : BigDecimal {
    if (value == null) return null
    if (value typeis BigDecimal) return value
    if (value typeis Long) return BigDecimal.valueOf(value)
    if (value typeis Integer) return BigDecimal.valueOf(value as long)
    if (value typeis Double) return BigDecimal.valueOf(value)
    if (value typeis Float) return BigDecimal.valueOf(value as double)
    if (value typeis String) {
      try { return new BigDecimal(value) } catch (e : NumberFormatException) { return null }
    }
    try { return new BigDecimal(value.toString()) } catch (e : NumberFormatException) { return null }
  }
}
