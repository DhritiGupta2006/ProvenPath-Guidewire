# 002: PolicyCenter boot/restart timing + read-only product-model survey

**Why:** the only untested part of the demo is the PolicyCenter side. Chinmay's SMCyber product generator (`:pcexport`) and the PC agent need the **real** file formats, commands and timings from this PC. This task changes **nothing** in PolicyCenter; it only starts and stops it and reads files.

**Allowed to commit:** only `comms/from-vm/002-pc-survey-report.md`.

## A. Boot and restart timing (PC is currently stopped)
1. Open a **new console** (PC keeps the global Corretto `JAVA_HOME`; don't set Temurin in it). Run `cd C:\GW10\PolicyCenter` then `gwb.bat runServer`, and leave it running in its own window. Record the start time.
2. Poll `curl -s -o NUL -w "%{http_code}" http://localhost:8180/pc/` every 10 s until it answers 200 (or a redirect to the login page). Record the **boot time**. Note the log line that signals "ready", if there is one.
3. Check that login works without a browser if possible (e.g. the login page loads; SOAP below authenticates). Note the exact URLs.
4. **ProductModelAPI:** find the web service list or WSDL (try `http://localhost:8180/pc/ws/` and `.../ws/gw/webservice/pc/pc900/productmodel/ProductModelAPI?WSDL`, or search `C:\GW10\PolicyCenter` for `ProductModelAPI`). Record the exact working URL, the auth mechanism (basic auth? `gw_auth` / SOAP header?), and the names of operations useful for "does product X / coverage pattern Y exist". Try one read-only call (e.g. list or get products) with `su`/`gw` and record the request shape that worked. Summarize it; **don't commit the WSDL**.
5. Also check for REST: `http://localhost:8180/pc/rest/` or anything in `modules/configuration/config/integration/apis`. Note whether a REST product-model or submission API is enabled.
6. **Restart timing:** `gwb.bat stopServer` (from another console in `C:\GW10\PolicyCenter`), record how long the stop takes, start again with `runServer`, and record the time until 200 again. This is the time the demo waits after a deploy. Leave PC **running** at the end, and say so in the report.

## B. Read-only survey of the product model (for the SMCyber generator)
Look under `C:\GW10\PolicyCenter\modules\configuration\config\` and **read only**. Report in your own words, quoting only element and attribute names:
1. The **General Liability line**: the exact folder and file names under `resources/productmodel/policylinepatterns/` (is it `GLLine`, `GeneralLiabilityLine`, …?), its line pattern code, and its coverage categories.
2. One **existing GL coverage pattern** as a structural template: the root element, the key attributes (`code`, `coverageCategory`, `owningEntityType`, `existence`, `priority`, …), and how `<CovTerms>` looks for a **money limit** and a **money deductible** (`OptionCovTermPattern` vs `DirectCovTermPattern`, `valueType`, `modelType`, option lists). Also note whether an `<AvailabilityScript>` example exists and what it looks like.
3. **How a coverage pattern is registered with its line:** is dropping a new XML file enough, or must it also be listed in the line pattern XML, a category, or elsewhere?
4. **Products:** the structure of `resources/productmodel/products/<X>/<X>.xml`, how a product references its line pattern(s), and whether an existing line pattern can be referenced by a second product (look at CommercialPackage or similar).
5. **Display names:** where coverage and term display names come from (`display.properties`? which file path and key format?).
6. **Anything else a new coverage needs**, e.g. lookup/availability tables (`lookuptables`), typelists, or generated code.
7. Is **Advanced Product Designer (APD)** present/enabled? (Look for `apd` folders or modules.) Yes/no plus evidence.
8. Is there a **dev-mode product-model reload**, or is a full restart required for new product-model XML? (Check docs, configuration or logs if obvious; don't experiment.)

## C. Report (`comms/from-vm/002-pc-survey-report.md`)
- `Status: DONE | PARTIAL | BLOCKED`.
- A table of timings (boot, stop, restart), the exact URLs, and the auth mechanism.
- The survey answers B1–B8, concise, in your own words.
- **Your recommendation** for the smallest file set that makes 3 new coverages (Data Breach, Extortion, Business Interruption) appear under a new product `SMCyber` in New Submission, given what you found.
- Open questions and risks.

Then run the safety check (`bash scripts/vm-check-staged.sh` must print OK), commit, pull with rebase, and push. See `comms/README.md`.
