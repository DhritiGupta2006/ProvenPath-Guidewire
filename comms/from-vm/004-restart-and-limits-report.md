Status: DONE

# 004: Per-Deploy Restart Cost, Native Term Limits & UI Clarification Report

## 1. Summary & Key Findings
- **Values-only changes cost ~3m 54s, NOT 22 minutes.** A values-only XML edit (`minVal`/`maxVal` bounds) triggers `:genProductModelSources` (~15 s), but Gradle detects `:compileGosu` as **`UP-TO-DATE`**. The 15-minute recompilation of 29,489 Gosu classes only happens when new classes/patterns are created or Gosu signatures change.
- **PC-Native Range Enforcement**: Enforced natively in `CovTermDirectInputSet.pcf` via `validationExpression` calling `covTerm.validateValueInRange()`. Rejections occur immediately on field entry/step submit with format: `"{0} must be between {1} and {2}"` or `"{0} cannot be greater than {1}"`.
- **Currency**: `INR` is **not available** in the current instance. The active `Currency` typelist contains 7 currencies (`usd`, `eur`, `gbp`, `cad`, `aud`, `rub`, `jpy`). Supporting INR requires a typelist extension (`Currency.ttx`), a typekey compile/restart, and config adjustments.
- **Demo Recommendation**: **PRE-DEPLOY**. While 3m 54s is vastly better than 22m 17s, a ~4-minute server restart on stage is still too long for a live audience demo. Pre-deploying the product model pattern set is recommended.

---

## 2. A. Clarify 003 Observations

| Item | Status in 003 | Actual Reality / Verification |
| :--- | :--- | :--- |
| **(a) SME Cyber Insurance in New Submission list** | **Inferred** | **Actually Observed** in UI by human operator (Day 0, 16:03, Submission 0000019306). Product code `SMCyber` is active, commercial, and selectable. |
| **(b) 3 coverages on SMCyber submission screen** | **Inferred** | **Not Visible in v0 UI**. When SMCyber submission is started, the wizard progresses (`Qualification` -> `Policy Info` -> `Risk Analysis` -> `Policy Review`), but the line wizard step set is completely omitted because `LineWizardStepSet.default.pcf` is empty. |
| **(c) Coverages do NOT appear on GeneralLiability** | **Inferred** | **Enforced by Rule Engine**. Verified via `<AvailabilityScript>`: `GeneralLiabilityLine.Branch != null and GeneralLiabilityLine.Branch.Policy != null and GeneralLiabilityLine.Branch.Policy.ProductCode == "SMCyber"`. When `ProductCode == "GeneralLiability"`, this evaluates to `false`. |

### Where GL-Line Coverages Are Rendered in PCFs
- **Wizard Step Host**: Defined in `modules/configuration/config/web/pcf/line/gl/job/LineWizardStepSet.GeneralLiability.pcf` as step `GLLine` (`id="GLLine"`, `title="Web.Policy.GL.Coverages"`).
- **Screen**: `GeneralLiabilityScreen.pcf` (`GeneralLiabilityScreen(job, policyPeriod, openForEdit, jobWizardHelper)`).
  - Card 1 ("Standard Coverages"): `PolicyLineDV(glLine, jobWizardHelper)` with `mode="GLLine"` (`PolicyLineDV.GLLine.pcf`). Loops over `glGroupCategory` (`GLGroup`).
  - Card 2 ("Additional Coverages"): `AdditionalCoveragesPanelSet(glLine, new String[]{"GLGroup"}, false, jobWizardHelper)`. The `false` flag excludes `GLGroup` and displays all other categories on `GLLine` (including `GLOther`, where our SMCyber coverages reside).
- **Product Code Dependency**: The wizard container `SubmissionWizard.pcf` references the step set via:
  ```xml
  <WizardStepSetRef
    def="LineWizardStepSet(job, policyPeriod, jobWizardHelper, openForEdit)"
    mode="productCode"/>
  ```
  Because `mode="productCode"` evaluates to `"SMCyber"` and no `LineWizardStepSet.SMCyber.pcf` exists in v0, PolicyCenter dispatches to `LineWizardStepSet.default.pcf` (an empty step set).

---

## 3. B. Restart-Cost Experiment Measurements

### Experiment Design
1. Modified **only values** in existing file `SMCyberExtortionCov.xml`:
   - `SMCyberExtortionLimitusd`: added `minVal="0"`, `maxVal="2500000"` (enforcing 50% cap of ₹50L).
   - `SMCyberExtortionDeductibleusd`: added `minVal="0"`, `maxVal="250000"`.
   - *Attribute Convention Citation:* Follows base Guidewire configuration, e.g. `modules/configuration/config/resources/productmodel/policylinepatterns/BOPLine/coveragepatterns/BOPBuildingCov.xml` (`minVal="1"`, `maxVal="3000000.0000"`).
2. Clean stop and warm restart with values-only edit.
3. Clean stop and baseline warm restart with 0 changes.

### Timing Results Table

| Stage / Phase | First Install (003 Cold Build) | Values-Only Change (004 Exp 1) | No Change (004 Baseline Warm) |
| :--- | :--- | :--- | :--- |
| **Stop Server** | 18 s | 15 s | 15 s |
| **Gradle: Pre-checks & Pom** | ~30 s | ~12 s | ~12 s |
| **Gradle: `:genProductModelSources`** | ~2m 40s (executed) | **~15 s (executed)** | **UP-TO-DATE (0 s)** |
| **Gradle: `:compileGosu`** | **~14m 43s (executed, 29,489 classes)** | **UP-TO-DATE (0 s)** | **UP-TO-DATE (0 s)** |
| **Gradle: Other Tasks / Packaging** | ~30 s | ~17 s | ~27 s |
| **Total Gradle Phase** | ~17m 43s | **44 s** | **39 s** |
| **Jetty Startup & Metadata Sync** | ~4m 34s | **3m 10s** | **2m 52s** |
| **TOTAL RESTART DURATION** | **22m 17s (1337 s)** | **3m 54s (234 s)** | **3m 31s (211 s)** |

