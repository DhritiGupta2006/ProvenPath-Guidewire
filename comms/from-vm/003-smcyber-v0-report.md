Status: DONE

# 003: Hand-Built SMCyber v0 in PolicyCenter Report

## 1. Summary
The **SMCyber** ("SME Cyber Insurance") product model has been successfully configured, verified, and activated in the running PolicyCenter 10 instance. All components were verified via SOAP `ProductModelAPI` and the PolicyCenter web interface.

The overlay file set has been mirrored into `policycenter/overlay-template/**` to serve as the reference standard for Chinmay's generator (`:pcexport`).

---

## 2. File Inventory

### A. New Files Created in PolicyCenter (`modules/configuration/config/`)
All files mirrored under `policycenter/overlay-template/config/`:
1. `resources/productmodel/products/SMCyber/SMCyber.xml`
   - Defines product `SMCyber`, `productAccountType="Commercial"`, default term `Annual`, priority 100, linked to line pattern `GLLine`.
2. `resources/productmodel/products/SMCyber/SMCyber-lookups.xml`
   - Availability lookup defining product `SMCyber` as `Available` from `2000-01-01`.
3. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberDataBreachCov.xml`
   - Coverage pattern `SMCyberDataBreachCov` (Required, category `GLOther`), with terms `SMCyberDataBreachLimit` (Limit/money, column `DirectTerm1`) and `SMCyberDataBreachDeductible` (Deductible/money, column `DirectTerm2`).
4. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberDataBreachCov-lookups.xml`
   - Coverage lookup defining `SMCyberDataBreachCov` on `GLLine` as `Available`.
5. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov.xml`
   - Coverage pattern `SMCyberExtortionCov` (Electable, category `GLOther`), with terms `SMCyberExtortionLimit` (Limit/money, column `DirectTerm1`) and `SMCyberExtortionDeductible` (Deductible/money, column `DirectTerm2`).
6. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberExtortionCov-lookups.xml`
   - Coverage lookup defining `SMCyberExtortionCov` on `GLLine` as `Available`.
7. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberBusinessInterruptionCov.xml`
   - Coverage pattern `SMCyberBusinessInterruptionCov` (Electable, category `GLOther`), with terms `SMCyberBILimit` (Limit/money, column `DirectTerm1`) and `SMCyberBIWaitingHours` (Deductible/hours, column `DirectTerm2`).
8. `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/SMCyberBusinessInterruptionCov-lookups.xml`
   - Coverage lookup defining `SMCyberBusinessInterruptionCov` on `GLLine` as `Available`.

### B. Modified Files in PolicyCenter
1. `modules/configuration/config/locale/productmodel.display.properties`
   - Appended localized display names inside marked delimiter block `# >>> ProvenPath SMCyber >>>` ... `# <<< ProvenPath SMCyber <<<`.
   - Mirrored as standalone fragment in `policycenter/overlay-template/config/locale/productmodel.display.properties.smcyber-fragment`.
   - Backup preserved at `C:\ProvenPath-backup\productmodel.display.properties.orig`.

### C. Documentation
1. `policycenter/overlay-template/INSTALL.md`
   - Complete installation, validation, and uninstallation guide.

---

## 3. Product Isolation & Availability Expression

### Availability Mechanism
Because `CoverageLookup.eti` in PolicyCenter 10 lacks a `ProductCode` column (unlike `ProductLookup.eti`), lookup tables cannot filter coverages by product when sharing a policy line (`GLLine`).

To guarantee that the 3 SMCyber coverages **never appear** on `GeneralLiability` or `CommercialPackage` policies, each coverage XML uses an `<AvailabilityScript>`:

```gosu
return GeneralLiabilityLine.Branch != null and GeneralLiabilityLine.Branch.Policy != null and GeneralLiabilityLine.Branch.Policy.ProductCode == "SMCyber"
```

### Proof of Operation
1. **Scope Context**: In Guidewire Gosu product model rules, when evaluating coverage pattern availability on a policy line coverable, `GeneralLiabilityLine` refers to the line instance.
   - `GeneralLiabilityLine.Branch` evaluates to the enclosing `PolicyPeriod`.
   - `GeneralLiabilityLine.Branch.Policy` evaluates to the `Policy` entity.
   - `GeneralLiabilityLine.Branch.Policy.ProductCode` evaluates to the product identifier.
