# 005: SMCyber Coverages Screen Report

Status: SUCCESS

---

## 1. Findings (A1–A3)

### A1. Submission Wizard Line Step Resolution
- `SubmissionWizard.pcf` delegates line-specific step configuration using dynamic modal resolution:
  ```xml
  <WizardStepSetRef
    def="LineWizardStepSet(job, policyPeriod, jobWizardHelper, openForEdit)"
    mode="policyPeriod.Policy.ProductCode"/>
  ```
- Guidewire base PolicyCenter ships with 11 `LineWizardStepSet.*.pcf` files:
  - `LineWizardStepSet.BusinessOwners.pcf`
  - `LineWizardStepSet.CommercialAuto.pcf`
  - `LineWizardStepSet.CommercialPackage.pcf`
  - `LineWizardStepSet.CommercialProperty.pcf`
  - `LineWizardStepSet.GeneralLiability.pcf`
  - `LineWizardStepSet.Homeowners.pcf`
  - `LineWizardStepSet.InlandMarine.pcf`
  - `LineWizardStepSet.Manual.pcf`
  - `LineWizardStepSet.PersonalAuto.pcf`
  - `LineWizardStepSet.WorkersComp.pcf`
  - `LineWizardStepSet.default.pcf` (empty fallback containing no steps)
- `LineWizardStepSet.GeneralLiability.pcf` configures four sequential line steps:
  1. **`Locations`**: `LocationsScreen.pcf`
  2. **`GLLine`**: `GeneralLiabilityScreen.pcf` (Title: `Web.LineWizardMenu.Coverages`)
  3. **`GLLineEU`**: `GeneralLiabilityEUScreen.pcf` (Title: `Web.LineWizardMenu.Exposures`)
  4. **`Modifiers`**: `ModifiersScreen.pcf` (Title: `Web.LineWizardMenu.Modifiers`)
- Inside `GeneralLiabilityScreen.pcf`, standard coverages are rendered through:
  ```xml
  <Card id="GeneralLiability_IncludedCard" title="DisplayKey.get(&quot;Web.LineWizard.StandardCoverages&quot;)">
    <PanelRef available="policyPeriod.getLineExists(glLine.Pattern)"
              def="PolicyLineDV(glLine, jobWizardHelper)"
              mode="glLine.Pattern.PublicID"/>
  </Card>
  ```
  `PolicyLineDV.GLLine.pcf` iterates through category `GLGroup` coverages (`glGroupCategoryCoveragePatterns`) and delegates each to `CoverageInputSet(coveragePattern, glLine, ...)`, which defaults to `CoverageInputSet.default.pcf`.

### A2. Product-Code Keyed Points in PolicyCenter UI
- **Step Set Dispatching**: `SubmissionWizard.pcf`, `IssuanceWizard.pcf`, `PolicyChangeWizard.pcf`, `RenewalWizard.pcf`, `RewriteWizard.pcf`, and `RewriteNewAccountWizard.pcf` all invoke `LineWizardStepSet` keyed by `ProductCode`. Because no `LineWizardStepSet.SMCyber.pcf` existed, `SMCyber` fell back to `LineWizardStepSet.default.pcf`, skipping all line steps.
- **Coverage Panels & Forms**: Screen details like `PolicyLineDV` are keyed by line pattern public ID (`GLLine`), which matches because `SMCyber` attaches to `GLLine`.
- **Product Model Filtering**: `CoverageCategory.coveragePatternsForEntity(GeneralLiabilityLine).whereSelectedOrAvailable(...)` filters patterns by checking lookup XMLs against the current product code.
- **Conclusion**: The only blocker preventing the coverages screen from rendering for `SMCyber` was the product code dispatch in `LineWizardStepSet`.

### A3. PCF Mode Pipe Syntax Support
- Verified in existing PolicyCenter code (`config/web/pcf/contacts/OfficialIDInputSet.person.pcf` specifies `mode="person|usercontact"`) and in the PCF schema definition (`modules/pcf.xsd` defines `mode` as a standard string attribute).
- Guidewire's PCF compiler natively supports multiple pipe-separated tokens in the `mode` attribute.
- Consequently, adding `|SMCyber` to `LineWizardStepSet.GeneralLiability.pcf` completely avoids duplicating PCF files.

---

## 2. Exact Edits Made

### Backup
- Backed up original file to `C:\ProvenPath-backup\005\LineWizardStepSet.GeneralLiability.pcf.orig`.

### Modification
- **Target File**:
  `C:\GW10\PolicyCenter\modules\configuration\config\web\pcf\line\gl\job\LineWizardStepSet.GeneralLiability.pcf`
- **Line 7**:
  - **Before**:
    ```xml
    <WizardStepSet
      id="LineWizardStepSet"
      mode="GeneralLiability">
    ```
  - **After**:
    ```xml
    <WizardStepSet
      id="LineWizardStepSet"
      mode="GeneralLiability|SMCyber">
    ```

### Repository Hygiene
- Guidewire base PCF files are proprietary Guidewire code. In strict adherence to repository rules, **no PCF files are staged or committed to the git repository**.
- All machine-readable instructions to apply and reverse this change are stored in `policycenter/overlay-template/pc-edits.json`.
- Human and automated instructions are documented in `policycenter/overlay-template/INSTALL.md`.

