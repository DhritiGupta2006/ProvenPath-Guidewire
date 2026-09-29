# ProvenPath → PolicyCenter Concept Mapping

ProvenPath is a **deterministic pre-commit compliance gate** for agentic insurance product configuration. An LLM proposes insurance product configuration; a deterministic rule engine verifies it before anything reaches PolicyCenter. This document maps every ProvenPath concept to its concrete PolicyCenter equivalent, citing actual codebase artifacts.

---

## 1. LLM Proposal → PolicyCenter Configuration

| ProvenPath Concept | PolicyCenter Equivalent | Key Files |
|----|----|----|
| **LLM-proposed product configuration** | Product Model XML definitions under `config\resources\productmodel\` | `products\PersonalAuto\PersonalAuto.xml`, `policylinepatterns\PersonalAutoLine\PersonalAutoLine.xml` |
| **Configuration artifact format** | XML files (product definitions, coverage patterns, lookup tables, rate tables) + `.eti`/`.etx` entity metadata | `config\resources\productmodel\`, `config\metadata\entity\` |
| **Configuration deployment target** | The `PolicyPeriod` entity on a `Job` (typically a `Submission`) | `PolicyPeriod.eti`, `Submission.eti`, `Job.eti` |

### How It Works
An LLM agent would propose changes to:
- **Product XML** (products, line patterns, coverage patterns) → These define what products, coverages, exclusions, and terms are available.
- **Lookup tables** (`config\lookuptables\`) → These control availability/eligibility by state, date, and other dimensions.
- **Rate tables/routines** (`RateBook`, `RateTableDefinition`, `CalcRoutineDefinition` entities) → These define pricing.
- **Entity extensions** (`.etx` files) → These add LOB-specific fields to core entities like `PolicyPeriod`.

ProvenPath intercepts these proposals **before** they are written to the PolicyCenter configuration or committed via the API.

---

## 2. Coverage / Exclusion / Limit / Deductible

| ProvenPath Concept | PolicyCenter Concept | Location | Example |
|----|----|----|----|
| **Coverage** | Coverage Pattern (`CoveragePattern`) | `config\resources\productmodel\policylinepatterns\<Line>\coveragepatterns\<Cov>.xml` | `PAComprehensiveCov.xml` — defines Comprehensive coverage on `PersonalVehicle` |
| **Exclusion** | Exclusion Pattern (`ExclusionPattern`) | Same directory structure as coverages, with `modelType="Exclusion"` | Defined inline in coverage pattern XMLs or as separate patterns |
| **Limit** | Coverage Term Pattern — `modelType="Limit"` | `<CovTerms>` inside coverage XML | `OptionCovTermPattern` or `PackageCovTermPattern` with `modelType="Limit"` |
| **Deductible** | Coverage Term Pattern — `modelType="Deductible"` | `<CovTerms>` inside coverage XML | `PACompDeductible` in `PAComprehensiveCov.xml` — `OptionCovTermPattern` with `valueType="money"` referencing lookup table `PAVehicleCovOpt` |

### ProvenPath Verification Targets
ProvenPath must verify that any LLM-proposed coverage/exclusion/limit/deductible:
1. Has a valid `coverageCategory` matching the target line (e.g., `PAPPhysDamGrp`).
2. Has the correct `owningEntityType` (e.g., `PersonalVehicle`, `PolicyLine`).
3. Has `existence` set correctly (`Required`, `Suggested`, `Electable`, or `Preset`).
4. Has term values within the ranges defined by lookup tables or `<CovTermLimits>`.
5. Passes any `<AvailabilityScript>` Gosu conditions (e.g., vehicle age checks).

---

## 3. Rating Rule

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Rating rule** | Rate Routine (`CalcRoutineDefinition`) + Rate Table (`RateTableDefinition` → `RateTable`) within a Rate Book (`RateBook`) | `config\metadata\entity\CalcRoutineDefinition.eti`, `RateBook.eti`, `RateTableDefinition.eti` |
| **Rating factor** | `DefaultRateFactorRow` rows in a `RateTable` | `DefaultRateFactorRow.eti` — generic columns (`str1`–`str8`, `dec1`–`dec6`) dynamically mapped |
| **Premium calculation** | `AbstractRatingEngine.gs` subclasses per LOB | `gsrc\gw\rating\AbstractRatingEngine.gs`, `CostData.gs` |
| **Rate book versioning** | `RateBook` entity with `BookCode`, `BookEdition`, `Status` (Draft/Active/Approved), effective dates | `RateBook.eti` |

### ProvenPath Verification Targets
ProvenPath should verify:
1. Rate routine steps are mathematically consistent (no division by zero, no missing table lookups).
2. Rate table factor rows have values within expected ranges for the jurisdiction.
3. Rate book status transitions follow the approval workflow (Draft → Approved → Active).
4. Legacy system tables (`config\resources\systables\`) are not inadvertently overridden (e.g., `short_ratefactors.xml`, `rates_general_liability.xml`).

---

## 4. Underwriting Rule

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Underwriting rule** | `UWRule` entity (BizRules engine) | `config\metadata\entity\UWRule.eti` |
| **UW issue type** | `UWIssueType` entity — category of concern | `UWIssueType.eti` |
| **UW issue (runtime)** | `UWIssue` entity — raised on `PolicyPeriod` | `UWIssue.eti` (properties: `Active`, `ApprovalBlockingPoint`, `ApprovalDurationType`) |
| **UW authority** | `UWAuthorityProfile` + `UWAuthorityGrant` entities | `UWAuthorityProfile.eti`, `UWAuthorityGrant.eti` |
| **Blocking points** | `ApprovalBlockingPoint` typekey: "Blocks Quote", "Blocks Bind", etc. | Applied on `UWIssue` — halts `Job` progression |

### ProvenPath Verification Targets
ProvenPath must verify that any proposed UW rule:
1. Has a valid `UWIssueType` mapping.
2. Has appropriate `BlockingPoint` configuration (not too permissive, not too restrictive).
3. Has authority profiles that can realistically approve it (i.e., someone in the org has a matching `UWAuthorityGrant`).
4. Does not conflict with existing validation rules in `config\rules\Validation\`.

---

## 5. Validation

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Validation rule** | Gosu Validation Rules (`.gr` files) | `config\rules\Validation\` (e.g., `AccountValidationRules`, `ContactValidationRules`) |
| **Field-level validation** | Field Validators (regex + Gosu) | `config\fieldvalidators\FieldValidators.xml` |
| **Validation level** | `ValidationLevel` typekey: `TC_LOADSAVE`, `TC_DEFAULT`, `TC_BIND` | Used in `entity.reject(validationLevel, ...)` calls |
| **Validation result** | `ValidationResult` / `ValidationIssue` objects | Aggregated and returned to UI or API callers |
| **Pre-update validation** | Pre-update Rules | `config\rules\Preupdate\` — executes immediately before DB commit |

### ProvenPath Verification Targets
ProvenPath's deterministic rule engine is analogous to PolicyCenter's validation framework. It should:
1. Mirror validation level semantics — distinguish between save-blocking (`TC_LOADSAVE`) and bind-blocking (`TC_BIND`) checks.
2. Ensure proposed field values pass `FieldValidators.xml` regex patterns before reaching PolicyCenter.
3. Verify that proposed configurations would not trigger unexpected pre-update rule failures.
4. Return structured validation results matching PolicyCenter's `ValidationResult` / `ValidationIssue` pattern for traceability.

---

## 6. Source / Reference

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Regulatory source** | Lookup table dimensions (State, effective date) | `config\lookuptables\lookuptables.xml` (e.g., `ProductLookup` with State precedence) |
| **Product model source of truth** | Product Model XML + generated classes | `config\resources\productmodel\` → `generated\productmodel\` |
| **Rule source** | Gosu `.gr` files with `order.txt` execution ordering | `config\rules\<RuleSet>\<RuleName>_dir\` |
| **Rate table source** | `RateBook` + `RateTableDefinition` with effective dates and status | `RateBook.eti`, `RateTableDefinition.eti` |

### ProvenPath Application
ProvenPath should maintain a reference chain from every compliance decision back to:
- The specific product model XML file and element that defines the coverage/term.
- The specific lookup table row (state + effective date) that governs availability.
- The specific rate book version and rate table that determines pricing.
- The specific validation rule (`.gr` file path + line number) that enforces the constraint.

---

## 7. Pre-Commit Verification

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Pre-commit gate** | `IPreUpdateHandler` plugin | `config\plugin\registry\IPreUpdateHandler.gwp` |
| **Validation gate** | `IValidationPlugin` plugin | `config\plugin\registry\IValidationPlugin.gwp` |
| **UW blocking gate** | `UWIssue.ApprovalBlockingPoint` | `UWIssue.eti` — "Blocks Quote" / "Blocks Bind" |
| **Rule execution** | Validation Rules at `TC_LOADSAVE` and `TC_BIND` levels | `config\rules\Validation\` |

### ProvenPath Architecture Mapping

```
┌─────────────────────────────────────────────────────────┐
│                    LLM Agent                            │
│  (proposes product config: coverages, rates, UW rules)  │
└────────────────────┬────────────────────────────────────┘
                     │ proposed configuration
                     ▼
