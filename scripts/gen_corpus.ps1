# Generates the additional 28 eval corpus items to reach ≥40 total.
# Run from the repo root: powershell -File scripts/gen_corpus.ps1

$corpusDir = "eval\corpus"
$mandatoryExclCitation = @{
  sourceCode = "IRDAI-CYB-G-2024-S4.2"
  section = "4.2"
  textSnippet = "The following exclusions are mandatory for all SME Cyber Insurance policies: War and State-Sponsored Attacks (SMCyberWarExcl), Prior Known Incidents (SMCyberPriorKnownExcl), Intentional Acts (SMCyberIntentionalActsExcl), and Infrastructure Failure (SMCyberInfraFailureExcl)."
}

function Make-Exclusion($id, $pc, $name) {
  return @{
    clauseId = $id; kind = "EXCLUSION"; patternCode = $pc; name = $name
    category = "CyberExclusion"; owningEntityType = "GeneralLiabilityLine"
    existence = "Required"; conditions = @()
    citations = @($mandatoryExclCitation)
  }
}

function Make-DataBreach($limit, $ded) {
  return @{
    clauseId = "c-001"; kind = "COVERAGE"; patternCode = "SMCyberDataBreachCov"
    name = "Data Breach Response Coverage"; category = "CyberFirstParty"
    owningEntityType = "GeneralLiabilityLine"; existence = "Required"
    limitMaxInr = $limit; deductibleInr = $ded; conditions = @("cert-in-6-hour-reporting")
    citations = @(
      @{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."},
      @{sourceCode="CERT-IN-DIR-2022-6HR";section="70B(6)";textSnippet="All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within 6 hours of noticing such incidents or being brought to notice about such incidents."}
    )
  }
}

function Make-Privacy($limit, $ded) {
  return @{
    clauseId = "c-002"; kind = "COVERAGE"; patternCode = "SMCyberPrivacyLiabilityCov"
    name = "Privacy Liability Coverage"; category = "CyberThirdParty"
    owningEntityType = "GeneralLiabilityLine"; existence = "Required"
    limitMaxInr = $limit; deductibleInr = $ded; conditions = @()
    citations = @(@{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."})
  }
}

function Make-Extortion($limit, $ded, $agg) {
  return @{
    clauseId = "c-003"; kind = "COVERAGE"; patternCode = "SMCyberExtortionCov"
    name = "Cyber Extortion Coverage"; category = "CyberFirstParty"
    owningEntityType = "GeneralLiabilityLine"; existence = "Suggested"
    limitMaxInr = $limit; deductibleInr = $ded; conditions = @("law-enforcement-notification")
    citations = @(
      @{sourceCode="IRDAI-CYB-G-2024-S3.4";section="3.4";textSnippet="The sublimit for Cyber Extortion or Ransomware coverage shall not exceed 50% of the policy aggregate limit to prevent disproportionate exposure to extortion-related claims."},
      @{sourceCode="IRDAI-CYB-G-2024-S4.3";section="4.3";textSnippet="Any coverage for cyber extortion or ransomware payments shall include a mandatory condition requiring the insured to notify law enforcement authorities before any payment is made."}
    )
  }
}

function Make-BI($limit, $ded, $hours) {
  return @{
    clauseId = "c-004"; kind = "COVERAGE"; patternCode = "SMCyberBusinessInterruptionCov"
    name = "Business Interruption Coverage"; category = "CyberFirstParty"
    owningEntityType = "GeneralLiabilityLine"; existence = "Suggested"
    limitMaxInr = $limit; deductibleInr = $ded; waitingHours = $hours; conditions = @()
    citations = @(@{sourceCode="IRDAI-CYB-G-2024-S3.3";section="3.3";textSnippet="The waiting period for Business Interruption coverage under cyber insurance shall be not less than 8 hours and not more than 72 hours from the time of the qualifying cyber event."})
  }
}

function Make-Rating($factors) {
  return @{
    clauseId = "c-010"; kind = "RATING"; patternCode = "SMCyberBaseRatingCov"
    name = "Base Rating Clause"; category = "CyberRating"
    owningEntityType = "GeneralLiabilityLine"; existence = "Preset"
    factors = $factors; conditions = @()
    citations = @(@{sourceCode="IRDAI-CYB-G-2024-S3.6";section="3.6";textSnippet="All rating factors applied in premium calculation for SME Cyber Insurance shall fall within the range of 0.50 to 3.00 inclusive."})
  }
}

function Mandatory-Excls {
  return @(
    (Make-Exclusion "c-006" "SMCyberWarExcl" "War and State-Sponsored Attacks Exclusion"),
    (Make-Exclusion "c-007" "SMCyberPriorKnownExcl" "Prior Known Incidents Exclusion"),
    (Make-Exclusion "c-008" "SMCyberIntentionalActsExcl" "Intentional Acts Exclusion"),
    (Make-Exclusion "c-009" "SMCyberInfraFailureExcl" "Infrastructure Failure Exclusion")
  )
}

function Base-Proposal($id, $desc, $exp, $failRule, $agg, $turn, $minPrem, $clauses) {
  return @{
    id = $id; description = $desc; expected = $exp; expectedFailingRule = $failRule
    proposal = @{
      proposalId = "CORPUS-$id"; executionId = "exec-corpus-$id"; iteration = 1
      line = "SMCyber"; aggregateLimitInr = $agg; turnoverInr = $turn
      minimumPremiumInr = $minPrem; targetEffectiveDate = "2026-10-01"; jurisdiction = "IN"
      proseSummary = "Corpus test proposal $id"; llmMeta = @{model="gemini-2.0-flash";temperature=0}
      clauses = $clauses
    }
  }
}

$items = @()

# ── COMPLIANT ITEMS (additional 14 to supplement existing 6) ─────────────────

# C07: exact 50% extortion (boundary — valid)
$items += Base-Proposal "compliant_extortion_exactly_50pct" "Extortion at exactly 50% of aggregate — boundary valid" "PASSED" $null `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),(Make-Extortion 2500000 125000 5000000),(Make-BI 500000 25000 24)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0;revenueFactor=1.0})))

# C08: minimum aggregate limit (₹5L boundary)
$items += Base-Proposal "compliant_min_aggregate" "Minimum aggregate limit ₹5L — boundary valid" "PASSED" $null `
  500000 10000000 10000 (@((Make-DataBreach 200000 10000),(Make-Privacy 200000 10000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=0.5})))

# C09: max aggregate (₹5Cr)
$items += Base-Proposal "compliant_max_aggregate" "Maximum aggregate limit ₹5Cr" "PASSED" $null `
  50000000 2000000000 50000 (@((Make-DataBreach 20000000 1000000),(Make-Privacy 20000000 1000000),(Make-Extortion 25000000 1250000 50000000),(Make-BI 5000000 250000 8)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=3.0;revenueFactor=2.0})))

# C10: waiting period exactly 8h (min boundary)
$items += Base-Proposal "compliant_bi_waiting_8h" "BI waiting period exactly 8 hours — min boundary" "PASSED" $null `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),(Make-BI 1000000 50000 8)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# C11: waiting period exactly 72h (max boundary)
$items += Base-Proposal "compliant_bi_waiting_72h" "BI waiting period exactly 72 hours — max boundary" "PASSED" $null `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),(Make-BI 1000000 50000 72)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# C12: rating factor at min boundary 0.5
$items += Base-Proposal "compliant_rating_min_factor" "Rating factor at minimum 0.5 — boundary valid" "PASSED" $null `
  5000000 200000000 10000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 1000000 50000)) + (Mandatory-Excls) + @((Make-Rating @{sectorFactor=0.5})))

