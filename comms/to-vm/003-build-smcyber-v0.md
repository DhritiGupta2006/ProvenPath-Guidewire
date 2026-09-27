# 003: Hand-build SMCyber v0 in the real PolicyCenter (first change to PC)

**Why:** your report 002 was excellent, thank you. Now we need the **real, working file set** for our product so Chinmay's generator (`:pcexport`) can produce exactly these files from verified proposals. This task **does change PolicyCenter config**. The backup already exists (`C:\ProvenPath-backup\configuration-20260926-1918`).

**Allowed to commit:** `comms/from-vm/003-smcyber-v0-report.md` and `policycenter/overlay-template/**` (files **you author**; see D).

## Decisions (use exactly these names; they must match our rule graph)
- Product code **`SMCyber`** (display name "SME Cyber Insurance"), reusing line pattern **`GLLine`**.
- Coverage patterns, all on `GLLine` with `coverageSubtype="GeneralLiabilityCov"`, `owningEntityType="GeneralLiabilityLine"`, `policyLinePattern="GLLine"`, `coverageCategory="GLOther"` (so `GLLine.xml` stays untouched):
  | codeIdentifier | existence | Terms (codeIdentifier: model / value type) |
  |---|---|---|
  | `SMCyberDataBreachCov` (Data Breach Response) | Required | `SMCyberDataBreachLimit`: Limit/money · `SMCyberDataBreachDeductible`: Deductible/money |
  | `SMCyberExtortionCov` (Cyber Extortion / Ransomware) | Electable | `SMCyberExtortionLimit`: Limit/money · `SMCyberExtortionDeductible`: Deductible/money |
  | `SMCyberBusinessInterruptionCov` (Business Interruption) | Electable | `SMCyberBILimit`: Limit/money · `SMCyberBIWaitingHours`: waiting period in hours |
- Prefer **`DirectCovTermPattern`** (free numeric values; our gate plus the PC-side check enforce ranges) with `currency` INR if the pattern supports it, otherwise follow what existing GL terms do. For the waiting hours, pick the value type an existing term in this codebase uses for counts or durations, and cite that example in your report. Give each coverage's terms distinct `coverageColumn`s (`DirectTerm1`, `DirectTerm2`, …) valid for `GeneralLiabilityCov`.
- **The SMCyber coverages must only appear on product SMCyber, never on the existing GeneralLiability or CommercialPackage products.** Achieve this with an `<AvailabilityScript>` (or a lookup dimension) based on the policy's product code. Find the correct Gosu expression from existing availability scripts, and prove it in the report.

## A. Before changing anything
1. PC is running (from task 002). Stop it: `gwb.bat stopServer`.
2. Copy `config\locale\productmodel.display.properties` to `C:\ProvenPath-backup\productmodel.display.properties.orig`.
3. Start a running list of **every file you create or modify** (you'll need it for D and for uninstall).

## B. Create the files (per your 002 recommendation)
- `resources/productmodel/products/SMCyber/SMCyber.xml` + `SMCyber-lookups.xml` (available; commercial; annual term; `ProductPolicyLinePattern` → `GLLine`; add whatever else a product needs to show in New Submission, based on how `GeneralLiability.xml` does it: question sets, offerings, policy terms and so on).
- `resources/productmodel/policylinepatterns/GLLine/coveragepatterns/<Code>.xml` + `<Code>-lookups.xml` for the 3 coverages.
- Append display names to `config/locale/productmodel.display.properties` **inside a marked block**:
  `# >>> ProvenPath SMCyber >>>` … `# <<< ProvenPath SMCyber <<<` (product, 3 coverages, 6 terms).

## C. Restart and verify
1. `gwb.bat runServer` in its own console and wait for `PolicyCenter ready`. If it fails, read the server log, fix our files and retry. If you can't get it to start, **roll back** (delete our new files, restore the `.orig` properties file), start PC, make sure it's healthy, and report `Status: BLOCKED` with the exact errors.
2. SOAP `getPublicIdForCodeIdentifier` must return the id for: the product `SMCyber` (use the correct `productModelType` enum for products) and the 3 coverage patterns (`CLAUSEPATTERN`). Also check a couple of the term codes if that type is supported.
3. **UI check.** If you can drive a browser on the VM, do it; otherwise write an exact click-path for a human. Log in `su`/`gw` → create or open an account → New Submission → product list shows **SME Cyber Insurance** → start it → the coverages screen shows the 3 SMCyber coverages with their terms. **Also confirm** a GeneralLiability submission does **not** show them. Note any wizard step that breaks for SMCyber (question sets, locations, rating/quote errors are acceptable for v0; record them).
4. Leave PC running with SMCyber installed.

## D. Commit our authored files as the generator template
Mirror the paths under `policycenter/overlay-template/`, relative to `modules/configuration/`. For example: `policycenter/overlay-template/config/resources/productmodel/products/SMCyber/SMCyber.xml`.
- The 8 new XML files you wrote.
- `policycenter/overlay-template/config/locale/productmodel.display.properties.smcyber-fragment`: **only our marked block**, never the whole Guidewire file.
- `policycenter/overlay-template/INSTALL.md`: which files are new vs. which get a block appended, the exact install and uninstall steps, and that a PC restart (~3.5 min) is required.
- No Guidewire copyright headers. These are our files; if you started from a copy of an existing Guidewire file, rewrite it so only our content remains. `scripts/vm-check-staged.sh` will block headers.

## E. Report (`comms/from-vm/003-smcyber-v0-report.md`)
`Status: DONE | PARTIAL | BLOCKED`, then:
- the files list (new / modified);
- the availability expression used and the proof it works;
- the SOAP results and the UI check results (or the click-path);
- the restart time;
- the errors hit and how you fixed them;
- anything the generator must know: term column mapping, required attributes, gotchas.

Then run the safety check, commit, `pull --rebase`, and push (see `comms/README.md`).