┌─────────────────────────────────────────────────────────┐
│               PROVENPATH GATE                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 1. Schema Validation                            │    │
│  │    (mirrors FieldValidators.xml patterns)       │    │
│  │ 2. Product Model Validation                     │    │
│  │    (coverage patterns, term ranges, existence)  │    │
│  │ 3. Availability Check                           │    │
│  │    (mirrors lookuptables + AvailabilityScripts) │    │
│  │ 4. Rating Integrity                             │    │
│  │    (rate table completeness, routine logic)     │    │
│  │ 5. UW Rule Consistency                          │    │
│  │    (blocking points, authority coverage)         │    │
│  │ 6. Cross-Reference Validation                   │    │
│  │    (entity relationships, FK integrity)          │    │
│  └─────────────────────────────────────────────────┘    │
│  OUTPUT: PASS with audit trail  /  FAIL with reasons    │
└────────────────────┬────────────────────────────────────┘
                     │ only if PASS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              POLICYCENTER                               │
│  Config deployed via:                                   │
│  - Product Model XML updates                            │
│  - API calls (ProductModelAPI.gs, SubmissionAPI.gs)     │
│  - IPreUpdateHandler (final safety net)                 │
│  - IValidationPlugin (runtime re-verification)          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Final Configuration Artifact

