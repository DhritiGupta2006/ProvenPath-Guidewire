# ProvenPath — 2-Day Build Plan (4 people) · Gosu + real PolicyCenter + Next.js + Docker

> **Goal at the end of Day 2:** A PM types *"Cyber insurance for Indian startups, up to ₹50L coverage"* into Mission Control.
> 1. The LLM proposes a config.
> 2. The Gosu rule-graph **blocks** it, naming the rule, the layer and the citation.
> 3. The planner revises the config, and it passes all 5 layers.
> 4. A named reviewer approves it.
> 5. ProvenPath **deploys the SMCyber product into the real Guidewire PolicyCenter 10 on the Guidewire-provided cloud VM**. The backend publishes a signed, approved package. The **ProvenPath PC Agent** on the VM pulls it, re-verifies the signature, writes it into PC's configuration module, restarts PC, and confirms the result via PC's `ProductModelAPI`.
> 6. We open PolicyCenter, start a **New Submission → SMCyber**, and the verified coverages are there.
> 7. We type an over-limit value directly in PolicyCenter, and **ProvenPath's Gosu gate running inside PC rejects it**, citing the rule code.
>
> Metrics show **0% false-pass** on a labelled test corpus, and replay re-verifies the config with an identical hash. **Development runs in Docker on laptops. The demo runs natively on the Guidewire VM, next to PolicyCenter, and GitHub is the only link between the two.**
>
> Sources this plan is built from: PRD v2 · `PROVENPATH_PROJECT_PLAN.md` · `PROVENPATH_DATABASE_ARCHITECTURE.md` · `01_OVERVIEW.md` · `02_PRODUCT_MODEL.md` · `04_RULES_AND_UNDERWRITING.md` · `05_RATING.md` · `07_GOSU.md` · `08_WORKFLOWS.md` · `09_INTEGRATIONS.md` · `10_PROVENPATH_MAPPING.md` · `11_FILE_REFERENCE.md`.

---

## 0. Decisions locked before anyone writes code