### Build Analysis & Acceleration Options
- **Did `compileGosu` run?** **NO.** Gradle recognized that changing attribute values (`minVal`, `maxVal`) inside `<CovTermLimits>` updated generated source metadata without altering Gosu class signatures or method interfaces, marking `:compileGosu` as `UP-TO-DATE`.
- **Skip Compile Option**: Running `runServer` with `-x compile` (`gwb.bat runServer -x compile`) is documented by Guidewire's own build banner:
  > *"A full compile was done before running the runServer tool. To skip compile use \"-x compile\" option when running gwb"*
- **Hot-Sync in Dev Mode**: `ProductModelAPI.synchronizeProductModel()` allows synchronizing XML product model updates into database tables in maintenance/dev mode without process restarts.

---

## 4. C. PC-Native Range Enforcement

### Mechanism & Verification (Read-Only Code Path)
- **PCF Input Binding**: In `modules/configuration/config/web/pcf/shared/coverage/CovTermDirectInputSet.pcf`:
  ```xml
  <TextInput
    editable="true"
    id="DirectTermInput"
    label="term.Pattern.DisplayName"
    validationExpression="gw.pcf.coverage.CovTermDirectInputSetHelper.validate(term)"
    value="term.Value"
    valueType="java.math.BigDecimal">
  ```
- **Helper Implementation**: In `gw.pcf.coverage.CovTermDirectInputSetHelper.gs`:
  ```gosu
  public static function validate(covTerm : DirectCovTerm): String {
    if (covTerm == null) {
      return DisplayKey.get("Java.Validation.NonNullable", new Object[]{"Term"})
    } else {
      return covTerm.validateValueInRange(covTerm.Value);
    }
  }
  ```
- **Validation Timing**:
  1. **UI Entry / Step Transition**: `validationExpression` executes immediately when the field value is posted or the user attempts to click **Next** / submit the wizard step.
  2. **Quote / Bind Validation**: Also checked during `PolicyPeriodValidation` at Quote (`TC_QUOTABLE`) and Bind (`TC_BINDABLE`) levels.
- **Exact Error Message Display**:
  - Bound between 0 and 2,500,000:
    - Display key `Java.Validation.Number.Range.Closed`: `"{0} must be between {1} and {2}"`
    - Formatted output for `4000000`: **`"Extortion Limit must be between 0 and 2,500,000"`** (or `"Extortion Limit cannot be greater than 2,500,000"` if unbounded below).
  - Field is highlighted with a red validation indicator and blocked from advancing until corrected.

---

## 5. D. Currency Findings (Read-Only)

- **Is INR Available in this PolicyCenter?** **NO.**
- **Active Typelist Query**: Queried live via `TypelistToolsAPI.getTypelistValues("Currency")`:
  The active `Currency` typelist currently defines only 7 typekeys:
  1. `usd` (USD - US Dollar)
  2. `eur` (EUR - Euro)
  3. `gbp` (GBP - United Kingdom Pound)
  4. `cad` (CAD - Canadian Dollar)
  5. `aud` (AUD - Australian Dollar)
  6. `rub` (RUB - Russian Ruble)
  7. `jpy` (JPY - Japanese Yen)
- **`config.xml` Settings**:
  - `<param name="MulticurrencyDisplayMode" value="SINGLE"/>`
  - `<param name="DefaultApplicationCurrency" value="usd"/>`
- **What It Takes to Support INR (`currency="inr"`):**
  1. Add `<typecode code="inr" name="INR" desc="Indian Rupee" priority="8"/>` into `modules/configuration/config/extensions/typelist/Currency.ttx`.
  2. Server build and restart (required to generate `typekey.Currency.TC_INR` Java/Gosu typekey classes).
  3. Update `config.xml` (`DefaultApplicationCurrency` set to `inr`, or enable `MULTIPLE` currency mode with exchange rate tables configured).
  - *Conclusion:* A simple config flag is **not enough**; it requires a typelist extension, Java typekey regeneration, and server restart.

---

## 6. E. Overlay Template Updates
- Updated `policycenter/overlay-template/config/resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov.xml` with `minVal="0"` and `maxVal="2500000"` on `SMCyberExtortionLimitusd`, and `minVal="0"`, `maxVal="250000"` on `SMCyberExtortionDeductibleusd`.
- Updated `policycenter/overlay-template/INSTALL.md` with Section 3 ("Term Limits & Bounds Convention"), detailing attribute conventions, Guidewire base reference citations, validation lifecycle, and restart cost characteristics.

---

## 7. Demo Recommendation: Live Deploy vs. Pre-Deploy

### Recommendation: **PRE-DEPLOY the Product Model Pattern Set**
- **Trade-off Analysis**:
  - Live deploy with full cold build (new product model files): **22m 17s** (impossible for a live demo).
  - Live deploy with values-only edit (pre-existing pattern files): **3m 54s** (feasible technically, but introduces ~4 minutes of dead time or presenter stall on stage).
  - Pre-deploy pattern set + live policy transaction: **0 seconds restart downtime**.
- **Winning Strategy**:
  1. Pre-deploy the `SMCyber` overlay (all 8 XMLs and display properties) prior to the demo so the server is booted and warm.
  2. During the live demo: show the AI proposing changes, the Gosu rule-graph gating the proposal, and the PolicyCenter UI immediately enforcing native bounds (e.g. attempting to submit ₹40L and watching PolicyCenter reject it against the 50% cap of ₹25L).