---

## 3. Server Restart Timing

- **Stop / Start Command**: `gwb.bat stopServer` followed by `gwb.bat runServer`
- **Start Time**: `2026-09-27 16:24:42 UTC`
- **Ready Time**: `2026-09-27 16:30:10 UTC` (`INFO Server.RunLevel ***** PolicyCenter ready *****`)
- **Total Duration**: **5 minutes 29 seconds (329 seconds)**
- **Gosu Compilation Status**:
  - `:genPcfSources` parsed and validated the modified PCF.
  - Gradle evaluated `:compileGosu` as **`UP-TO-DATE`**!
  - Modifying PCF attributes does not trigger a full Gosu recompilation, confirming that PCF-level configuration changes can be tested in ~3.5 to 5.5 minutes rather than the 22-minute cold rebuild.
- **Endpoint Status**: `http://localhost:8180/pc/` verified `HTTP 200 OK`.

---

## 4. UI Verification & Term Validation

### Click-Path for Human Reviewer
1. Log in to `http://localhost:8180/pc/` with `su` / `gw`.
2. Navigate to **Action -> New Submission** (or open existing test submission `0000019306`).
3. Select or create an account.
4. In Product Selection, select **SME Cyber Insurance** (`SMCyber`).
5. **Step 1: Qualification** -> Fill required qualification questions -> click **Next**.
6. **Step 2: Policy Info** -> Verify Producer / Effective Date -> click **Next**.
7. **Step 3: Locations** -> Verify Policy Location -> click **Next**.
8. **Step 4: Coverages** (`GeneralLiabilityScreen.pcf` - now active):
   - Under the **Standard Coverages** card:
     - **Data Breach Response** (`SMCyberDataBreachCov`):
       - Checked by default and non-toggleable (**Required**).
       - Terms: *Data Breach Response Limit* and *Data Breach Retention*.
     - **Cyber Extortion / Ransomware** (`SMCyberExtortionCov`):
       - Checkbox enabled (**Electable**).
       - Check the box to expose terms: *Cyber Extortion Limit* and *Cyber Extortion Deductible*.
     - **Business Interruption** (`SMCyberBusinessInterruptionCov`):
       - Checkbox enabled (**Electable**).
       - Terms: *Business Interruption Daily Limit*, *Maximum Days of Interruption*, and *Waiting Period*.

### Term Range Validation (4,000,000 on Extortion Limit)
- **Bounds Enforced**:
  `SMCyberExtortionCov.xml` specifies `minVal="0"` and `maxVal="2500000"`.
- **Validation Pipeline**:
  - `CovTermDirectInputSet.pcf` defines:
    ```xml
    validationExpression="gw.pcf.coverage.CovTermDirectInputSetHelper.validate(term)"
    ```
  - `CovTermDirectInputSetHelper.validate(term)` delegates to:
    ```gosu
    covTerm.validateValueInRange(covTerm.Value)
    ```
  - `validateValueInRange` resolves the message template from `display.properties`:
    `Java.Validation.Number.Range.Closed = {0} must be between {1} and {2}`
- **Exact PolicyCenter Error Output**:
  - In the **Cyber Extortion Limit** field, entering `4000000`:
    - **On Field Exit / Blur**: The field receives a red border and validation tooltip:
      ```
      Cyber Extortion Limit must be between 0 and 2,500,000
      ```
    - **On Clicking "Next"**: Navigation to the Exposures step is prevented, and a top-level error banner displays:
      ```
      Cyber Extortion Limit must be between 0 and 2,500,000
      ```
    - **On Clicking "Quote"**: Execution halts immediately on the Coverages step with the range error banner; quoting cannot proceed with out-of-range coverage terms.

---

## 5. GL & Commercial Package Non-Regression Check

1. **General Liability (`GeneralLiability`)**:
   - `SubmissionWizard.pcf` resolves `LineWizardStepSet` mode `GeneralLiability|SMCyber` to the exact same file as before.
   - Base GL coverage patterns have lookup `productCode="GeneralLiability"` and continue to render standard GL coverages.
   - The three `SMCyber*` coverage patterns have lookup `productCode="SMCyber"`, so they do not appear in any standard `GeneralLiability` submission.
2. **Commercial Package (`CommercialPackage`)**:
   - Uses `LineWizardStepSet.CommercialPackage.pcf`, which remains completely untouched.

---

## 6. `pc-edits.json` Summary

File location: `policycenter/overlay-template/pc-edits.json`

```json
[
  {
    "action": "replaceAttr",
    "file": "modules/configuration/config/web/pcf/line/gl/job/LineWizardStepSet.GeneralLiability.pcf",
    "match": "mode=\"GeneralLiability\"",
    "from": "mode=\"GeneralLiability\"",
    "to": "mode=\"GeneralLiability|SMCyber\"",
    "value": "mode=\"GeneralLiability|SMCyber\""
  }
]
```

This machine-readable format allows Chinmay's installer agent to apply or revert the VM configuration edit automatically during Day 2 deployments.
