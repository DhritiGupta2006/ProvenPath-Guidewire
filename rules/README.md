# ProvenPath Rules

This directory contains the verification rules for ProvenPath.

## Structure
- `sources.yaml`: every source a rule enforces or a clause cites (27). Each has a `kind`, `issuer`, `document`, `url` and `effective_date`.
- `rules/*.yaml`: Individual rule files in YAML format.

## Where the rules come from

**Official texts, quoted verbatim** (`kind: REGULATION` / `REGULATOR_GUIDANCE`). Downloaded from the official publisher and extracted programmatically; only PDF layout whitespace is joined and running page headers are dropped.

| Source | Document | Used by |
|---|---|---|
| `IRDAI-CYBER-2021-5.5.1a`, `-5.5.1b`, `-5.5.2a`, `-5.5.2a-R`, `-5.5.2d` | IRDAI, *Guidance Document on Product Structure for Cyber Insurance* (8 Sep 2021): business interruption (waiting periods), cyber extortion, privacy and data breach liability, response costs, "regulatory fines and penalties (insurable by law)" | clause citations; `CYB-RM-004` |
| `IRDAI-CYBER-2021-5.8` | same document, §5.8 Major exclusions (dishonest or wilful conduct, external infrastructure failure, war, prior acts) | `CYB-RM-002`; the four exclusion clauses |
| `IRDAI-CYBER-2021-MW-EXT` | same document, model policy wording: conditions of the Cyber Extortion Cover (notify and cooperate with law enforcement) | `CYB-RM-003` |
| `CERT-IN-2022-DIR-ii` | CERT-In Directions under s.70B(6) IT Act, 28 Apr 2022, direction (ii): report cyber incidents within 6 hours | `CYB-RM-005`; data breach clause |
| `MSME-2025-SO1364E` | MSME Ministry notification S.O. 1364(E), 21 Mar 2025: medium-enterprise turnover limit raised to ₹500 crore (from 1 Apr 2025) | `CYB-RNG-005` (turnover ≤ ₹500 Cr) |
| `DPDP-2023-S8-6` | Digital Personal Data Protection Act 2023, s.8(6) breach intimation. In force ~13 May 2027 (18 months after the DPDP Rules 2025), so `CYB-SRC-003` rejects citing it for a policy that starts earlier | available to the planner |

**Our own documents, labelled as such** (not regulation). No Indian regulator sets numeric caps like "extortion ≤ 50% of aggregate" or "deductible 1–10%"; insurers set them in their own filed product terms. Presenting them as IRDAI rules would be false, so they cite:
- `SMCYBER-UWG-2026-1..9` (`UNDERWRITING_GUIDELINE`): aggregate range, extortion sublimit, deductibles, BI waiting period 8–72 h, rating factors, minimum premium, sublimits within aggregate, exclusions vs Required coverages, Required coverages.
- `SMCYBER-PC-SPEC-1..4` (`TECHNICAL_SPEC`): PolicyCenter product-model constraints (pattern codes, `GeneralLiabilityLine`, existence/category, unique codes).
- `PP-AIGOV-2026-1..4` (`GOVERNANCE`): citation, verbatim quoting, in-force sources, grounded prose.

Mission Control's Provenance sheet shows the kind, the issuer, the document and a link to the official text for every citation.

## YAML Format Details

Each rule file contains the following fields:

- `rule_code`: Unique identifier (e.g., CYB-TYPE-001)
- `name`: Human-readable name
- `layer`: The layer of verification (TYPE, RANGE, CONSISTENCY, RULE_MATCH, SOURCE, GROUNDING)
- `applies_to`: The target entity/clause it applies to (e.g., "proposal", "coverage[*]", "clause[*]", "rating[*]", "coverage[patternCode=X]")
- `depends_on`: A list of prerequisite rule codes
- `logic`: The validation logic definition
- `source_code`: The regulatory source ID it enforces
- `error_template`: A human-readable error template (with {actual} and {expected} placeholders)

### Applies To Selectors
- `"proposal"`: Validates fields on the top-level proposal object
- `"clause[*]"`: Iterates and validates over all coverage, exclusion, condition, and rating clauses
- `"coverage[*]"`: Validates over all coverages
- `"coverage[patternCode=X]"`: Selects a specific coverage by patternCode

### Operators
- Standard comparators: GT, GTE, LT, LTE, EQ, NEQ
- Logical: AND, OR, NOT
- Sets and Strings: IN, REGEX
- Existence: EXISTS
- Types: TYPE_IS
- Custom Functions: FN (calls out to built-in code functions mapped to the validation engine)

### Logic References
- `field`: The property path to validate against (e.g., `clause.limitMaxInr`, `proposal.aggregateLimitInr`)
- `value`: A literal static value to check against
- `value_ref`: A dynamic reference (e.g., `proposal.aggregateLimitInr * 0.5`)
- `children`: A list of nested operator definitions for AND/OR

### Built-in Functions
- `deductibleInRangeOfLimit`
- `ratingFactorsInRange`
- `sumFirstPartyLimitsLteAggregate`
- `deductibleLessThanLimit`
- `noExclusionNullifiesRequiredCoverage`
- `noDuplicatePatternCodes`
- `mandatoryCoveragesPresent`
- `mandatoryExclusionsPresent`
- `ransomHasLawEnforcementCondition`
- `finesHasInsurabilityCondition`
- `certIn6HourConditionPresent`
- `clauseHasCitation`
- `citationSnippetMatchesSource`
- `sourceActiveOnEffectiveDate`
- `groundingCheck`
