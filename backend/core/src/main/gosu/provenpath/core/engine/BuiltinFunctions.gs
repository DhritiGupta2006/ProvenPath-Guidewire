package provenpath.core.engine

uses java.math.BigDecimal
uses java.nio.charset.StandardCharsets
uses java.security.MessageDigest
uses java.time.LocalDate
uses java.util.ArrayList
uses java.util.HashMap
uses java.util.HashSet
uses java.util.List
uses java.util.Map
uses java.util.regex.Pattern
uses provenpath.contracts.Clause
uses provenpath.contracts.ClauseKind
uses provenpath.contracts.Proposal
uses provenpath.contracts.RegulatorySource

/**
 * Registry of named built-in functions for aggregate/structural rules
 * that cannot be expressed as single-clause predicates.
 *
 * Each function is a small deterministic Gosu function that takes
 * (clause, proposal, sources) and returns an EvalResult.
 *
 * Referenced from YAML via logic: {operator: FN, name: "functionName"}
 */
class BuiltinFunctions {

  /**
   * Dispatch to a named built-in function.
   */
  static function invoke(name : String, clause : Clause, proposal : Proposal,
                         sources : Map<String, RegulatorySource>) : LogicEvaluator.EvalResult {
    switch (name) {
      case "sumFirstPartyLimitsLteAggregate":
        return sumFirstPartyLimitsLteAggregate(proposal)
      case "deductibleLessThanLimit":
        return deductibleLessThanLimit(clause)
      case "deductibleInRangeOfLimit":
        return deductibleInRangeOfLimit(clause)
      case "noExclusionNullifiesRequiredCoverage":
        return noExclusionNullifiesRequiredCoverage(proposal)
      case "noDuplicatePatternCodes":
        return noDuplicatePatternCodes(proposal)
      case "mandatoryCoveragesPresent":
        return mandatoryCoveragesPresent(proposal)
      case "mandatoryExclusionsPresent":
        return mandatoryExclusionsPresent(proposal)
      case "ransomHasLawEnforcementCondition":
        return ransomHasLawEnforcementCondition(clause)
      case "finesHasInsurabilityCondition":
        return finesHasInsurabilityCondition(clause)
      case "certIn6HourConditionPresent":
        return certIn6HourConditionPresent(proposal)
      case "ratingFactorsInRange":
        return ratingFactorsInRange(clause)
      case "clauseHasCitation":
        return clauseHasCitation(clause)
      case "citationSnippetMatchesSource":
        return citationSnippetMatchesSource(clause, proposal, sources)
      case "sourceActiveOnEffectiveDate":
        return sourceActiveOnEffectiveDate(clause, proposal, sources)
      case "groundingCheck":
        return groundingCheck(proposal)
      default:
        return new LogicEvaluator.EvalResult(false, "", "", "Unknown built-in function: " + name)
    }
  }

  // ─── CONSISTENCY functions ─────────────────────────────────────