| Question | Decision | Why |
|---|---|---|
| Product line | **Cyber Insurance for SMEs** (`SMCyber`) | Every doc already assumes it |
| PolicyCenter | **Real PolicyCenter 10** (10.2.1, `01_OVERVIEW.md`). **No mock.** | We're building the real product |
| Where PC runs | **The Guidewire-provided cloud VM** (AWS EC2, Windows Server 2022, 4 vCPU, 31 GB RAM, about 17 GB free). PolicyCenter **10.2.1.1711**, Gosu **1.14.26**, at `C:\GW10\PolicyCenter`, H2 dev DB. Start: `gwb.bat runServer`, stop: `gwb.bat stopServer`, `http://localhost:8180/pc`, login `su`/`gw`. PC's JDK is Amazon Corretto 11.0.17 (`JAVA_HOME`, **don't change it**). **No Docker on the VM** (Windows Server, non-admin `Student` user, no WSL distro). All facts: `docs/policycenter.md` | Verified by the VM setup report |
| **Where ProvenPath runs** | **Two modes, same code.** **Dev mode:** laptops, `docker compose up` (Postgres + backend + web), fixtures, `git push`. **VM mode (integration + demo):** on the VM, `git pull`, then `vm\start-all.cmd` runs everything **natively as `Student`**: the backend jar with `DB_MODE=embedded` (it starts its **own private PostgreSQL 16 from binaries bundled in the jar**: no install, no admin; verified natively on Windows with Temurin 11.0.32; it never touches PolicyCenter's H2) · backend jar on Temurin 11 · `next start` on Node 20 · the PC agent. **Everything talks over `localhost`** | College Wi-Fi blocks tunnels and port forwarding, and the VM can't run Docker. **GitHub is the only link**, and it works from both sides. No tunnel, no inbound ports, no laptop-to-VM traffic |
| How ProvenPath reaches PC | Same process design, all on localhost. The **ProvenPath PC Agent** (`:pcagent`, a fat jar, Temurin 11 at `C:\Users\Student\AppData\Local\Programs\temurin-11`, run from a console window, not a service) long-polls `http://localhost:8080/api/v1/pc-agent/next`, **verifies the HMAC gate token and every file sha256 itself**, backs up the old files, installs the new ones, stops and starts PC (`gwb.bat stopServer` / `runServer` as child processes with logs), checks `ProductModelAPI` on `localhost:8180`, and posts status back | Keeps the security story: *"PC only accepts signed, reviewer-approved packages, re-verified by a separate process"* |
| Building on the VM | **Gradle wrapper** (`backend/gradlew.bat`) run with `JAVA_HOME` set to Temurin 11 **only inside our scripts** (PC's global `JAVA_HOME` stays Corretto). npm always uses `--registry=https://registry.npmjs.org` (the VM's `.npmrc` points at Guidewire Artifactory). Maven, Gradle, npm, Gemini and GitHub are all reachable from the VM | No Docker needed on the VM |
| No-network fallback | The agent also watches `C:\provenpath\inbox`, and dropping a package zip there works the same way | Also useful for testing the agent alone |
| Demo screen | The **VM desktop**: Mission Control at `localhost:3000` and PolicyCenter at `localhost:8180/pc` side by side in the VM's browser, shown through our usual VM access | Nothing depends on the college network except our access to the VM itself |
| VM-side rules | Only our agent and our overlay files go onto the VM. **A backup of `modules/configuration` already exists** at `C:\ProvenPath-backup\configuration-20260926-1918` (150,717 files, verified). Repo clone: `C:\ProvenPath`. Node 20, gh and Claude Code are installed for the user; logins are manual. **The VM's `.npmrc` points at Guidewire's internal Artifactory**, so pass `--registry=https://registry.npmjs.org` for public packages | It's Guidewire's VM |
| **Licence / public repo** | The GitHub repo is **PUBLIC**. **Never commit Guidewire files, the PC install, PC jars or a PC image.** Commit only files **we author** (our SMCyber overlay, our Gosu plugin). `.gitignore` covers `pc-home/`, `*.jar`, `build/` | Legal. Non-negotiable |
| SMCyber in PC | **Phase 1 (must):** a new **Product** `SMCyber` with **new Cyber coverage patterns on an existing commercial line** (General Liability `GLLine`). This needs no new entities or PCF screens. An `AvailabilityScript` restricts the patterns to `ProductCode == "SMCyber"`. **Phase 2 (stretch):** a dedicated `SMCyberLine` via Advanced Product Designer, if the licence has it | A new line of business needs entities, PCF, line methods and a rating engine, which don't fit in 2 days. New coverage patterns on an existing line is the standard config path (`02_PRODUCT_MODEL.md`) |
| Deploy mechanism | The backend builds an **overlay package** (product XML, coverage-pattern XMLs with `<CovTerms>`, display keys, the ProvenPath validation Gosu, `provenpath-manifest.json`). **The agent on the VM** backs up the current SMCyber files → writes the overlay into `C:\GW10\PolicyCenter\modules\configuration` → stops and restarts the PC dev server → polls `/pc` → confirms via **ProductModelAPI (SOAP)** → reports `pc.*` status | Product-model changes need a rebuild and restart. There is no runtime import |
| Gate inside PC | A Gosu **validation rule / `IValidationPlugin`** in PC (`gsrc/provenpath/pc/`) re-checks SMCyber coverage term values against the signed manifest and rejects out-of-range values with the rule code. **Stretch:** a startup check that refuses SMCyber if the overlay files don't match the manifest hash | This is the `IValidationPlugin` / `IPreUpdateHandler` story from `09_INTEGRATIONS.md`, running in real PC |
| Main backend | **Gosu on JDK 11**, Gradle multi-module (`gradle-gosu-plugin`), standalone, **Gosu 1.18.1** + plugin `org.gosu-lang.gosu` 8.2.1 (what builds on JDK 11; already on `main`) | PC's own language. ⚠️ Code that runs **inside PC** (`ProvenPathValidation.gs`) must target PC's **Gosu 1.14.26** and PC APIs only |
| Java libs (JDK 11) | Javalin 5.6.x (HTTP + SSE) · Jackson · PostgreSQL JDBC + HikariCP · Flyway 9.x · JGraphT · SnakeYAML · `java.net.http` (Gemini + PC SOAP) · JUnit 5 | |
| AI planner | **Gosu** `:planner` (Gemini REST, `temperature=0`, `LLM_MODE=live\|fixture`). If stuck, move it to TypeScript in Next.js, not Python | |
| MCP server | **Next.js** `web/app/api/mcp` with the TypeScript SDK. The tools proxy to the Gosu API | The Java MCP SDK needs Java 17 |
| Python | **None** | |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + React Flow** | |
| DB | ProvenPath: **PostgreSQL 16** (Flyway). PolicyCenter keeps its own H2 dev DB | |
| Compose services (dev mode, laptops) | `db`, `backend`, `web` | On the VM, the same three run natively via `vm\start-all.cmd`, plus the agent |
| Config | Everything comes from env vars (`DB_URL`, `PROVENPATH_RULES_DIR`, `GEMINI_API_KEY`, `PROVENPATH_GATE_SECRET`, `PC_AGENT_KEY`, `NEXT_PUBLIC_API_URL`, …). Nothing assumes Docker hostnames: the defaults are `localhost` | So one build runs in both modes |

### ⚠️ PRD contradiction: all-or-nothing vs. "remaining clauses flow through"

We keep invariant 4:

1. **Run #1 is BLOCKED.** Nothing reaches PC.
2. **Run #2 passes**, gets approved, and deploys to PC.

### ⚠️ Top risks, owned from hour 1

| Risk | Owner | Mitigation |
|---|---|---|
| PC boot/restart time is unknown (PC is currently stopped) | Chinmay | First hour of Day 1: `gwb.bat runServer`, then time the boot and one stop/start. If it's too slow for the live demo, keep a pre-deployed PC as backup |
| Stack doesn't run natively on the VM (embedded Postgres, Gradle wrapper, npm registry) | Chinmay | Dry run **by D1 18:00** with the Track A code already on `main`: portable Postgres up, `gradlew.bat test` green on the VM, `next build` works. Embedded Postgres (`DB_MODE=embedded`) was already verified natively on Windows as a non-admin user; if it still fails on the VM, the fallback is an H2 file DB for VM mode only (SQL port needed) |
| VM session ends and kills the console processes | Chinmay | Disconnect the RDP/remote session instead of signing out; `start-all.cmd` is idempotent, so just re-run it |
| One VM, four people | Everyone | Only Chinmay (plus agy on the VM) changes PC. Everyone else uses PC only through ProvenPath. Back up `modules/configuration` before the first deploy |
| PC restart takes minutes, which is awkward live | Chinmay | Demo: approve → deploy starts the restart → talk through metrics and replay (about 2 min) → open PC. Keep a pre-deployed PC as the backup |
| New cyber coverages break quoting (no rating) | Chinmay | Phase 1 demo stops at "coverages visible + PC-side gate rejects an over-limit value". Rating the cyber coverages (rate book import + GL rating extension) is stretch |
| Standalone Gosu tooling | Shaurya | Handled early: agy is already building Track A in Gosu (branch `track-a/core`) |
| Guidewire files leak to the public repo | Everyone | `.gitignore` + review every PR diff for `modules/`, `.jar`, Guidewire headers |

---

## 1. Team tracks

**Per-person briefs (prompts + checklists):** `team/SHAURYA.md` · `team/CHINMAY.md` · `team/DHRITI.md` · `team/VAISHNAVI.md`

| Track | Owner | Owns |
|---|---|---|
| **A — Verification Core + Backend App (Gosu)**, tech lead | **Shaurya** | `:contracts`, `:core` (engine, 5 layers + grounding, gate, token), `:eval`; **`:app`** (Javalin API, Flyway DB, append-only event log, SSE, review workflow, replay, provenance, metrics) |
| **B — Real PolicyCenter Integration (Gosu)** | **Chinmay** (works on the Guidewire cloud VM) | PC on the VM (setup already done), hand-built SMCyber v0 in PC, `:pcexport` (Proposal → overlay package + signed manifest), backend `pc-agent` endpoints, **`:pcagent` on the VM** (pull → verify → install → restart → ProductModelAPI verify → report), PC-side Gosu validation gate, SubmissionAPI, docker-compose (dev) and **`vm\` native run scripts** (portable Postgres, Gradle wrapper, `start-all.cmd` / `stop-all.cmd`) |
| **C — AI Layer & Rule Content** | **Dhriti** | `rules/` (23 rules + sources), `:planner` (Gemini, repair loop), `shared/tools`, Next.js MCP route, eval corpus |
| **D — Mission Control (Next.js)** + pitch deck | **Vaishnavi** | `web/`: live trace, DAG, tools, blocked card, reviewer, **PC deploy progress + "Open in PolicyCenter"**, provenance, metrics, replay, tamper |

> ⚠️ PolicyCenter exists **only on the Guidewire cloud VM**. Chinmay needs VM access from hour 1. Whoever holds the VM credentials shares them **privately**, not in the group chat.

---

## 2. Architecture and repo layout

```
LAPTOPS (dev mode)                     GitHub               GUIDEWIRE CLOUD VM (VM mode = integration + demo, all native, all localhost)
docker compose up --build   ── git push ──► main ── git pull ──►  vm\start-all.cmd
 ├─ db       postgres:16                                          ├─ (embedded PostgreSQL 16 inside the backend jar, :5433)
 ├─ backend  Gosu/JDK11  :8080                                    ├─ backend jar (Temurin 11)       :8080 ◄─┐ long-poll
 └─ web      Next.js     :3000                                    ├─ web  (next start, Node 20)     :3000   │
  (fixtures, no PC)                                               ├─ pcagent (Temurin 11) ──────────────────┘
                                                                  │   1 verify HMAC gate token + file sha256s
                                                                  │   2 back up + write overlay → C:\GW10\PolicyCenter\modules\configuration
                                                                  │   3 gwb.bat stopServer → runServer → poll /pc
                                                                  │   4 ProductModelAPI SOAP → POST status → SSE → UI
                                                                  └─ PolicyCenter 10 (as provided)  :8180/pc  + our ProvenPathValidation gate
```

```
backend/                       Gradle multi-module, Gosu, JDK 11
  contracts/   provenpath.contracts.*     Proposal, Clause, Citation, NodeResult, Verdict, Event, ports
  core/        provenpath.core.{engine,layers,gate}.*
  eval/        provenpath.eval.RunEval
  planner/     provenpath.planner.*       ← depends ONLY on :contracts
  pcexport/    provenpath.pcexport.*      Proposal + Verdict + Review → PC overlay files + signed manifest  ← only :contracts
  pcagent/     provenpath.pcagent.*       runs ON THE VM: pull → verify → install → restart PC → ProductModelAPI/SubmissionAPI SOAP → report  ← only :contracts + GateToken verifier
  app/         provenpath.app.*           Javalin API, db (JDBC+Flyway), events, services, pc-agent endpoints, wiring
policycenter/                  OUR files only (safe for a public repo)
  agent/                       run-agent.cmd / run-agent.sh, agent.env.example, install notes for the VM
  overlay-template/            hand-built SMCyber v0 (product XML, coverage patterns, display keys) → template for :pcexport
  plugin/gsrc/provenpath/pc/   ProvenPathValidation.gs (PC-side gate) + registration notes
  README.md                    exact steps to install the overlay + plugin into a PC 10 install
shared/tools/*.json  rules/  eval/corpus/  fixtures/  docs/events.md  docs/policycenter.md
web/                           Next.js
team/                          per-person briefs
```

**The boundary is enforced by the compiler.** `:planner` and `:pcexport` depend only on `:contracts`, so LLM code cannot reach the verdict code (*"the LLM code cannot even see the verdict code"*).

**Three gates, three places:**
1. **Pre-commit gate** (ProvenPath backend). A package is only *published* to the agent queue if the gate token is valid **and** there's an approved review. `BLOCKED` means no package exists, so zero files reach PC.
2. **Signed manifest, re-verified on the VM.** Every package includes `provenpath-manifest.json`: file sha256s, `verdictHash`, `gateToken`, review id and reviewer, plus the verified ranges per coverage term. **The agent re-checks the HMAC and every sha256 before touching PC.** A tampered package is refused and reported as `pc.failed`.
3. **Runtime gate inside PolicyCenter.** `ProvenPathValidation.gs` (a validation rule on `PolicyPeriod` at `TC_DEFAULT`/`TC_BIND`, or an `IValidationPlugin`) reads the manifest and rejects SMCyber coverage terms outside the verified range with the rule code. Demo line: *"even a human typing directly in PolicyCenter can't get past it."*

**Tamper demo:** a proposal with `"compliant": true` and a real source id but fabricated text is blocked at the SOURCE layer (sha256 mismatch).

---

## 3. Shared contracts (frozen at Checkpoint 0; changes need a PR plus a ping to the whole team)

**`backend/contracts`** (owner: Shaurya):

```
Citation    { sourceCode, section, textSnippet }
Clause      { clauseId, kind: COVERAGE|EXCLUSION|RATING, patternCode, name, category, owningEntityType,
              existence, limitMaxInr, deductibleInr, waitingHours, conditions[], factors{},
              excludesPatternCodes[], citations[] }
Proposal    { proposalId, executionId, iteration, line:"SMCyber", aggregateLimitInr, turnoverInr,
              minimumPremiumInr, targetEffectiveDate, jurisdiction:"IN", clauses[], proseSummary, llmMeta{} }
NodeResult  { ruleCode, clauseId, layer: TYPE|RANGE|CONSISTENCY|RULE_MATCH|SOURCE|GROUNDING,
              result: PASSED|FAILED|SKIPPED|NEEDS_REVIEW, expected, actual, reason, sourceCode }
Verdict     { runId, status: PASSED|BLOCKED, nodes[], rulesetHash, proposalHash, verdictHash, gateToken? }
Event       { executionId, seq, ts, type, payload }
PcManifest  { productCode, files[{path, sha256}], verdictHash, gateToken, reviewId, reviewer,
              termRanges[{patternCode, termCode, min, max, ruleCode}], generatedAt }
```

- `NEEDS_REVIEW` and `FAILED` both block.
- `owningEntityType` for Phase 1 = `GLLine`. Pattern codes stay `SMCyber*Cov`.
- TypeScript mirror: `web/lib/contracts.ts` (Vaishnavi).

**SSE event types** (`docs/events.md`): `run.started` · `planner.step` · `tool.called` · `tool.result` · `proposal.created` · `verify.started` · `verify.node` · `gate.blocked` · `gate.passed` · `planner.repair` · `review.requested` · `review.decided` · `pc.export` · `pc.queued` · `pc.pulled` · `pc.write` · `pc.restart` · `pc.ready` · `pc.verified` · `pc.failed` · `run.completed`

**REST API** (Gosu backend `:8080`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/executions` `{prompt}` | Start a run |
| GET | `/api/v1/executions/{id}` · `/stream` (SSE) | State + live events (history from seq 0) |
| POST | `/api/v1/tools/{name}` | The 4 tools (for MCP) |
| POST | `/api/v1/verify` | Verify a raw proposal (tamper button) |
| POST | `/api/v1/reviews` | Approve/reject |
| POST | `/api/v1/deployments` `{executionId}` | Build + queue the package (token + approval enforced) |
| GET | `/api/v1/deployments/{id}` · `/package` | Status + overlay zip + manifest |
| GET | `/api/v1/pc-agent/next` (bearer `PC_AGENT_KEY`) | Agent long-poll: returns the next queued package or 204 |
| POST | `/api/v1/pc-agent/status` (bearer) | Agent reports `pc.pulled/write/restart/ready/verified/failed` → emitted as SSE |
| POST | `/api/v1/executions/{id}/replay` | Re-verify → hash match |
| GET | `/api/v1/provenance/{clauseId}` · `/metrics` · `/rules` | |

**Rule YAML:** see `rules/README.md` (format from plan v1). `value_ref` grammar is `<path> [* <number>]`, with no eval anywhere.

---

## 4. ProvenPath DB: 8 tables (`V1__init.sql`)

`pp_regulatory_source` (+`text_sha256`) · `pp_rule` (`depends_on` array) · `pp_proposal` (clauses JSONB, `execution_id`, `iteration`) · `pp_verification_run` (+ hashes) · `pp_verification_node` · `pp_compliance_review` · `pp_deployment` (+ `manifest` JSONB, `pc_status`, `pc_verified_at`) · `pp_event_log` (append-only; a trigger rejects UPDATE/DELETE).

Seed users: *"A. Mehta — Compliance Reviewer"*, *"PM Demo"*. The dropped tables from the 16-table doc are roadmap items.

---

## 5. The rule set: 23 IRDAI-style curated rules

These are curated parameters, not legal advice. The only real anchor is the CERT-In 6-hour reporting direction (2022).

| Layer | Rules | Checks |
|---|---|---|
| TYPE (3) | CYB-TYPE-001..003 | Money fields in INR · `^SMCyber[A-Za-z]+Cov$` · existence enum · owning entity · category |
| RANGE (7) | CYB-RNG-001..007 | Aggregate ₹5L–₹5Cr · extortion ≤ 50% of aggregate · deductible 1–10% · BI waiting period 8–72h · turnover ≤ ₹250Cr · factors 0.5–3.0 · minimum premium |
| CONSISTENCY (4) | CYB-CON-001..004 | Σ first-party ≤ aggregate · deductible < limit · no exclusion nullifies a Required coverage · no duplicates |
| RULE-MATCH (5) | CYB-RM-001..005 | Mandatory coverages · mandatory exclusions · ransom → law-enforcement notification · fines only "where insurable" · CERT-In 6h |
| SOURCE (3) | CYB-SRC-001..003 | Citation present · snippet byte-exact with sha256 · source active + IN |
| GROUNDING (1) | CYB-GRD-001 | Every number in the prose matches a verified value |

**Demo trigger:** a ₹40L extortion sublimit on a ₹50L aggregate fails **CYB-RNG-002**, CYB-CON-001 is SKIPPED, and the gate reports BLOCKED. The repair proposes ₹20L and passes. The RANGE rules also become `termRanges` in the PC manifest, so the same limits are enforced inside PC.

---

## 6. Hour-by-hour plan

### Day 1

| Time | 🅰 Shaurya: Core + App | 🅱 Chinmay: Real PolicyCenter | 🅲 Dhriti: AI + Rules | 🅳 Vaishnavi: Next.js |
|---|---|---|---|---|
| **09:00–10:30** | Review/merge agy's Track A output (contracts, core, rules seed, fixtures). Freeze contracts. Push `main` | **PC on the VM ⭐** (setup, backup and tools are already done; see `docs/policycenter.md`): `gwb.bat runServer`, time the boot and one stop/start, log in `su`/`gw`, open New Submission. Fill the TODOs in `docs/policycenter.md`. Add the **Gradle wrapper** and start `vm` scripts: download the portable PostgreSQL 16 zip to `C:ProvenPath-toolspgsql` (outside the repo), `initdb`, `pg_ctl start` | Review rules seed + `sources.yaml`, tighten wording, make citations exact | `create-next-app`, Dockerfile, layout, `lib/contracts.ts` |
| **10:30** | **CP0: contracts + skeleton on `main`; `docker compose up --build` runs db + backend + web** | | | |
| **10:30–13:30** | `:app`: Javalin, Flyway `V1__init.sql` + append-only trigger, DAO, seed loader | **Hand-build SMCyber v0 in real PC:** `products/SMCyber/SMCyber.xml`, 3 coverage patterns on `GLLine` (Data Breach, Extortion, Business Interruption) with `<CovTerms>` (limit/deductible `OptionCovTermPattern` / `DirectCovTermPattern`, money), `AvailabilityScript` on product code, display keys. Rebuild → New Submission → SMCyber shows the coverages | `shared/tools/*.json`; start `:planner` GeminiClient | `useExecutionStream` + dev SSE replay of `fixtures/events_demo_run.jsonl` |
| **13:30** | **CP1: each track runs on its own. PC is up on the VM with a measured restart time; the backend jar runs on the VM with `DB_MODE=embedded`.** | | | |
| **14:00–18:00** | Event bus → `pp_event_log` → SSE (subscribe-then-replay); `POST /executions`, `/verify`, `/rules`, `/tools/{name}`, `/reviews`; wire `:core` into `VerifyService` (emit `verify.node` in topological order) | Copy **our** v0 files into `policycenter/overlay-template/` (only files we wrote). `:pcexport`: Proposal → overlay files from the template + `PcManifest` (sha256s, termRanges from the RANGE rules). Golden test: fixed fixture → the same structure as v0 | `:planner`: tool loop → `Proposal`, `planner.*`/`tool.*` events, `FixturePlanner` | React Flow DAG from `/rules`, live colors, trace, tools panel |
| **18:00** | **CP2 ⭐ walking skeleton:** fixture run → Gosu gate → SSE → UI graph turns red on RNG-002. **And SMCyber v0 is visible in real PC, and `vmstart-all.cmd` runs the Track A backend natively on the VM.** Merge everything. | | | |
| **19:00–23:00** | Review workflow state machine; `/replay`, `/provenance`, `/metrics`; `planner` wiring via `VerifyPort`/`EventPort` | Backend `/pc-agent/next` + `/pc-agent/status`. **`:pcagent`** (fat jar), **built and tested on the laptop**: `PC_HOME` points at a local test folder and `PC_STOP_CMD`/`PC_START_CMD`/`PC_URL` come from config, so the whole pull → verify → back up → write → restart → report loop runs without PC. On the VM those same settings point at the real `gwb.bat` and `localhost:8180` | Live Gemini path, validation → retry → fixture; RAG-lite; **MCP route** in `web/` | Blocked card, reviewer panel, switch to the real backend |
| **23:00** | **CP3 (on laptops): live LLM → BLOCKED → (manual fixed proposal) → approve → package queued → agent pulls, verifies and writes into its test folder. Stop by 23:30.** | | | |

### Day 2: finish on laptops → final merge and connection on the VM → full testing

> **Working model:** we build and finish the app on our own PCs (Docker, fixtures, agent test folder). The **VM is only for the final merge, the real PC connection and full testing**, driven by **Claude Code in the VM terminal** using `team/VM_INTEGRATION.md`. Everyone keeps fixing bugs on laptops and pushing to `main`; the VM just runs `git pull`.

| Time | 🅰 Shaurya | 🅱 Chinmay | 🅲 Dhriti | 🅳 Vaishnavi |
|---|---|---|---|---|
| **09:00–09:30** | **Standup: CP3 breakage triage** | | | |
| **09:30–11:30** | `RunEval` → `metrics.json`, **false-pass = 0**, determinism ×50; grounding hardening; tamper test | `ProvenPathValidation.gs` (PC-side gate, **Gosu 1.14.26**, PC APIs only) + a validation rule in the overlay; `ProductModelAPI` SOAP client in the agent; `vm\start-all.cmd` / `stop-all.cmd` finished | Corpus ≥40 items to Shaurya by 10:30; repair loop; demo prompt tuning | Deploy panel (pc.* stepper, manifest viewer, "Open in PolicyCenter"), provenance, metrics, replay, tamper, disclaimer |
| **11:30** | **CP4a: laptop-complete.** Everything merged to `main`. The full flow runs in Docker on a laptop, with the agent writing into its test folder. **Tag `v0.9-laptop`.** | | | |
| **11:30–14:00** | On call: fix backend bugs, push, VM pulls | **VM integration** with Claude Code (`team/VM_INTEGRATION.md`): pull → build → portable Postgres → `start-all` → agent pointed at real PC → first real deploy → SMCyber in New Submission → PC-side rejection | On call: planner/LLM issues on the VM (Gemini key, network) | On call: UI issues on the VM browser; start the pitch deck |
| **14:00** | **CP4: the full path lands in real PC, from the VM.** Request → BLOCKED → repair → PASSED → approve → deploy → PC restart → SMCyber in New Submission → an over-limit value typed in PC is rejected. Anything not working now gets cut (§8). | | | |
| **14:00–16:00** | **Full testing on the VM:** demo script ×3 (live + fixture mode), tamper, replay hash, metrics check; log bugs; fix on laptops → push → pull | Time the deploy/restart; **pre-deploy a known-good state** as backup; stretch only if green (SubmissionAPI → startup hash check → rating) | Record the fixture from a good live run **on the VM** | Pitch deck (6 slides) |
| **16:00** | **CP5: feature + code freeze on the VM. Tag `v1.0-demo`.** | | | |
| **16:00–17:00** | **Record the backup video from the VM screen (Mission Control + PC side by side).** | | | |
| **17:00–19:00** | **3 timed rehearsals on the VM.** | | | |

---|---|---|---|---|
| **09:00–09:30** | **Standup: CP3 breakage triage** | | | |
| **09:30–12:30** | `RunEval` → `metrics.json`, **false-pass = 0**, determinism ×50; help Chinmay with `:pcexport` term mapping | **ProductModelAPI SOAP check** after restart (the SMCyber patterns exist → `pc.verified`). **PC-side gate:** `ProvenPathValidation.gs` in PC `gsrc` + a validation rule on PolicyPeriod: SMCyber cov term outside the manifest `termRanges` → reject at `TC_DEFAULT` with `"CYB-RNG-002: ..."` | Corpus ≥40 items to Shaurya by 11:00; repair loop | **PC deploy panel:** export → write → restart progress → ready → verified; file list + manifest viewer; **"Open in PolicyCenter"** button; provenance drawer; metrics |
| **12:30** | **CP4: the full path lands in real PC. Request → BLOCKED → repair → PASSED → approve → deploy → PC restart → SMCyber in New Submission → an over-limit value typed in PC is rejected by the Gosu gate.** Anything not working now gets cut (§8). | | | |
| **13:30–15:00** | Grounding hardening, tamper test, 100% provenance | Stretch, in order: (a) `SubmissionAPI` SOAP creates an SMCyber submission from ProvenPath, (b) startup manifest-hash check, (c) rate book import + rating for the cyber coverages so it quotes | Tune the demo prompt; record the fixture from a good live run | Replay (3× + "Re-verify → identical hash"), Tamper button, before/after slider, disclaimer footer |
| **15:00** | **CP5: feature freeze.** | | | |
| **15:00–17:00** | Bug bash ×3 (live + fixture) | **Pre-deployed backup PC** (a snapshot of a good state); time the restart; `policycenter/README.md` | README | Pitch deck (6 slides) |
| **17:00–18:00** | **Record the backup video, including PC. Code freeze + tag `v1.0-demo`.** | | | |
| **18:00–20:00** | **3 timed rehearsals.** | | | |

---

## 7. Definition of done

- **A:** 23 rules, all 6 checks tested, blocked/fixed fixtures behave correctly, false-pass = 0 with the denominator, 50/50 identical hashes. The API, SSE with full history, append-only log, review and replay all work.
- **B:** SMCyber shows up in **real** PC's New Submission after a ProvenPath deploy. `ProductModelAPI` confirms it. BLOCKED writes 0 files. An over-limit value in the PC UI is rejected with the rule code. The repo contains **zero Guidewire files**.
- **C:** The live planner produces a valid proposal, repair reaches PASSED in ≤2 iterations, fixture mode works offline, the MCP tools work in Inspector, and the corpus has ≥40 items.
- **D:** The whole demo is driven from the browser plus the PC tab. Deploy progress is live, metrics show denominators, and replay and tamper work.

## 8. Cut list (from the top, at CP4a / CP4)

1. RAG-lite.
2. Replay animation (keep the hash re-verify).
3. MCP route (use a slide).
4. Stretch B items (SubmissionAPI, startup hash check, rating).
5. Embedded Postgres fails on the VM → an H2 file DB for VM mode only (needs a SQL port; last resort).
6. Live PC restart during the demo → pre-deployed PC plus a recorded deploy clip.
7. Gosu planner → TypeScript planner in Next.js.

**Never cut:** the Gosu gate · the live BLOCKED moment · the reviewer gate · SMCyber visible in real PC · the PC-side rejection · false-pass = 0 · "not a legal opinion".

## 9. Working rules

- **Git:** branch per track, merge to `main` at checkpoints, and `main` always runs. No AI co-author lines. **Every PR diff is checked for Guidewire files before merge.**
- **Build against fixtures first.** Nobody waits.
- **Gosu is not Java:** `.gs`, `uses`, `var x : T`, `function`, `construct()`, blocks `\ x -> ...`. See `07_GOSU.md`.
- **Secrets** go in `.env` only (`GEMINI_API_KEY`, `PROVENPATH_GATE_SECRET`, `PC_AGENT_KEY`; VM-side `agent.env`: `PC_HOME`, `PC_USER`/`PC_PASSWORD`, `BACKEND_URL`).
- **Standups** at checkpoints, 15 minutes. **Sleep** by 23:30 on Day 1.

### Gotcha questions to rehearse

| Judge asks | Show |
|---|---|
| "What if the AI hallucinates compliance?" | Tamper → SOURCE block. Module graph: `:planner` can't compile against `:core` |
| "Is this really PolicyCenter?" | Open PC, New Submission → SMCyber, show the generated coverage-pattern XML + manifest |
| "What if someone edits PC directly?" | Type an over-limit value in PC → the Gosu gate inside PC rejects it with the rule code |
| "Is this scripted?" | Replay → identical hash. Type a fresh prompt |
| "Why Gosu?" | The same language runs inside PolicyCenter. Our gate *is* a PC plugin |
| "Only 23 rules / only GL line?" | Deliberate scope. Roadmap: a dedicated `SMCyberLine` via APD, real IRDAI ingestion |
| "Legal sign-off?" | No. It's a rule-graph verdict plus a named reviewer. The footer says so |

### Demo beat owners

| Beat | Presenter |
|---|---|
| Hook, close, "why Gosu" | Shaurya |
| Live request | Dhriti |
| Verification moment + tamper | Shaurya |
| Reviewer + deploy into PC + PC-side rejection | Chinmay |
| Metrics, before/after, replay | Vaishnavi |