| ProvenPath Concept | PolicyCenter Concept | Location |
|----|----|----|
| **Final artifact** | Committed `PolicyPeriod` on a bound `Job` | `PolicyPeriod.eti` with `Status = TC_BOUND` |
| **Configuration package** | Product Model XML bundle + Rate Book + entity extensions | `config\resources\productmodel\`, `RateBook` entities, `.etx` files |
| **Audit trail** | Workflow history + `UWIssue` approval chain + messaging events | `config\workflow\`, `UWIssue.eti`, `config\messaging\messaging-config.xml` |
| **Deployment mechanism** | Gradle build + Studio deployment, or API-driven updates | `build.gradle`, REST APIs in `config\integration\apis\` |

### ProvenPath Output Requirements
The final ProvenPath artifact should include:
1. **Validated configuration files** — Product Model XMLs, lookup tables, rate tables ready for PolicyCenter deployment.
2. **Compliance report** — Mapping every proposed element to its validation outcome, citing PolicyCenter source files.
3. **Diff manifest** — What changed vs. the current PolicyCenter configuration.
4. **Deployment instructions** — Whether the change requires a Gradle rebuild, a rate book activation, or an API call.

---

## Summary: Key Extension Points for ProvenPath Integration

| Integration Point | Plugin / API | Purpose |
|----|----|----|
| Pre-commit safety net | `IPreUpdateHandler.gwp` | Abort transaction if ProvenPath gate not passed |
| Runtime validation | `IValidationPlugin.gwp` | Re-verify compliance during PolicyCenter job lifecycle |
| Product model query | `ProductModelAPI.gs` | Query current product definitions for diff/comparison |
| Policy operations | `SubmissionAPI.gs`, `PolicyChangeAPI.gs` | Programmatic policy creation/modification |
| Outbound notifications | Messaging destinations (ID 66, 322) | Notify ProvenPath of committed changes for audit |
| Rate management | `RateBook` entities + BizRules API | Manage rate book lifecycle and UW rules |