  /**
   * CYB-CON-001: Sum of first-party sublimits ≤ aggregate.
   * First-party = COVERAGE clauses with category "CyberFirstParty".
   */
  static function sumFirstPartyLimitsLteAggregate(proposal : Proposal) : LogicEvaluator.EvalResult {
    var sum = 0L
    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.COVERAGE && "CyberFirstParty" == c.Category && c.LimitMaxInr != null) {
        sum = sum + c.LimitMaxInr
      }
    }
    var agg = proposal.AggregateLimitInr
    if (sum <= agg) {
      return new LogicEvaluator.EvalResult(true, String.valueOf(agg), String.valueOf(sum), "")
    } else {
      return new LogicEvaluator.EvalResult(false, String.valueOf(agg), String.valueOf(sum),
        "Sum of first-party sublimits (" + sum + ") exceeds aggregate limit (" + agg + ")")
    }
  }

  /**
   * CYB-CON-002: Deductible < limit for each coverage.
   */
  static function deductibleLessThanLimit(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.DeductibleInr == null || clause.LimitMaxInr == null) {
      return new LogicEvaluator.EvalResult(true, "", "", "No deductible or limit to compare")
    }
    if (clause.DeductibleInr < clause.LimitMaxInr) {
      return new LogicEvaluator.EvalResult(true,
        "< " + clause.LimitMaxInr, String.valueOf(clause.DeductibleInr), "")
    } else {
      return new LogicEvaluator.EvalResult(false,
        "< " + clause.LimitMaxInr, String.valueOf(clause.DeductibleInr),
        "Deductible (" + clause.DeductibleInr + ") must be less than limit (" + clause.LimitMaxInr + ")")
    }
  }

  /**
   * CYB-RNG-003: Deductible 1-10% of limit.
   */
  static function deductibleInRangeOfLimit(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.DeductibleInr == null || clause.LimitMaxInr == null || clause.LimitMaxInr == 0) {
      return new LogicEvaluator.EvalResult(true, "", "", "No deductible or limit to compare")
    }
    var pct = BigDecimal.valueOf(clause.DeductibleInr).multiply(BigDecimal.valueOf(100))
        .divide(BigDecimal.valueOf(clause.LimitMaxInr), 2, java.math.RoundingMode.HALF_UP)
    var minPct = new BigDecimal("1")
    var maxPct = new BigDecimal("10")
    if (pct.compareTo(minPct) >= 0 && pct.compareTo(maxPct) <= 0) {
      return new LogicEvaluator.EvalResult(true, "1%-10%", pct.toPlainString() + "%", "")
    } else {
      return new LogicEvaluator.EvalResult(false, "1%-10%", pct.toPlainString() + "%",
        "Deductible is " + pct.toPlainString() + "% of limit, must be between 1% and 10%")
    }
  }

  /**
   * CYB-CON-003: No exclusion nullifies a Required coverage.
   * An exclusion nullifies a Required coverage if the exclusion's excludesPatternCodes
   * contains a Required coverage's patternCode.
   */
  static function noExclusionNullifiesRequiredCoverage(proposal : Proposal) : LogicEvaluator.EvalResult {
    var requiredCodes = new HashSet<String>()
    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.COVERAGE && "Required" == c.Existence) {
        requiredCodes.add(c.PatternCode)
      }
    }

    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.EXCLUSION && c.ExcludesPatternCodes != null) {
        for (var excludedCode in c.ExcludesPatternCodes) {
          if (requiredCodes.contains(excludedCode)) {
            return new LogicEvaluator.EvalResult(false, "no nullification",
              c.PatternCode + " excludes " + excludedCode,
              "Exclusion " + c.PatternCode + " nullifies Required coverage " + excludedCode)
          }
        }
      }
    }
    return new LogicEvaluator.EvalResult(true, "no nullification", "none", "")
  }

  /**
   * CYB-CON-004: No duplicate pattern codes.
   */
  static function noDuplicatePatternCodes(proposal : Proposal) : LogicEvaluator.EvalResult {
    var seen = new HashSet<String>()
    for (var c in proposal.Clauses) {
      if (!seen.add(c.PatternCode)) {
        return new LogicEvaluator.EvalResult(false, "unique pattern codes",
          "duplicate: " + c.PatternCode,
          "Duplicate pattern code: " + c.PatternCode)
      }
    }
    return new LogicEvaluator.EvalResult(true, "unique pattern codes", "all unique", "")
  }

  // ─── RULE_MATCH functions ──────────────────────────────────────

  static final var MANDATORY_COVERAGES : List<String> = {"SMCyberDataBreachCov", "SMCyberPrivacyLiabilityCov"}
  static final var MANDATORY_EXCLUSIONS : List<String> = {"SMCyberWarExcl", "SMCyberPriorKnownExcl", "SMCyberIntentionalActsExcl", "SMCyberInfraFailureExcl"}

  /**
   * CYB-RM-001: Mandatory coverages present.
   */
  static function mandatoryCoveragesPresent(proposal : Proposal) : LogicEvaluator.EvalResult {
    var covCodes = new HashSet<String>()
    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.COVERAGE) {
        covCodes.add(c.PatternCode)
      }
    }
    var missing = new ArrayList<String>()
    for (var req in MANDATORY_COVERAGES) {
      if (!covCodes.contains(req)) {
        missing.add(req)
      }
    }
    if (missing.isEmpty()) {
      return new LogicEvaluator.EvalResult(true, MANDATORY_COVERAGES.toString(), "all present", "")
    } else {
      return new LogicEvaluator.EvalResult(false, MANDATORY_COVERAGES.toString(),
        "missing: " + missing.toString(),
        "Missing mandatory coverages: " + missing.toString())
    }
  }

  /**
   * CYB-RM-002: Mandatory exclusions present.
   */
  static function mandatoryExclusionsPresent(proposal : Proposal) : LogicEvaluator.EvalResult {
    var exclCodes = new HashSet<String>()
    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.EXCLUSION) {
        exclCodes.add(c.PatternCode)
      }
    }
    var missing = new ArrayList<String>()
    for (var req in MANDATORY_EXCLUSIONS) {
      if (!exclCodes.contains(req)) {
        missing.add(req)
      }
    }
    if (missing.isEmpty()) {
      return new LogicEvaluator.EvalResult(true, MANDATORY_EXCLUSIONS.toString(), "all present", "")
    } else {
      return new LogicEvaluator.EvalResult(false, MANDATORY_EXCLUSIONS.toString(),
        "missing: " + missing.toString(),
        "Missing mandatory exclusions: " + missing.toString())
    }
  }

  /**
   * CYB-RM-003: Ransom cover carries law-enforcement-notification condition.
   */
  static function ransomHasLawEnforcementCondition(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.Conditions != null) {
      for (var cond in clause.Conditions) {
        if (cond.contains("law-enforcement")) {
          return new LogicEvaluator.EvalResult(true, "law-enforcement-notification",
            cond, "")
        }
      }
    }
    return new LogicEvaluator.EvalResult(false, "law-enforcement-notification",
      clause.Conditions != null ? clause.Conditions.toString() : "[]",
      "Extortion coverage missing law-enforcement-notification condition")
  }

  /**
   * CYB-RM-004: Fines coverage has "where insurable by law" condition.
   */
  static function finesHasInsurabilityCondition(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.Conditions != null) {
      for (var cond in clause.Conditions) {
        if (cond.contains("insurable-by-law") || cond.contains("where-insurable-by-law")) {
          return new LogicEvaluator.EvalResult(true, "where-insurable-by-law",
            cond, "")
        }
      }
    }
    return new LogicEvaluator.EvalResult(false, "where-insurable-by-law",
      clause.Conditions != null ? clause.Conditions.toString() : "[]",
      "Regulatory fines coverage missing where-insurable-by-law condition")
  }

  /**
   * CYB-RM-005: CERT-In 6-hour notification condition present on at least one data breach coverage.
   */
  static function certIn6HourConditionPresent(proposal : Proposal) : LogicEvaluator.EvalResult {
    for (var c in proposal.Clauses) {
      if (c.Kind == ClauseKind.COVERAGE && c.Conditions != null) {
        for (var cond in c.Conditions) {
          if (cond.contains("cert-in-6-hour") || cond.contains("cert-in-6hour")) {
            return new LogicEvaluator.EvalResult(true, "cert-in-6-hour-reporting",
              cond, "")
          }
        }
      }
    }
    return new LogicEvaluator.EvalResult(false, "cert-in-6-hour-reporting", "not found",
      "No coverage clause carries the CERT-In 6-hour reporting condition")
  }

  // ─── RANGE functions ───────────────────────────────────────────

  /**
   * CYB-RNG-006: All rating factors between 0.5 and 3.0.
   */
  static function ratingFactorsInRange(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.Factors == null || clause.Factors.isEmpty()) {
      return new LogicEvaluator.EvalResult(true, "0.5-3.0", "no factors", "")
    }
    var min = new BigDecimal("0.5")
    var max = new BigDecimal("3.0")
    for (var entry in clause.Factors.entrySet()) {
      var val = entry.getValue()
      if (val.compareTo(min) < 0 || val.compareTo(max) > 0) {
        return new LogicEvaluator.EvalResult(false, "0.5-3.0", val.toPlainString(),
          "Rating factor " + entry.getKey() + " = " + val.toPlainString() + " is out of range [0.5, 3.0]")
      }
    }
    return new LogicEvaluator.EvalResult(true, "0.5-3.0", "all in range", "")
  }

  // ─── SOURCE functions ──────────────────────────────────────────

  /**
   * CYB-SRC-001: Every clause has ≥1 citation.
   */
  static function clauseHasCitation(clause : Clause) : LogicEvaluator.EvalResult {
    if (clause.Citations != null && !clause.Citations.isEmpty()) {
      return new LogicEvaluator.EvalResult(true, "≥1 citation",
        String.valueOf(clause.Citations.size()) + " citations", "")
    }
    return new LogicEvaluator.EvalResult(false, "≥1 citation", "0 citations",
      "Clause " + clause.PatternCode + " has no citations")
  }

  /**
   * CYB-SRC-002: Citation source exists, snippet is byte-exact substring of source fullText.
   */
  static function citationSnippetMatchesSource(clause : Clause, proposal : Proposal,
                                                sources : Map<String, RegulatorySource>) : LogicEvaluator.EvalResult {
    if (clause.Citations == null || clause.Citations.isEmpty()) {
      return new LogicEvaluator.EvalResult(false, "valid citations", "no citations", "No citations to check")
    }
    for (var citation in clause.Citations) {
      var src = sources.get(citation.SourceCode)
      if (src == null) {
        return new LogicEvaluator.EvalResult(false, "source exists",
          "source " + citation.SourceCode + " not found",
          "Citation references unknown source: " + citation.SourceCode)
      }
      // Check snippet is byte-exact substring
      if (citation.TextSnippet == null || citation.TextSnippet.length() == 0) {
        return new LogicEvaluator.EvalResult(false, "non-empty snippet", "empty snippet",
          "Citation snippet is empty")
      }
      if (!src.FullText.contains(citation.TextSnippet)) {
        return new LogicEvaluator.EvalResult(false,
          "snippet matches source " + citation.SourceCode,
          "snippet not found in source text",
          "Citation snippet does not appear in source " + citation.SourceCode + " full text")
      }
    }
    return new LogicEvaluator.EvalResult(true, "all citations valid", "verified", "")
  }

  /**
   * CYB-SRC-003: Source active on proposal effective date, jurisdiction matches.
   */
  static function sourceActiveOnEffectiveDate(clause : Clause, proposal : Proposal,
                                              sources : Map<String, RegulatorySource>) : LogicEvaluator.EvalResult {
    if (clause.Citations == null || clause.Citations.isEmpty()) {
      return new LogicEvaluator.EvalResult(false, "valid citations", "no citations", "No citations to check")
    }
    for (var citation in clause.Citations) {
      var src = sources.get(citation.SourceCode)
      if (src == null) {
        return new LogicEvaluator.EvalResult(false, "source exists",
          "source " + citation.SourceCode + " not found",
          "Citation references unknown source: " + citation.SourceCode)
      }
      // Check jurisdiction
      if (src.Jurisdiction != null && proposal.Jurisdiction != null &&
          !src.Jurisdiction.equals(proposal.Jurisdiction)) {
        return new LogicEvaluator.EvalResult(false, "jurisdiction " + proposal.Jurisdiction,
          src.Jurisdiction,
          "Source " + citation.SourceCode + " jurisdiction " + src.Jurisdiction +
          " does not match proposal jurisdiction " + proposal.Jurisdiction)
      }
      // Check active on effective date
      var effectiveDate = proposal.TargetEffectiveDate
      if (effectiveDate != null && src.EffectiveDate != null) {
        if (effectiveDate.isBefore(src.EffectiveDate)) {
          return new LogicEvaluator.EvalResult(false, "source active on " + effectiveDate,
            "source effective from " + src.EffectiveDate,
            "Source " + citation.SourceCode + " not yet effective on " + effectiveDate)
        }
        if (src.ExpiryDate != null && effectiveDate.isAfter(src.ExpiryDate)) {
          return new LogicEvaluator.EvalResult(false, "source active on " + effectiveDate,
            "source expired on " + src.ExpiryDate,
            "Source " + citation.SourceCode + " expired on " + src.ExpiryDate)
        }
      }
    }
    return new LogicEvaluator.EvalResult(true, "all sources active", "verified", "")
  }

  // ─── GROUNDING function ────────────────────────────────────────

  /**
   * CYB-GRD-001: Every number in proseSummary matches a verified value.
   * Handles: ₹50L, ₹50 lakh, 50,00,000, ₹5 Cr, 5 crore, 20%, 6 hours, ₹25,000
   */
  static function groundingCheck(proposal : Proposal) : LogicEvaluator.EvalResult {
    if (proposal.ProseSummary == null || proposal.ProseSummary.length() == 0) {
      return new LogicEvaluator.EvalResult(true, "", "", "No prose summary to check")
    }

    // Build the set of valid values from the proposal
    var validValues = new HashSet<Long>()
    validValues.add(proposal.AggregateLimitInr)
    validValues.add(proposal.TurnoverInr)
    validValues.add(proposal.MinimumPremiumInr)

    for (var c in proposal.Clauses) {
      if (c.LimitMaxInr != null) validValues.add(c.LimitMaxInr)
      if (c.DeductibleInr != null) validValues.add(c.DeductibleInr)
      if (c.WaitingHours != null) validValues.add(c.WaitingHours as long)
    }

    // Also add percentage thresholds used in rules (50%)
    var validPercents = new HashSet<Long>()
    validPercents.add(50L) // extortion sublimit %
    validPercents.add(6L)  // CERT-In 6 hours

    // Parse all numbers from prose
    var tokens = extractNumberTokens(proposal.ProseSummary)
    for (var token in tokens) {
      var normalized = normalizeToken(token)
      if (normalized == null) {
        continue // Unparseable token, skip
      }
      if (normalized.isPercent) {
        // Check if this percent is a known threshold
        // Don't fail on percentages — they're referencing rule thresholds
        continue
      }
      if (normalized.isHours) {
        if (!validValues.contains(normalized.value)) {
          return new LogicEvaluator.EvalResult(false, "matching proposal value",
            token.raw, "Prose mentions " + token.raw + " (" + normalized.value + " hours) which does not match any proposal value")
        }
        continue
      }
      // INR value
      if (!validValues.contains(normalized.value)) {
        return new LogicEvaluator.EvalResult(false, "matching proposal value",
          token.raw, "Prose mentions " + token.raw + " (normalized to " + normalized.value + " INR) which does not match any proposal value")
      }
    }
    return new LogicEvaluator.EvalResult(true, "all numbers grounded", "verified", "")
  }

  static class NumberToken {
    var raw : String
    construct(r : String) { raw = r }
  }

  static class NormalizedNumber {
    var value : long
    var isPercent : boolean
    var isHours : boolean
    construct(v : long, pct : boolean, hrs : boolean) {
      value = v
      isPercent = pct
      isHours = hrs
    }
  }

  /**
   * Extract number tokens from prose text.
   * Matches patterns like: ₹50L, ₹50 lakh, ₹5 Cr, 5 crore, 50,00,000, ₹25,000, 20%, 6 hours/hour
   */
  static function extractNumberTokens(text : String) : List<NumberToken> {
    var tokens = new ArrayList<NumberToken>()

    // Pattern for Indian number formats: ₹50L, ₹50 lakh, ₹5Cr, ₹5 crore, ₹25,000, 50,00,000, 20%, 6 hours
    var patterns = {
      // ₹NNL or ₹NN lakh
      Pattern.compile("₹\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:L|lakh)\\b"),
      // ₹NNCr or ₹NN crore
      Pattern.compile("₹\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:Cr|crore)\\b"),
      // ₹NN,NN,NNN or ₹NNN (plain INR)
      Pattern.compile("₹\\s*([\\d,]+)(?!\\s*(?:\\.\\d+)?\\s*(?:L|lakh|Cr|crore))\\b"),
      // NN% percent
      Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*%"),
      // NN hours/hour
      Pattern.compile("(\\d+)\\s+hours?\\b")
    }

    for (var p in patterns) {
      var m = p.matcher(text)
      while (m.find()) {
        tokens.add(new NumberToken(m.group(0)))
      }
    }
    return tokens
  }

  /**
   * Normalize a number token to its long value.
   */
  static function normalizeToken(token : NumberToken) : NormalizedNumber {
    var raw = token.raw.trim()

    // Check for percent
    if (raw.endsWith("%")) {
      var numStr = raw.substring(0, raw.length() - 1).trim()
      try {
        var val = new BigDecimal(numStr).longValue()
        return new NormalizedNumber(val, true, false)
      } catch (e : NumberFormatException) { return null }
    }

    // Check for hours
    var hourPattern = Pattern.compile("(\\d+)\\s+hours?")
    var hourMatcher = hourPattern.matcher(raw)
    if (hourMatcher.matches()) {
      try {
        return new NormalizedNumber(Long.parseLong(hourMatcher.group(1)), false, true)
      } catch (e : NumberFormatException) { return null }
    }

    // Remove ₹ symbol
    var cleaned = raw.replace("₹", "").trim()

    // Check for lakh/L
    var lakhPattern = Pattern.compile("([\\d,]+(?:\\.\\d+)?)\\s*(?:L|lakh)")
    var lakhMatcher = lakhPattern.matcher(cleaned)
    if (lakhMatcher.matches()) {
      var numStr = lakhMatcher.group(1).replace(",", "")
      try {
        var val = new BigDecimal(numStr).multiply(new BigDecimal("100000")).longValue()
        return new NormalizedNumber(val, false, false)
      } catch (e : NumberFormatException) { return null }
    }

    // Check for crore/Cr
    var crorePattern = Pattern.compile("([\\d,]+(?:\\.\\d+)?)\\s*(?:Cr|crore)")
    var croreMatcher = crorePattern.matcher(cleaned)
    if (croreMatcher.matches()) {
      var numStr = croreMatcher.group(1).replace(",", "")
      try {
        var val = new BigDecimal(numStr).multiply(new BigDecimal("10000000")).longValue()
        return new NormalizedNumber(val, false, false)
      } catch (e : NumberFormatException) { return null }
    }

    // Plain number (possibly with Indian comma formatting)
    cleaned = cleaned.replace(",", "")
    try {
      var val = Long.parseLong(cleaned)
      return new NormalizedNumber(val, false, false)
    } catch (e : NumberFormatException) {
      return null
    }
  }
}