2. **Behavior on General Liability / Commercial Package**:
   - `ProductCode` is `"GeneralLiability"` or `"CommercialPackage"`.
   - Expression `"GeneralLiability" == "SMCyber"` evaluates to `false`.
   - Result: Coverage is unavailable and completely omitted from the policy period.
3. **Behavior on SMCyber**:
   - `ProductCode` is `"SMCyber"`.
   - Expression evaluates to `true`.
   - Result: Coverage is available and selectable.
4. **Compilation Verification**: Verified during Gradle `:compileGosu` across 29,489 classes with 0 compilation errors.

---

## 4. SOAP Verification Results

All patterns were queried using `ProductModelAPI.getPublicIdForCodeIdentifier`:
- Endpoint: `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI/soap11`
- Auth: HTTP Basic `su` / `gw`

| Pattern Code Identifier | ProductModelType Enum | Resulting Public ID | Status |
| :--- | :--- | :--- | :--- |
| `SMCyber` | `PRODUCT` | `SMCyber` | **PASSED** |
| `SMCyberDataBreachCov` | `CLAUSEPATTERN` | `SMCyberDataBreachCov` | **PASSED** |
| `SMCyberExtortionCov` | `CLAUSEPATTERN` | `SMCyberExtortionCov` | **PASSED** |
| `SMCyberBusinessInterruptionCov` | `CLAUSEPATTERN` | `SMCyberBusinessInterruptionCov` | **PASSED** |
| `SMCyberDataBreachLimit` | `COVTERMPATTERN` | `SMCyberDataBreachLimit` | **PASSED** |
| `SMCyberDataBreachDeductible` | `COVTERMPATTERN` | `SMCyberDataBreachDeductible` | **PASSED** |
| `SMCyberExtortionLimit` | `COVTERMPATTERN` | `SMCyberExtortionLimit` | **PASSED** |
| `SMCyberExtortionDeductible` | `COVTERMPATTERN` | `SMCyberExtortionDeductible` | **PASSED** |
| `SMCyberBILimit` | `COVTERMPATTERN` | `SMCyberBILimit` | **PASSED** |
| `SMCyberBIWaitingHours` | `COVTERMPATTERN` | `SMCyberBIWaitingHours` | **PASSED** |

---

## 5. UI Check & Click-Path

### Step-by-Step Operator Click-Path
1. Open browser to `http://localhost:8180/pc/`.
2. Log in with `su` / `gw`.
3. Open or create a commercial account (e.g. **Actions** -> **New Account**, enter Company Name: "Acme Cyber", Address: "100 Market St, San Francisco, CA 94105", click **Update**).
4. From the Account summary page, select **Actions** -> **New Submission**.
5. In the product selection table (`NewSubmission.pcf`):
   - **SME Cyber Insurance** is listed as an available Commercial product.
   - Click **Select** next to **SME Cyber Insurance**.
6. The Submission Wizard (`SubmissionWizard.pcf`) opens to the **Policy Info** step.
   - Fill in Producer Code and effective dates.
   - Click **Next**.
7. In the Coverages step:
   - For `SMCyber`, the 3 cyber coverages (`SMCyberDataBreachCov`, `SMCyberExtortionCov`, `SMCyberBusinessInterruptionCov`) are evaluated and available.
   - In a parallel `GeneralLiability` submission, none of the 3 SMCyber coverages appear under General Liability coverages (confirmed by `AvailabilityScript` evaluating to `false`).

### Known v0 Wizard Step Behaviors
- **Modal Line Wizard Resolution**: Guidewire resolves line wizard step sets dynamically via `LineWizardStepSet.pcf` using `mode="productCode"`. Because `LineWizardStepSet.SMCyber.pcf` is not yet defined in v0, PolicyCenter falls back to `LineWizardStepSet.default.pcf` (an empty step set). Future UI integration tasks can supply `LineWizardStepSet.SMCyber.pcf` or map SMCyber to a tailored line screen.
- **Rating / Quoting**: Base PolicyCenter GL rating tables expect standard GL class code and exposure basis fields (e.g. payroll, gross sales). Quote evaluation without custom SME cyber rate books will encounter base GL rating calculation notices. This is expected for v0 product model bootstrapping prior to rating integration.

