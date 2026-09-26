# Chinmay — Track B: Real PolicyCenter Integration (Gosu)

**Branch:** `track-b/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `policycenter/`, `backend/pcexport`, `backend/pcdeploy`, `docker-compose.yml`, `docs/policycenter.md`

> ⚠️ This track needs a **licensed Guidewire PolicyCenter 10 install** (`C:\GW10\PolicyCenter`). If you don't have one, swap tracks with whoever does.
> ⚠️ The GitHub repo is **PUBLIC**. Never commit any Guidewire file, PC jar, the PC install or a PC Docker image. Commit only files **you wrote** (the SMCyber overlay, the ProvenPath Gosu plugin, Dockerfile/scripts).

## Checklist
- [ ] **D1 09:00–12:00 PC boot spike ⭐:** PC 10 running natively (`gwb runServer` / `gradlew runServer`, `http://localhost:8180/pc`, `su`/`gw`), then in Docker with a bind-mounted `${PC_HOME}`. Record boot and restart times in `docs/policycenter.md`. If Docker fails by 12:00, run PC **natively** and have the backend use `host.docker.internal:8180`
- [ ] **D1 10:30–13:30:** hand-build **SMCyber v0** in real PC: `products/SMCyber/SMCyber.xml` + 3 coverage patterns on `GLLine` (Data Breach, Extortion, Business Interruption) with `<CovTerms>` + `AvailabilityScript` (ProductCode == "SMCyber") + display keys. New Submission → SMCyber shows them
- [ ] **D1 14:00–18:00:** copy **your** v0 files into `policycenter/overlay-template/`. `:pcexport` (Proposal → overlay + `PcManifest`) with a golden test
- [ ] **D1 18:00 CP2:** SMCyber v0 visible in real PC
- [ ] **D1 19:00–23:00:** `:pcdeploy`: token + approval check → back up the old files → write the overlay → restart trigger → poll `/pc` → `pc.*` events
- [ ] **D2 09:30–12:30:** ProductModelAPI SOAP verify → `pc.verified`. **PC-side Gosu gate** (`ProvenPathValidation.gs` + a validation rule) rejects out-of-range SMCyber terms with the rule code
- [ ] **D2 12:30 CP4:** a full deploy lands in real PC, and the PC-side rejection works
- [ ] **D2 13:30–15:00 stretch:** SubmissionAPI creates a submission → startup manifest-hash check → rate book + rating so it quotes
- [ ] **D2 15:00–17:00:** pre-deployed backup PC state, timed restart, `policycenter/README.md`

## Prompt for your coding agent

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan — follow exactly), team/CHINMAY.md, 02_PRODUCT_MODEL.md, 04_RULES_AND_UNDERWRITING.md, 07_GOSU.md, 08_WORKFLOWS.md, 09_INTEGRATIONS.md, 10_PROVENPATH_MAPPING.md, 11_FILE_REFERENCE.md, backend/contracts (PcManifest, Proposal, Verdict).

STACK: ProvenPath backend in GOSU on JDK 11 (Gradle multi-module), REAL Guidewire PolicyCenter 10.2 (Gosu 1.14.26, Gradle build, H2 dev DB, port 8180, context /pc, login su/gw), everything via Docker, NO Python, NO mock PolicyCenter. Gosu syntax only (.gs, uses, var x : T, function, construct(), blocks). The PolicyCenter install lives at PC_HOME (e.g. C:/GW10/PolicyCenter) and is licensed — the GitHub repo is PUBLIC, so NEVER copy Guidewire files, jars or the install into the repo or into a Docker image; bind-mount it. Commit only files we author.

I own TRACK B — real PolicyCenter integration.

1. PC runtime: policycenter/Dockerfile (eclipse-temurin:11-jdk, nothing from Guidewire baked in) + entrypoint.sh: runs the PC dev server from /opt/pc (bind mount of PC_HOME) with a restart loop — when /opt/pc-trigger/restart appears, stop the server, delete the trigger, start again. docker-compose.yml service `policycenter` under profile "pc", port 8180, gradle cache volume, enough memory (document the Docker Desktop RAM needed). If PC won't run in Docker, document the native fallback (backend uses host.docker.internal:8180). Write docs/policycenter.md with exact commands, boot/restart timings, and ports.

2. SMCyber v0 by hand in real PC (Phase 1 = no new entities): new Product products/SMCyber/SMCyber.xml; 3 new coverage patterns on the existing General Liability line (GLLine) under policylinepatterns/.../coveragepatterns/: SMCyberDataBreachCov, SMCyberExtortionCov, SMCyberBusinessInterruptionCov, each with <CovTerms> (limit + deductible as money Option or Direct cov terms, waiting hours for BI), an AvailabilityScript restricting them to ProductCode == "SMCyber", and display keys. Rebuild/restart; confirm New Submission → SMCyber shows the coverages. Then copy ONLY these files we authored into policycenter/overlay-template/ (same relative paths as in modules/configuration).

3. backend/pcexport (package provenpath.pcexport, depends ONLY on :contracts): given Proposal + Verdict (PASSED) + review info → generate the overlay files from overlay-template (patterns, cov terms, limits/deductibles from the clauses, display keys) + provenpath-manifest.json (PcManifest: file sha256s, verdictHash, gateToken, reviewId, reviewer, termRanges from the RANGE rules e.g. extortion limit max = 50% of aggregate with ruleCode CYB-RNG-002). Golden test: fixtures/proposal_demo_fixed.json → overlay structurally equal to v0.

4. backend/pcdeploy (package provenpath.pcdeploy): deploy(executionId): refuse unless GateToken valid AND approved review (a BLOCKED verdict must write ZERO files); back up current SMCyber files (rollback); write the overlay into the bind-mounted PC_HOME/modules/configuration; touch the restart trigger; poll http://policycenter:8180/pc until up; call ProductModelAPI (SOAP, raw envelope via java.net.http, auth su/gw; get the exact WSDL from the running PC at /pc/ws/...) to confirm the SMCyber patterns exist. Emit pc.export, pc.write, pc.restart, pc.ready, pc.verified / pc.failed via EventPort. Store in pp_deployment.

5. PC-side runtime gate: policycenter/plugin/gsrc/provenpath/pc/ProvenPathValidation.gs + a validation rule on PolicyPeriod (or an IValidationPlugin) in PC: for SMCyber policies, every SMCyber cov term value must be within the manifest termRanges; otherwise reject at TC_DEFAULT with a message like "ProvenPath CYB-RNG-002: Extortion limit ₹40,00,000 exceeds verified max ₹25,00,000". The plugin files are part of the overlay the deployer installs. Document registration steps in policycenter/README.md.

6. Stretch, in order: SubmissionAPI (SOAP) creates an SMCyber submission from ProvenPath; startup check that SMCyber overlay sha256s match the manifest; rate book import + rating for the cyber coverages so the submission quotes.

Rules: branch track-b/*, merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 12:30, 15:00 freeze). Before every merge check the diff contains no Guidewire files/jars. No AI co-author lines. Secrets (PC_HOME, PC_USER, PC_PASSWORD, PROVENPATH_GATE_SECRET) only in .env.
```
