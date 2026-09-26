# Chinmay — Track B: Real PolicyCenter Integration (Gosu)

**Branch:** `track-b/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `policycenter/`, `backend/pcexport`, `backend/pcagent`, the backend `pc-agent` endpoints (with Shaurya), `vm/` native run scripts, `docs/policycenter.md`, and driving the **final VM integration** (`team/VM_INTEGRATION.md`)

> **Working model:** build almost everything on your laptop. Touch the Guidewire VM only twice:
> 1. **Day 1 morning:** start PC and hand-build SMCyber v0. That's the real file format our generator must copy.
> 2. **Day 2 from 11:30:** final merge, real PC connection and full testing, with **Claude Code in the VM terminal**.
>
> **No tunnel, no port forwarding** (college Wi-Fi blocks both). **GitHub is the only link**; on the VM, everything talks over `localhost`.
>
> ✅ **VM setup is already done** (`docs/policycenter.md`): backup at `C:\ProvenPath-backup\configuration-20260926-1918`, Temurin 11, Node 20, gh and Claude Code installed, repo at `C:\ProvenPath`. No Docker on the VM (Windows Server, non-admin `Student`).
>
> ⚠️ The GitHub repo is **PUBLIC**. Never commit a Guidewire file, PC jar or copy of the install. Commit only files **you wrote**.

## Checklist
- [ ] **D1 09:00–10:30 (VM):** `gwb.bat runServer`, time the boot and one stop/start, log in `su`/`gw`, find the ProductModelAPI WSDL URL. Fill the TODOs in `docs/policycenter.md`
- [ ] **D1 10:30–13:30 (VM):** hand-build **SMCyber v0** in PC: `products/SMCyber/SMCyber.xml` + 3 coverage patterns on `GLLine` (Data Breach, Extortion, Business Interruption) with `<CovTerms>` + `AvailabilityScript` (ProductCode == "SMCyber") + display keys. New Submission → SMCyber shows them. **Copy only these files you wrote** into `policycenter/overlay-template/` and push
- [ ] **D1 14:00–18:00 (laptop):** `:pcexport` (Proposal → overlay package + `PcManifest`) with a golden test. `vm\` scripts + Gradle wrapper; test the portable Postgres zip on your laptop
- [ ] **D1 18:00 CP2:** SMCyber v0 is visible in real PC, and the template is on `main`
- [ ] **D1 19:00–23:00 (laptop):** backend `/pc-agent/next` + `/pc-agent/status`; **`:pcagent`** runs the full loop against a **local test folder** (`PC_HOME`, `PC_STOP_CMD`/`PC_START_CMD` from config)
- [ ] **D2 09:30–11:30 (laptop):** `ProvenPathValidation.gs` (PC-side gate, **Gosu 1.14.26**, PC APIs only) in the overlay; ProductModelAPI SOAP client in the agent; `start-all.cmd` / `stop-all.cmd` done
- [ ] **D2 11:30 CP4a:** laptop-complete, tagged `v0.9-laptop`
- [ ] **D2 11:30–14:00 (VM):** run `team/VM_INTEGRATION.md` with Claude Code → **CP4 at 14:00**: the full path lands in real PC
- [ ] **D2 14:00–16:00 (VM):** full testing checklist, deploy/restart timings, known-good pre-deployed state; stretch only if green

## Prompt for your coding agent (on your laptop)

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan, follow exactly, esp. §0, §2, Day 1/Day 2), team/CHINMAY.md, docs/policycenter.md (VM facts), 02_PRODUCT_MODEL.md, 04_RULES_AND_UNDERWRITING.md, 07_GOSU.md, 09_INTEGRATIONS.md, 10_PROVENPATH_MAPPING.md, backend/README.md, backend/contracts (PcManifest, Proposal, Verdict), backend/core gate/GateToken, policycenter/overlay-template/ (the hand-built SMCyber v0 from real PC).

CONTEXT: The only PolicyCenter is a real PolicyCenter 10.2.1 (Gosu 1.14.26) on a Guidewire Windows VM at C:\GW10\PolicyCenter (start `gwb.bat runServer`, stop `gwb.bat stopServer`, http://localhost:8180/pc, su/gw). We build on laptops (Docker Compose: db, backend, web) and do the final integration on the VM later, where everything runs NATIVELY over localhost (no Docker there, non-admin user, Temurin 11, Node 20, portable Postgres). No tunnel, no port forwarding; GitHub is the only link. Backend = Gosu 1.18.1 on JDK 11, Gradle multi-module (see backend/README.md), tests via `bash backend/gradlew-docker.sh test`. Gosu syntax only (.gs). NO Python. No mock PolicyCenter in the product. The repo is PUBLIC: never commit Guidewire files, jars or the install; commit only files we author.

I own TRACK B.

1. backend/pcexport (package provenpath.pcexport, depends ONLY on :contracts): Proposal + PASSED Verdict + approved review → overlay package (zip): policycenter/overlay-template files filled from the clauses (limits, deductibles, waiting hours), display keys, the PC-side gate Gosu (item 4), and provenpath-manifest.json (PcManifest: file sha256s, verdictHash, gateToken, reviewId, reviewer, termRanges from the RANGE rules, e.g. SMCyberExtortionCov limit max = 50% of aggregate, ruleCode CYB-RNG-002). Golden test: fixtures/proposal_demo_fixed.json → structurally equal to the v0 template.

2. Backend endpoints (in :app, coordinate with Shaurya): POST /api/v1/deployments builds + queues the package ONLY if GateToken is valid AND the review is approved (a BLOCKED verdict must produce NO package). GET /api/v1/pc-agent/next (bearer PC_AGENT_KEY; long-poll ≤30s; next package + manifest, or 204). POST /api/v1/pc-agent/status (bearer; {deploymentId, step, detail}) → pc.pulled / pc.write / pc.restart / pc.ready / pc.verified / pc.failed events.

3. backend/pcagent (package provenpath.pcagent, depends ONLY on :contracts + the GateToken verifier; one fat jar run with `java -jar` under Temurin 11 as a normal user from a console, never a Windows service). Reads agent.env: BACKEND_URL (default http://localhost:8080), PC_AGENT_KEY, PROVENPATH_GATE_SECRET, PC_HOME, PC_URL, PC_USER, PC_PASSWORD, PC_STOP_CMD, PC_START_CMD, INBOX_DIR. Loop: long-poll /pc-agent/next (and watch INBOX_DIR for dropped zips) → verify HMAC gate token + every file sha256 (mismatch → refuse, report pc.failed "tampered package", touch nothing) → back up the current SMCyber files → write the overlay into PC_HOME/modules/configuration → run PC_STOP_CMD, then PC_START_CMD as a child process with logs captured (never change the global JAVA_HOME) → poll PC_URL until up, reporting elapsed time → call ProductModelAPI (SOAP, raw envelope via java.net.http, basic su/gw) to confirm the SMCyber patterns → report pc.verified. Test the WHOLE loop on the laptop with PC_HOME = a temp test folder and PC_STOP_CMD/PC_START_CMD/PC_URL pointing at small test scripts (this is test config, not a product mock). On the VM, the same jar gets the real gwb.bat commands.

4. PC-side runtime gate: policycenter/overlay-template/.../gsrc/provenpath/pc/ProvenPathValidation.gs + a validation rule on PolicyPeriod (or an IValidationPlugin) for PC: for SMCyber policies, every SMCyber cov term must be within the manifest termRanges, otherwise reject at TC_DEFAULT with e.g. "ProvenPath CYB-RNG-002: Extortion limit ₹40,00,000 exceeds verified max ₹25,00,000". MUST target PC's Gosu 1.14.26 and PC APIs only (no extra jars). Document registration in policycenter/README.md.

5. VM native run scripts in vm/ (Windows .cmd, no admin, idempotent): setup-postgres.cmd (portable PostgreSQL 16 zip in C:\ProvenPath-tools\pgsql, initdb into C:\ProvenPath-tools\pgdata, create DB/user from .env), start-all.cmd (sets JAVA_HOME=Temurin 11 only for its own processes; starts Postgres via pg_ctl, the backend jar on :8080, `next start` on :3000, and the agent, each in its own titled console with logs in C:\ProvenPath-backup\logs), stop-all.cmd. Add the Gradle wrapper (gradlew / gradlew.bat) to backend/ so the VM can build without Docker. npm commands on the VM always use --registry=https://registry.npmjs.org. Document all of it in vm/README.md.

6. Stretch (Day 2, only if CP4 is green): SubmissionAPI (SOAP) creates an SMCyber submission; startup check that the installed SMCyber files match the manifest sha256s; rate book import + rating so it quotes.

Rules: branch track-b/*, merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 11:30 laptop-complete). Before every merge, check the diff has no Guidewire files, jars or secrets. No AI co-author lines. Secrets only in .env / agent.env.
```

## Final integration on the VM
Day 2, 11:30: follow `team/VM_INTEGRATION.md` (a Claude Code prompt plus the full-testing checklist).
