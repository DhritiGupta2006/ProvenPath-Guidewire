# Chinmay — Track B: Real PolicyCenter Integration (Gosu) on the Guidewire cloud VM

**Branch:** `track-b/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `policycenter/`, `backend/pcexport`, `backend/pcagent`, the backend `pc-agent` endpoints (with Shaurya), `docker-compose.yml` `tunnel` service, `docs/policycenter.md`

> PolicyCenter 10 exists **only on the Guidewire-provided cloud VM** (`C:\GW10\PolicyCenter`). The team docs `01`–`11` were generated there by agy. You work on that VM. Get the credentials **privately** from whoever holds them.
> **Pull model:** our backend never connects into the VM. The **ProvenPath PC Agent** on the VM makes outbound calls only: it pulls signed, approved packages, re-verifies them, installs them into PC and reports back.
> ⚠️ The GitHub repo is **PUBLIC**. Never commit any Guidewire file, PC jar or copy of the install. Commit only files **you wrote** (the SMCyber overlay, the ProvenPath Gosu plugin, the agent).
> ⚠️ It's Guidewire's VM: check the hackathon terms before installing anything, and **back up `modules/configuration` before the first change**.

## Checklist
- [ ] **D1 09:00–12:00 VM spike ⭐:** OS, JDK 11 present?, how PC starts/stops (`gwb runServer` / `gradlew runServer`), boot and restart times, `http://localhost:8180/pc` login `su`/`gw`, **outbound HTTPS to a test `trycloudflare.com` URL works?**, backup of `modules/configuration` taken. Write it all in `docs/policycenter.md`
- [ ] **D1 10:30–13:30:** hand-build **SMCyber v0** in PC on the VM: `products/SMCyber/SMCyber.xml` + 3 coverage patterns on `GLLine` (Data Breach, Extortion, Business Interruption) with `<CovTerms>` + `AvailabilityScript` (ProductCode == "SMCyber") + display keys. New Submission → SMCyber shows them
- [ ] **D1 14:00–18:00:** copy **your** v0 files into `policycenter/overlay-template/`. `:pcexport` (Proposal → overlay package + `PcManifest`) with a golden test
- [ ] **D1 18:00 CP2:** SMCyber v0 visible in real PC
- [ ] **D1 19:00–23:00:** backend `/pc-agent/next` + `/pc-agent/status`, the `tunnel` compose service, **`:pcagent`** running on the VM: pull → verify → back up → write → restart PC → poll → report
- [ ] **D2 09:30–12:30:** ProductModelAPI SOAP verify → `pc.verified`. **PC-side Gosu gate** (`ProvenPathValidation.gs` + a validation rule) rejects out-of-range SMCyber terms with the rule code
- [ ] **D2 12:30 CP4:** a full deploy lands in real PC via the agent, and the PC-side rejection works
- [ ] **D2 13:30–15:00 stretch:** SubmissionAPI creates a submission → startup manifest-hash check → rate book + rating so it quotes
- [ ] **D2 15:00–17:00:** a known-good pre-deployed PC state as backup, timed restart, `policycenter/README.md`

## Prompt for your coding agent (runs partly on your laptop, partly on the VM — agy works on the VM too)

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan — follow exactly, esp. §0 and §2), team/CHINMAY.md, 02_PRODUCT_MODEL.md, 04_RULES_AND_UNDERWRITING.md, 07_GOSU.md, 08_WORKFLOWS.md, 09_INTEGRATIONS.md, 10_PROVENPATH_MAPPING.md, 11_FILE_REFERENCE.md, backend/contracts (PcManifest, Proposal, Verdict), backend/core gate/GateToken.

CONTEXT: The ONLY PolicyCenter we have is a real Guidewire PolicyCenter 10.2 (Gosu 1.14.26, Gradle build, H2 dev DB, port 8180, context /pc, login su/gw) on a Guidewire-provided cloud VM at C:/GW10/PolicyCenter. No mock, no local PC, no PC in Docker. Our ProvenPath stack (Gosu backend on JDK 11, Next.js, Postgres) runs in Docker Compose on our laptops. The VM has outbound internet; assume NO inbound access to it. So we use a PULL model: an agent on the VM makes outbound HTTPS calls to our backend (exposed via a cloudflared quick tunnel). Gosu syntax only (.gs, uses, var x : T, function, construct(), blocks). NO Python. The GitHub repo is PUBLIC: NEVER copy Guidewire files, jars or the install into the repo; commit only files we author. It is Guidewire's VM: back up modules/configuration before changing anything.