# C13: rating factor at max boundary 3.0
$items += Base-Proposal "compliant_rating_max_factor" "Rating factor at maximum 3.0 — boundary valid" "PASSED" $null `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 1000000 50000)) + (Mandatory-Excls) + @((Make-Rating @{riskFactor=3.0})))

# C14: no optional coverages — only mandatory
$items += Base-Proposal "compliant_mandatory_only" "Only mandatory coverages and exclusions — no optional" "PASSED" $null `
  2000000 100000000 15000 (@((Make-DataBreach 800000 40000),(Make-Privacy 800000 40000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# C15: deductible at exactly 1% of limit (min boundary)
$db15 = @{clauseId="c-001";kind="COVERAGE";patternCode="SMCyberDataBreachCov";name="Data Breach Response Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Required";limitMaxInr=2000000;deductibleInr=20000;conditions=@("cert-in-6-hour-reporting");citations=@(@{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."},@{sourceCode="CERT-IN-DIR-2022-6HR";section="70B(6)";textSnippet="All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within 6 hours of noticing such incidents or being brought to notice about such incidents."})}
$items += Base-Proposal "compliant_deductible_1pct" "Deductible at exactly 1% of limit — min boundary" "PASSED" $null `
  5000000 200000000 25000 (@($db15,(Make-Privacy 2000000 20000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# C16: deductible at exactly 10% of limit (max boundary)
$db16 = @{clauseId="c-001";kind="COVERAGE";patternCode="SMCyberDataBreachCov";name="Data Breach Response Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Required";limitMaxInr=2000000;deductibleInr=200000;conditions=@("cert-in-6-hour-reporting");citations=@(@{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."},@{sourceCode="CERT-IN-DIR-2022-6HR";section="70B(6)";textSnippet="All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within 6 hours of noticing such incidents or being brought to notice about such incidents."})}
$items += Base-Proposal "compliant_deductible_10pct" "Deductible at exactly 10% of limit — max boundary" "PASSED" $null `
  5000000 200000000 25000 (@($db16,(Make-Privacy 2000000 200000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# C17: minimum premium exactly 10000
$items += Base-Proposal "compliant_min_premium" "Minimum premium exactly ₹10,000 — floor boundary" "PASSED" $null `
  1000000 50000000 10000 (@((Make-DataBreach 400000 20000),(Make-Privacy 400000 20000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=0.6})))

# C18: large enterprise, all coverages, max turnover
$items += Base-Proposal "compliant_large_enterprise" "Large enterprise, high limits, full coverage suite" "PASSED" $null `
  30000000 2000000000 100000 (@((Make-DataBreach 10000000 500000),(Make-Privacy 8000000 400000),(Make-Extortion 15000000 750000 30000000),(Make-BI 5000000 250000 48)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=2.5;revenueFactor=1.8;securityPostureFactor=1.2})))

# C19: electable coverage with correct conditions
$regFines = @{clauseId="c-005";kind="COVERAGE";patternCode="SMCyberRegulatoryFinesCov";name="Regulatory Fines Coverage";category="CyberThirdParty";owningEntityType="GeneralLiabilityLine";existence="Electable";limitMaxInr=500000;deductibleInr=25000;conditions=@("where-insurable-by-law");citations=@(@{sourceCode="IRDAI-CYB-G-2024-S4.4";section="4.4";textSnippet="Coverage for regulatory fines and penalties shall be provided only where insurable by law in the applicable jurisdiction."})}
$items += Base-Proposal "compliant_with_fines_coverage" "Electable regulatory fines coverage with correct condition" "PASSED" $null `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 1500000 75000),(Make-Extortion 2000000 100000 5000000),$regFines) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.1})))

# C20: CERT-In included in separate data breach citation
$items += Base-Proposal "compliant_cert_in_explicit" "CERT-In 6-hour condition explicitly satisfied on DataBreach" "PASSED" $null `
  3000000 100000000 20000 (@((Make-DataBreach 1200000 60000),(Make-Privacy 1200000 60000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))


# ── NON-COMPLIANT ITEMS (additional 14 adversarial cases) ────────────────────

# N13: aggregate below ₹5L minimum (CYB-RNG-001)
$items += Base-Proposal "noncompliant_agg_below_min" "Aggregate limit ₹4L — below ₹5L minimum (CYB-RNG-001)" "BLOCKED" "CYB-RNG-001" `
  400000 10000000 10000 (@((Make-DataBreach 150000 7500),(Make-Privacy 150000 7500)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N14: aggregate above ₹5Cr maximum (CYB-RNG-001)
$items += Base-Proposal "noncompliant_agg_above_max" "Aggregate limit ₹6Cr — above ₹5Cr maximum (CYB-RNG-001)" "BLOCKED" "CYB-RNG-001" `
  60000000 1000000000 50000 (@((Make-DataBreach 20000000 1000000),(Make-Privacy 20000000 1000000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N15: extortion at 51% (boundary violation, CYB-RNG-002)
$items += Base-Proposal "noncompliant_extortion_51pct_exact" "Extortion at exactly 51% of aggregate — boundary violation (CYB-RNG-002)" "BLOCKED" "CYB-RNG-002" `
  10000000 200000000 25000 (@((Make-DataBreach 3000000 150000),(Make-Privacy 3000000 150000),(Make-Extortion 5100000 255000 10000000),(Make-BI 1000000 50000 24)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.2})))

# N16: BI waiting period below 8h (CYB-RNG-004)
$biShort = @{clauseId="c-004";kind="COVERAGE";patternCode="SMCyberBusinessInterruptionCov";name="Business Interruption Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Suggested";limitMaxInr=1000000;deductibleInr=50000;waitingHours=4;conditions=@();citations=@(@{sourceCode="IRDAI-CYB-G-2024-S3.3";section="3.3";textSnippet="The waiting period for Business Interruption coverage under cyber insurance shall be not less than 8 hours and not more than 72 hours from the time of the qualifying cyber event."})}
$items += Base-Proposal "noncompliant_bi_waiting_too_short" "BI waiting period 4h — below 8h minimum (CYB-RNG-004)" "BLOCKED" "CYB-RNG-004" `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),$biShort) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N17: BI waiting period above 72h (CYB-RNG-004)
$biLong = @{clauseId="c-004";kind="COVERAGE";patternCode="SMCyberBusinessInterruptionCov";name="Business Interruption Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Suggested";limitMaxInr=1000000;deductibleInr=50000;waitingHours=96;conditions=@();citations=@(@{sourceCode="IRDAI-CYB-G-2024-S3.3";section="3.3";textSnippet="The waiting period for Business Interruption coverage under cyber insurance shall be not less than 8 hours and not more than 72 hours from the time of the qualifying cyber event."})}
$items += Base-Proposal "noncompliant_bi_waiting_too_long" "BI waiting period 96h — above 72h maximum (CYB-RNG-004)" "BLOCKED" "CYB-RNG-004" `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),$biLong) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N18: turnover above ₹250Cr (CYB-RNG-005)
$items += Base-Proposal "noncompliant_turnover_above_max" "Annual turnover ₹300Cr — above ₹250Cr limit (CYB-RNG-005)" "BLOCKED" "CYB-RNG-005" `
  5000000 3000000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N19: minimum premium below ₹10,000 (CYB-RNG-007)
$items += Base-Proposal "noncompliant_premium_below_floor" "Minimum premium ₹9,999 — below ₹10,000 floor (CYB-RNG-007)" "BLOCKED" "CYB-RNG-007" `
  5000000 200000000 9999 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N20: rating factor above 3.0 (CYB-RNG-006)
$ratingHigh = @{clauseId="c-010";kind="RATING";patternCode="SMCyberBaseRatingCov";name="Base Rating Clause";category="CyberRating";owningEntityType="GeneralLiabilityLine";existence="Preset";factors=@{industryFactor=3.5};conditions=@();citations=@(@{sourceCode="IRDAI-CYB-G-2024-S3.6";section="3.6";textSnippet="All rating factors applied in premium calculation for SME Cyber Insurance shall fall within the range of 0.50 to 3.00 inclusive."})}
$items += Base-Proposal "noncompliant_rating_factor_too_high" "Rating factor 3.5 — above 3.0 maximum (CYB-RNG-006)" "BLOCKED" "CYB-RNG-006" `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000)) + (Mandatory-Excls) + @($ratingHigh))

# N21: deductible exceeds limit (CYB-CON-002)
$dbHighDed = @{clauseId="c-001";kind="COVERAGE";patternCode="SMCyberDataBreachCov";name="Data Breach Response Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Required";limitMaxInr=1000000;deductibleInr=1500000;conditions=@("cert-in-6-hour-reporting");citations=@(@{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."},@{sourceCode="CERT-IN-DIR-2022-6HR";section="70B(6)";textSnippet="All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within 6 hours of noticing such incidents or being brought to notice about such incidents."})}
$items += Base-Proposal "noncompliant_deductible_exceeds_limit" "Deductible ₹15L exceeds limit ₹10L (CYB-CON-002)" "BLOCKED" "CYB-CON-002" `
  5000000 200000000 25000 (@($dbHighDed,(Make-Privacy 2000000 100000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N22: invalid patternCode format (CYB-TYPE-001 REGEX)
$invalidPattern = @{clauseId="c-001";kind="COVERAGE";patternCode="CyberDataBreach";name="Data Breach";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Required";limitMaxInr=2000000;deductibleInr=100000;conditions=@("cert-in-6-hour-reporting");citations=@(@{sourceCode="IRDAI-CYB-G-2024-S4.1";section="4.1";textSnippet="Every SME Cyber Insurance policy shall include at minimum Data Breach Response Coverage (SMCyberDataBreachCov) and Privacy Liability Coverage (SMCyberPrivacyLiabilityCov) as Required coverages."})}
$items += Base-Proposal "noncompliant_invalid_pattern_code" "patternCode 'CyberDataBreach' fails SMCyber* regex (CYB-TYPE-001)" "BLOCKED" "CYB-TYPE-001" `
  5000000 200000000 25000 (@($invalidPattern,(Make-Privacy 2000000 100000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N23: missing CERT-In 6-hour condition on extortion (CYB-RM-005)
$extNoCert = @{clauseId="c-003";kind="COVERAGE";patternCode="SMCyberExtortionCov";name="Cyber Extortion Coverage";category="CyberFirstParty";owningEntityType="GeneralLiabilityLine";existence="Suggested";limitMaxInr=2000000;deductibleInr=100000;conditions=@();citations=@(@{sourceCode="IRDAI-CYB-G-2024-S3.4";section="3.4";textSnippet="The sublimit for Cyber Extortion or Ransomware coverage shall not exceed 50% of the policy aggregate limit to prevent disproportionate exposure to extortion-related claims."},@{sourceCode="IRDAI-CYB-G-2024-S4.3";section="4.3";textSnippet="Any coverage for cyber extortion or ransomware payments shall include a mandatory condition requiring the insured to notify law enforcement authorities before any payment is made."})}
$items += Base-Proposal "noncompliant_extortion_no_law_enforcement" "Extortion coverage missing law-enforcement-notification condition (CYB-RM-003)" "BLOCKED" "CYB-RM-003" `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),$extNoCert) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N24: prose number mismatch (CYB-GRD-001) — prose says ₹30L extortion but clause is ₹20L
$grdProposal = @{
  id="noncompliant_prose_number_mismatch"; description="Prose says extortion ₹30L but clause is ₹20L — grounding fails (CYB-GRD-001)"; expected="BLOCKED"; expectedFailingRule="CYB-GRD-001"
  proposal=@{
    proposalId="CORPUS-noncompliant_prose_number_mismatch"; executionId="exec-corpus-noncompliant_prose_number_mismatch"; iteration=1
    line="SMCyber"; aggregateLimitInr=5000000; turnoverInr=200000000; minimumPremiumInr=25000
    targetEffectiveDate="2026-10-01"; jurisdiction="IN"
    proseSummary="Cyber insurance with aggregate ₹50L. Data breach ₹20L, privacy liability ₹20L. Cyber extortion is set at 30 lakh (₹30L) with law enforcement notification. Minimum premium ₹25,000."
    llmMeta=@{model="gemini-2.0-flash";temperature=0}
    clauses=@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),(Make-Extortion 2000000 100000 5000000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0}))
  }
}
$items += $grdProposal

# N25: off-by-one lakh trick — ₹25,00,001 extortion on ₹50L agg (CYB-RNG-002)
$items += Base-Proposal "noncompliant_extortion_off_by_one" "Extortion ₹25,00,001 (1 rupee over 50% of ₹50L) — CYB-RNG-002" "BLOCKED" "CYB-RNG-002" `
  5000000 200000000 25000 (@((Make-DataBreach 2000000 100000),(Make-Privacy 2000000 100000),(Make-Extortion 2500001 125000 5000000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))

# N26: sum of first-party limits exceeds aggregate (CYB-CON-001)
$items += Base-Proposal "noncompliant_sum_exceeds_aggregate" "First-party limits ₹30L+₹30L = ₹60L exceed ₹50L aggregate (CYB-CON-001)" "BLOCKED" "CYB-CON-001" `
  5000000 200000000 25000 (@((Make-DataBreach 3000000 150000),(Make-Privacy 3000000 150000)) + (Mandatory-Excls) + @((Make-Rating @{industryFactor=1.0})))


# ── Write all items ───────────────────────────────────────────────────────────

$count = 0
foreach ($item in $items) {
  $id = $item.id
  $path = Join-Path $corpusDir "$id.json"
  if (-not (Test-Path $path)) {
    $json = $item | ConvertTo-Json -Depth 20 -Compress:$false
    $json | Set-Content -Path $path -Encoding UTF8
    Write-Host "Created: $path"
    $count++
  } else {
    Write-Host "Skipped (exists): $path"
  }
}

Write-Host ""
Write-Host "Done: created $count new corpus items."
$existing = (Get-ChildItem $corpusDir -Filter "*.json").Count
Write-Host "Total corpus items: $existing"
