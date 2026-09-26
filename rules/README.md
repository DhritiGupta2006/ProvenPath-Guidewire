# ProvenPath Rules

This directory contains the verification rules for ProvenPath.

## Structure
- `sources.yaml`: Curated regulatory sources (e.g., IRDAI guidelines, CERT-In directions) mapped to rules.
- `rules/*.yaml`: Individual rule files in YAML format.

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
