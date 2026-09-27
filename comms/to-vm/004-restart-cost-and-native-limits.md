# 004: Measure the per-deploy restart cost, add PC-native term limits, clarify the UI check

**Why:** 003 was great work. Two things decide the demo design now:
1. **The restart cost of a *second* deploy.** 003's first install took 22 min 17 s (a full `compileGosu` of 29,489 classes). If every change to a product-model XML costs that much, a live deploy in the demo is impossible and we switch to a "pattern set installed once, per-deploy data only" design. We need the real number.
2. **PC-native enforcement.** If `CovTermLimits` carries `minVal`/`maxVal`, PolicyCenter itself should reject out-of-range values, which could replace a custom Gosu gate inside PC.

**Allowed to commit:** `comms/from-vm/004-*-report.md` and changed files under `policycenter/overlay-template/**`.

## A. Clarify 003 (answer first, briefly and honestly)
For each of these, say whether you **actually observed it** (you loaded the page / saw the output) or **inferred it** (from code, config or reasoning):
- (a) SME Cyber Insurance appears in the New Submission product list.
- (b) the 3 coverages appear on an SMCyber submission's coverage screen.
- (c) they do NOT appear on a GeneralLiability submission.

Also: given the fallback to `LineWizardStepSet.default.pcf` (empty), where exactly would a user see and edit SMCyber coverages? Read the PCFs (read-only) and answer: which wizard step or screen renders GL-line coverages, and does it depend on the product code?

## B. Restart-cost experiment (the key measurement)
1. `gwb.bat stopServer`.
2. Change **only values** in one existing file: in `SMCyberExtortionCov.xml`, give `SMCyberExtortionLimitusd` `minVal="0"` `maxVal="2500000"` (the verified cap in our demo: 50% of ₹50L), and `SMCyberExtortionDeductibleusd` `minVal="0"` `maxVal="250000"`. Use the attribute names existing Guidewire files use for `CovTermLimits` bounds; cite one example.
3. `gwb.bat runServer` and time **each Gradle task** separately (`genProductModelSources`, `compileGosu`, other long ones) and Jetty until `PolicyCenter ready`. If Gradle prints UP-TO-DATE or re-run reasons, capture them.
4. Then stop and start **again with no changes at all**, and time that too (the baseline warm restart).
5. Report both numbers. If a values-only change still triggers a full `compileGosu`, say so explicitly. Also look for any way to avoid it that doesn't modify Guidewire's build scripts (e.g. a documented `gwb` option, or a product-model reload in dev mode), and report what you find **without** applying anything risky.

## C. PC-native range enforcement
While PC is up with the new limits: can a value above `maxVal` be rejected by PC itself? Find out from code or config (read-only): where `CovTermLimits` bounds are validated (which validation level, and whether it happens on field entry, quote or bind), and the exact error message format. If you can drive the UI, try entering 4000000 in Extortion Limit on an SMCyber submission and capture the actual message. Otherwise say what a human should see.

## D. Currency (read-only)
Is **INR** available in this PC (`Currency` typelist, multicurrency settings in `config.xml`, the default currency)? What would it take to use `currency="inr"` in our term limits: is a config flag enough, or does it need a restart plus a typelist change? **Don't change anything; just report.**

## E. Update the template
Mirror the changed `SMCyberExtortionCov.xml` into `policycenter/overlay-template/` and note the bounds convention in `INSTALL.md`. Leave PC running with the change installed.

## Report: `comms/from-vm/004-restart-and-limits-report.md`
`Status`, then the A–D answers and a timing table: first install (22 m 17 s, from 003), values-only change, and no change. End with your recommendation: can the demo do a live deploy, or should it pre-deploy?
