# 005: Make SMCyber coverages visible and editable in the Submission wizard

**Observed by a human in the UI (Day 0, 16:03):** Submission 0000019306 with product **SME Cyber Insurance** works: Qualification (GL pre-qualification questions) → Policy Info → Risk Analysis → Policy Review, with no errors. But there is **no coverages step**: the line step set falls back to the empty default, so our 3 coverages have no screen. (This answers 004-A(b): the coverages are not visible.)

**Goal:** an SMCyber submission gets the GL line's coverage step(s), so a user can see and edit the SMCyber coverages and their term values. That's also where PC-native `CovTermLimits` bounds (004) would reject an over-limit value in the demo. Do this **after** 004 (the lowest number goes first).

**Allowed to commit:** `comms/from-vm/005-*-report.md` and `policycenter/overlay-template/**`, but **no Guidewire PCF content** (see D).

## A. Investigate (read-only first)
1. How the Submission wizard picks the line steps: `LineWizardStepSet` with `mode="<productCode>"` (per 003). List the existing modes (`LineWizardStepSet.*.pcf`) and what the GeneralLiability one contains: which steps and screens render GL coverages (e.g. a coverages/exposures step and its `CoveragesScreen` or DV). Summarize in your own words.
2. Find **all** places keyed by product code that SMCyber may need for the GL line UI (step set, policy info line section, quote/review line panels, `CoveragesDV` or similar `mode` switches, `ProductModelUtil`-style code). Note each, with the minimum change it needs.
3. Does PCF `mode` support multiple values for one file (e.g. `mode="GeneralLiability|SMCyber"`), or does each product code need its own file? Answer from existing PCFs or the schema (`modules/pcf.xsd`), not guesses.

## B. Implement the smallest change (after backing up every file you'll modify to `C:\ProvenPath-backup\005\`)
Preferred order:
1. If a mode can be shared: extend the GL mode to include `SMCyber` (modifying a Guidewire file; record the exact one-line change so uninstall reverts it).
2. Otherwise: create `LineWizardStepSet.SMCyber.pcf` (plus any other per-mode PCFs from A2) **on the VM**, derived from the GeneralLiability ones with only the mode changed.
Keep GL and CommercialPackage behaviour unchanged.

## C. Restart and verify (a human will double-check in the UI)
- Restart PC and record the time. This is another data point for 004's restart question; say whether `compileGosu` ran fully.
- If you can drive the UI, open an SMCyber submission: the coverage step shows **Data Breach Response (required)**, **Cyber Extortion / Ransomware**, **Business Interruption**, and their terms are editable. Enter Extortion Limit **4000000** and record exactly what PC says (with the 004 bounds `maxVal=2500000`), on field entry, on Next, and on Quote. Otherwise write the exact click-path for the human.
- Confirm a GeneralLiability submission still looks exactly as before and shows none of the SMCyber coverages.

## D. Template and public-repo rule
Guidewire PCFs are **their** code, so **don't commit PCF files, or copies of them, to the public repo**. Instead, add to `policycenter/overlay-template/INSTALL.md` an **"Install steps on the PC side"** section that the installer (our agent, later) performs locally on the VM, for example: "copy `<GW path>/LineWizardStepSet.GeneralLiability.pcf` to `LineWizardStepSet.SMCyber.pcf` and change `mode` to `SMCyber`", or "in file X change attribute Y from A to B". Include the exact uninstall steps. Put a machine-readable version in `policycenter/overlay-template/pc-edits.json` (list of `{action: copy|replaceAttr|appendBlock, file, from, to, match, value}`) so Chinmay's agent can apply and revert it.

## Report: `comms/from-vm/005-coverages-screen-report.md`
`Status`, then:
- the findings from A1–A3;
- the exact edits made (files, before and after, in your own words);
- the restart timing;
- what the UI shows (observed or click-path), including PC's exact message for 4000000 on Extortion Limit;
- the GL non-regression check;
- the `pc-edits.json` summary.