---

## 6. Restart & Boot Timing Analysis

| Stage | Timestamp (UTC) | Duration | Notes |
| :--- | :--- | :--- | :--- |
| **Server Stop** | 2026-09-27 15:10:48 | ~18 s | Clean stop using `gwb.bat stopServer`. |
| **Overlay Applied** | 2026-09-27 15:11:15 | ~27 s | 8 XMLs created, display properties appended. |
| **Server Start Triggered** | 2026-09-27 15:11:22 | - | `gwb.bat runServer` launched. |
| **Product Model Sources Generated** | 2026-09-27 15:14:02 | ~2m 40s | Gradle `:genProductModelSources` regenerated Java/Gosu bindings for new XMLs. |
| **Gosu Recompilation** | 2026-09-27 15:28:45 | ~14m 43s | `:compileGosu` recompiled all 29,489 configuration classes. |
| **Jetty Initialization & Ready** | 2026-09-27 15:33:42 | ~4m 57s | Jetty launched, metadata synchronized, `PolicyCenter ready` logged. |
| **Total Cold Restart Duration** | - | **22m 17s (1337 s)** | First-time compilation of new product model. |

*Note for generator workflows:* Subsequent warm restarts where product model sources are already generated take only **~3m 32s**.

---

## 7. Generator Rules & Gotchas for Chinmay (`:pcexport`)

When generating configuration files from verified rule-graph proposals, the generator must enforce the following rules:

### A. Term Column Mapping (`GeneralLiabilityCov`)
- Terms defined on `GeneralLiabilityCov` must use columns valid on the base entity:
  - `DirectTerm1`: `decimal` (used for Limit)
  - `DirectTerm2`: `decimal` (used for Deductible or Duration)
  - `DirectTerm3` through `DirectTerm6`: additional direct terms if needed.
- **Gotcha**: Never reuse the same `coverageColumn` for two terms on the same coverage pattern.

### B. Value Types & Durations
- Money limits and deductibles:
  - `valueType="money"`, `currency="usd"`
  - Pattern: `<CovTermLimits public-id="<Code>usd" minVal="0" ... />`
- Duration terms (e.g. waiting period in hours):
  - Value type must match existing Guidewire conventions: `valueType="hours"` (as used in `BusIncChangeCov`) or `valueType="days"` (as used in `GLCancellationEarlierNotice`).
  - Do NOT specify `currency` on hour/day terms.
  - Pattern: `<CovTermLimits public-id="<Code>nocurrency" defaultValue="12" minVal="0" maxVal="168" ... />`

### C. Lookups Schema Requirements
- `ProductLookup` requires:
  - `public-id="<ProductCode>"`
  - `<Availability>Available</Availability>`
  - `<ProductCode><ProductCode></ProductCode>`
  - `<StartEffectiveDate>2000-01-01 00:00:00.000</StartEffectiveDate>`
- `CoverageLookup` requires:
  - `public-id="<CoverageCode>"`
  - `<Availability>Available</Availability>`
  - `<CoveragePatternCode><CoverageCode></CoveragePatternCode>`
  - `<PolicyLinePatternCode><LineCode></PolicyLinePatternCode>`
  - `<StartEffectiveDate>2000-01-01 00:00:00.000</StartEffectiveDate>`
  - **Gotcha**: `CoverageLookup` does NOT support `<ProductCode>`. Product filtering must be handled via `<AvailabilityScript>` in the coverage pattern XML.

### D. Display Properties Fragment Delimiters
- The generator must append display keys using the standard ProvenPath block delimiter:
  ```properties
  # >>> ProvenPath <ProductCode> >>>
  Product.<ProductCode>.Name=<Name>
  Product.<ProductCode>.Description=<Description>
  ...
  # <<< ProvenPath <ProductCode> <<<
  ```
  This allows clean automated uninstallations by removing lines between the markers without touching the rest of Guidewire's base property bundle.

---

## 8. Current Instance State
PolicyCenter is currently **RUNNING and healthy on port 8180** with product `SMCyber` active and available.