I own TRACK B — real PolicyCenter integration.

1. VM spike → docs/policycenter.md: OS, JDK availability, exact commands to start/stop the PC dev server, boot + restart times, ProductModelAPI WSDL URL (/pc/ws/...), whether outbound HTTPS to a trycloudflare.com URL works, and where the backup of modules/configuration is.

2. SMCyber v0 by hand on the VM (Phase 1 = no new entities): new Product products/SMCyber/SMCyber.xml; 3 new coverage patterns on the existing General Liability line (GLLine): SMCyberDataBreachCov, SMCyberExtortionCov, SMCyberBusinessInterruptionCov, each with <CovTerms> (limit + deductible as money option/direct cov terms, waiting hours for BI), an AvailabilityScript restricting them to ProductCode == "SMCyber", and display keys. Rebuild/restart; confirm New Submission → SMCyber shows the coverages. Copy ONLY the files we authored into policycenter/overlay-template/ (same relative paths as under modules/configuration).

3. backend/pcexport (package provenpath.pcexport, depends ONLY on :contracts): Proposal + PASSED Verdict + approved review → overlay package (zip): the files from overlay-template filled from the clauses (limits, deductibles, waiting hours), display keys, the ProvenPath validation Gosu (item 6), and provenpath-manifest.json (PcManifest: file sha256s, verdictHash, gateToken, reviewId, reviewer, termRanges from the RANGE rules e.g. SMCyberExtortionCov limit max = 50% of aggregate, ruleCode CYB-RNG-002). Golden test: fixtures/proposal_demo_fixed.json → structurally equal to v0.

4. Backend endpoints (in :app, coordinate with Shaurya): POST /api/v1/deployments builds + queues the package ONLY if GateToken is valid AND the review is approved (a BLOCKED verdict must produce NO package); GET /api/v1/pc-agent/next (bearer PC_AGENT_KEY; long-poll ≤30s; returns the next package + manifest or 204); POST /api/v1/pc-agent/status (bearer; {deploymentId, step, detail}) → emitted as pc.pulled / pc.write / pc.restart / pc.ready / pc.verified / pc.failed events. docker-compose `tunnel` service: cloudflare/cloudflared `tunnel --no-autoupdate --url http://backend:8080`; print the public URL in logs.

5. backend/pcagent (package provenpath.pcagent, depends ONLY on :contracts + the GateToken verifier; built as one fat jar runnable with `java -jar` on the VM's JDK 11): reads agent.env (BACKEND_URL, PC_AGENT_KEY, PROVENPATH_GATE_SECRET, PC_HOME, PC_USER, PC_PASSWORD, PC start/stop commands). Loop: long-poll /pc-agent/next → verify HMAC gate token and every file sha256 against the manifest (on mismatch refuse and report pc.failed "tampered package") → back up the current SMCyber files → write the overlay into PC_HOME/modules/configuration → stop PC, start PC → poll http://localhost:8180/pc until up (report elapsed) → call ProductModelAPI (SOAP, raw envelope via java.net.http, auth su/gw) to confirm the SMCyber coverage patterns exist → report pc.verified. Folder fallback: if BACKEND_URL is unreachable, watch C:/provenpath/inbox for dropped package zips and do the same. policycenter/agent/: run-agent.cmd, run-agent.sh, agent.env.example, README with install steps on the VM.

6. PC-side runtime gate: policycenter/overlay-template/.../gsrc/provenpath/pc/ProvenPathValidation.gs + a validation rule on PolicyPeriod (or an IValidationPlugin) in PC: for SMCyber policies, every SMCyber cov term value must be within the manifest termRanges; otherwise reject at TC_DEFAULT with e.g. "ProvenPath CYB-RNG-002: Extortion limit ₹40,00,000 exceeds verified max ₹25,00,000". Must compile with PC's Gosu 1.14.26 and use only PC-available APIs (no extra jars in PC). Document registration steps in policycenter/README.md.

7. Stretch, in order: SubmissionAPI (SOAP) creates an SMCyber submission from the agent; startup check that the installed SMCyber files match manifest sha256s; rate book import + rating for the cyber coverages so the submission quotes.

Rules: branch track-b/*, merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 12:30, 15:00 freeze). Before every merge check the diff has no Guidewire files/jars. No AI co-author lines. Secrets (PC_AGENT_KEY, PROVENPATH_GATE_SECRET, PC credentials, VM credentials) only in .env / agent.env, never committed.
```
