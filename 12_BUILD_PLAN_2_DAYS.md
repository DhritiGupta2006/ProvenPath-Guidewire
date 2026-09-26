# ProvenPath — 2-Day Build Plan (4 people) · Gosu + real PolicyCenter + Next.js + Docker

> **Goal at the end of Day 2:** A PM types *"Cyber insurance for Indian startups, up to ₹50L coverage"* into Mission Control.
> 1. The LLM proposes a config.
> 2. The Gosu rule-graph **blocks** it, naming the rule, the layer and the citation.
> 3. The planner revises the config, and it passes all 5 layers.
> 4. A named reviewer approves it.
> 5. ProvenPath **deploys the SMCyber product into a real Guidewire PolicyCenter 10**: it generates product-model files, writes them into the PC configuration module, restarts PC, and confirms the result via PC's `ProductModelAPI`.
> 6. We open PolicyCenter, start a **New Submission → SMCyber**, and the verified coverages are there.
> 7. We type an over-limit value directly in PolicyCenter, and **ProvenPath's Gosu gate running inside PC rejects it**, citing the rule code.
>
> Metrics show **0% false-pass** on a labelled test corpus, and replay re-verifies the config with an identical hash. Everything runs through Docker.
>
> Sources this plan is built from: PRD v2 · `PROVENPATH_PROJECT_PLAN.md` · `PROVENPATH_DATABASE_ARCHITECTURE.md` · `01_OVERVIEW.md` · `02_PRODUCT_MODEL.md` · `04_RULES_AND_UNDERWRITING.md` · `05_RATING.md` · `07_GOSU.md` · `08_WORKFLOWS.md` · `09_INTEGRATIONS.md` · `10_PROVENPATH_MAPPING.md` · `11_FILE_REFERENCE.md`.

---

## 0. Decisions locked before anyone writes code

| Question | Decision | Why |
|---|---|---|
| Product line | **Cyber Insurance for SMEs** (`SMCyber`) | Every doc already assumes it |
| PolicyCenter | **Real PolicyCenter 10** (10.2.1, `01_OVERVIEW.md`). **No mock.** | We're building the real product |
| PC install | A teammate's **licensed local install** (`C:\GW10\PolicyCenter`), H2 dev DB, `gwb runServer` / `gradlew runServer`, port **8180**, context `/pc`, login `su`/`gw` | Matches the docs |
| PC in Docker | `policycenter` compose service (`eclipse-temurin:11-jdk`). The install is **bind-mounted** from `${PC_HOME}` and **never copied into an image**. Compose profile `pc` | "Everything via Docker" without breaking the Guidewire licence |
| If PC won't run in Docker | Run PC **natively** on the teammate's machine; ProvenPath talks to `host.docker.internal:8180`. This is still real PC, not a mock | Guidewire doesn't officially support PC dev in Docker |
| **Licence / public repo** | The GitHub repo is **PUBLIC**. **Never commit Guidewire files, the PC install, PC jars or a PC image.** Commit only files **we author** (our SMCyber overlay, our Gosu plugin). `.gitignore` covers `pc-home/`, `*.jar`, `build/` | Legal. Non-negotiable |
| SMCyber in PC | **Phase 1 (must):** a new **Product** `SMCyber` with **new Cyber coverage patterns on an existing commercial line** (General Liability `GLLine`). This needs no new entities or PCF screens. An `AvailabilityScript` restricts the patterns to `ProductCode == "SMCyber"`. **Phase 2 (stretch):** a dedicated `SMCyberLine` via Advanced Product Designer, if the licence has it | A new line of business needs entities, PCF, line methods and a rating engine, which don't fit in 2 days. New coverage patterns on an existing line is the standard config path (`02_PRODUCT_MODEL.md`) |
| Deploy mechanism | ProvenPath writes an **overlay** (product XML, coverage-pattern XMLs with `<CovTerms>`, display keys, `provenpath-manifest.json`) into `${PC_HOME}/modules/configuration` → triggers a PC restart → polls `/pc` → confirms via **ProductModelAPI (SOAP)** | Product-model changes need a rebuild and restart. There is no runtime import |
| Gate inside PC | A Gosu **validation rule / `IValidationPlugin`** in PC (`gsrc/provenpath/pc/`) re-checks SMCyber coverage term values against the signed manifest and rejects out-of-range values with the rule code. **Stretch:** a startup check that refuses SMCyber if the overlay files don't match the manifest hash | This is the `IValidationPlugin` / `IPreUpdateHandler` story from `09_INTEGRATIONS.md`, running in real PC |
| Main backend | **Gosu on JDK 11**, Gradle multi-module (`gradle-gosu-plugin`), standalone, Gosu **1.14.x** (same as PC 10's 1.14.26). If that fails, 1.18.x | PC's own language. Core classes stay compatible with PC's Gosu |
| Java libs (JDK 11) | Javalin 5.6.x (HTTP + SSE) · Jackson · PostgreSQL JDBC + HikariCP · Flyway 9.x · JGraphT · SnakeYAML · `java.net.http` (Gemini + PC SOAP) · JUnit 5 | |
| AI planner | **Gosu** `:planner` (Gemini REST, `temperature=0`, `LLM_MODE=live\|fixture`). If stuck, move it to TypeScript in Next.js, not Python | |
| MCP server | **Next.js** `web/app/api/mcp` with the TypeScript SDK. The tools proxy to the Gosu API | The Java MCP SDK needs Java 17 |
| Python | **None** | |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + React Flow** | |
| DB | ProvenPath: **PostgreSQL 16** (Flyway). PolicyCenter keeps its own H2 dev DB | |
| Compose services | `db`, `backend`, `web`, `policycenter` (profile `pc`) | Teammates without a PC install can run everything except `policycenter` |

### ⚠️ PRD contradiction: all-or-nothing vs. "remaining clauses flow through"

We keep invariant 4:

1. **Run #1 is BLOCKED.** Nothing reaches PC.
2. **Run #2 passes**, gets approved, and deploys to PC.

### ⚠️ Top risks, owned from hour 1

| Risk | Owner | Mitigation |
|---|---|---|
| PC doesn't boot in Docker | Chinmay | Spike by 12:00 Day 1. Otherwise run PC natively + `host.docker.internal` |
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
| **B — Real PolicyCenter Integration (Gosu)** | **Chinmay** *(or whoever has the PC install)* | PC in Docker/native, hand-built SMCyber v0 in PC, `:pcexport` (Proposal → PC overlay + signed manifest), `:pcdeploy` (write → restart → ProductModelAPI verify), PC-side Gosu validation gate, SubmissionAPI, docker-compose |
| **C — AI Layer & Rule Content** | **Dhriti** | `rules/` (22 rules + sources), `:planner` (Gemini, repair loop), `shared/tools`, Next.js MCP route, eval corpus |
| **D — Mission Control (Next.js)** + pitch deck | **Vaishnavi** | `web/`: live trace, DAG, tools, blocked card, reviewer, **PC deploy progress + "Open in PolicyCenter"**, provenance, metrics, replay, tamper |

> ⚠️ **Whoever has the licensed PolicyCenter 10 install owns Track B.** If that's not Chinmay, swap tracks.

---

## 2. Architecture and repo layout

```
docker compose --profile pc up --build
 ├─ db            postgres:16                                        :5432
 ├─ backend       Gosu/JDK11 (:app :core :planner :pcexport :pcdeploy) :8080
 ├─ web           Next.js (Mission Control + /api/mcp)               :3000
 └─ policycenter  temurin:11 + bind-mounted licensed PC install      :8180/pc   (profile "pc")
                  ▲ backend writes the overlay into ${PC_HOME}/modules/configuration (bind mount)
                  ▲ restart trigger → PC rebuilds, restarts → backend polls, then ProductModelAPI SOAP check
```

```
backend/                       Gradle multi-module, Gosu, JDK 11
  contracts/   provenpath.contracts.*     Proposal, Clause, Citation, NodeResult, Verdict, Event, ports
  core/        provenpath.core.{engine,layers,gate}.*
  eval/        provenpath.eval.RunEval
  planner/     provenpath.planner.*       ← depends ONLY on :contracts
  pcexport/    provenpath.pcexport.*      Proposal + Verdict + Review → PC overlay files + signed manifest  ← only :contracts
  pcdeploy/    provenpath.pcdeploy.*      write overlay, restart PC, poll, ProductModelAPI/SubmissionAPI SOAP
  app/         provenpath.app.*           Javalin API, db (JDBC+Flyway), events, services, wiring
policycenter/                  OUR files only (safe for a public repo)
  Dockerfile  entrypoint.sh    (temurin:11, runs gwb runServer from /opt/pc; restart loop on /opt/pc-trigger/restart)
  overlay-template/            hand-built SMCyber v0 (product XML, coverage patterns, display keys) → template for :pcexport
  plugin/gsrc/provenpath/pc/   ProvenPathValidation.gs (PC-side gate) + registration notes
  README.md                    exact steps to install the overlay + plugin into a PC 10 install
shared/tools/*.json  rules/  eval/corpus/  fixtures/  docs/events.md  docs/policycenter.md
web/                           Next.js
team/                          per-person briefs
```

**The boundary is enforced by the compiler.** `:planner` and `:pcexport` depend only on `:contracts`, so LLM code cannot reach the verdict code (*"the LLM code cannot even see the verdict code"*).

**Three gates, three places:**
1. **Pre-commit gate** (ProvenPath backend). `:pcdeploy` refuses to write anything to PC unless the gate token is valid **and** there's an approved review. `BLOCKED` means zero files are written to PC.
2. **Signed manifest.** Every deployed overlay includes `provenpath-manifest.json`: file sha256s, `verdictHash`, `gateToken`, review id and reviewer, plus the verified ranges per coverage term.
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

**SSE event types** (`docs/events.md`): `run.started` · `planner.step` · `tool.called` · `tool.result` · `proposal.created` · `verify.started` · `verify.node` · `gate.blocked` · `gate.passed` · `planner.repair` · `review.requested` · `review.decided` · `pc.export` · `pc.write` · `pc.restart` · `pc.ready` · `pc.verified` · `pc.failed` · `run.completed`

**REST API** (Gosu backend `:8080`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/executions` `{prompt}` | Start a run |
| GET | `/api/v1/executions/{id}` · `/stream` (SSE) | State + live events (history from seq 0) |
| POST | `/api/v1/tools/{name}` | The 4 tools (for MCP) |
| POST | `/api/v1/verify` | Verify a raw proposal (tamper button) |
| POST | `/api/v1/reviews` | Approve/reject |
| POST | `/api/v1/deployments` `{executionId}` | Deploy to PC (token + approval enforced) |
| GET | `/api/v1/deployments/{id}` · `/package` | Status + overlay zip + manifest |
| POST | `/api/v1/executions/{id}/replay` | Re-verify → hash match |
| GET | `/api/v1/provenance/{clauseId}` · `/metrics` · `/rules` | |

**Rule YAML:** see `rules/README.md` (format from plan v1). `value_ref` grammar is `<path> [* <number>]`, with no eval anywhere.

---

## 4. ProvenPath DB: 8 tables (`V1__init.sql`)

`pp_regulatory_source` (+`text_sha256`) · `pp_rule` (`depends_on` array) · `pp_proposal` (clauses JSONB, `execution_id`, `iteration`) · `pp_verification_run` (+ hashes) · `pp_verification_node` · `pp_compliance_review` · `pp_deployment` (+ `manifest` JSONB, `pc_status`, `pc_verified_at`) · `pp_event_log` (append-only; a trigger rejects UPDATE/DELETE).

Seed users: *"A. Mehta — Compliance Reviewer"*, *"PM Demo"*. The dropped tables from the 16-table doc are roadmap items.

---

## 5. The rule set: 22 IRDAI-style curated rules

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
| **09:00–10:30** | Review/merge agy's Track A output (contracts, core, rules seed, fixtures). Freeze contracts. Push `main` | **PC boot spike ⭐:** start the licensed PC 10 natively, then in Docker (`policycenter/Dockerfile`, bind-mount `${PC_HOME}`). Note boot and restart times. Write `docs/policycenter.md` | Review rules seed + `sources.yaml`, tighten wording, make citations exact | `create-next-app`, Dockerfile, layout, `lib/contracts.ts` |
| **10:30** | **CP0: contracts + skeleton on `main`; `docker compose up --build` runs db + backend + web** | | | |
| **10:30–13:30** | `:app`: Javalin, Flyway `V1__init.sql` + append-only trigger, DAO, seed loader | **Hand-build SMCyber v0 in real PC:** `products/SMCyber/SMCyber.xml`, 3 coverage patterns on `GLLine` (Data Breach, Extortion, Business Interruption) with `<CovTerms>` (limit/deductible `OptionCovTermPattern` / `DirectCovTermPattern`, money), `AvailabilityScript` on product code, display keys. Rebuild → New Submission → SMCyber shows the coverages | `shared/tools/*.json`; start `:planner` GeminiClient | `useExecutionStream` + dev SSE replay of `fixtures/events_demo_run.jsonl` |
| **13:30** | **CP1: each track runs on its own. The PC spike result decides Docker vs native.** | | | |
| **14:00–18:00** | Event bus → `pp_event_log` → SSE (subscribe-then-replay); `POST /executions`, `/verify`, `/rules`, `/tools/{name}`, `/reviews`; wire `:core` into `VerifyService` (emit `verify.node` in topological order) | Copy **our** v0 files into `policycenter/overlay-template/` (only files we wrote). `:pcexport`: Proposal → overlay files from the template + `PcManifest` (sha256s, termRanges from the RANGE rules). Golden test: fixed fixture → the same structure as v0 | `:planner`: tool loop → `Proposal`, `planner.*`/`tool.*` events, `FixturePlanner` | React Flow DAG from `/rules`, live colors, trace, tools panel |
| **18:00** | **CP2 ⭐ walking skeleton:** fixture run → Gosu gate → SSE → UI graph turns red on RNG-002. **And SMCyber v0 is visible in real PC.** Merge everything. | | | |
| **19:00–23:00** | Review workflow state machine; `/replay`, `/provenance`, `/metrics`; `planner` wiring via `VerifyPort`/`EventPort` | `:pcdeploy`: check token + approval → back up the previous SMCyber files → write the overlay into the mounted `modules/configuration` → touch the restart trigger → poll `/pc` → `pc.*` events | Live Gemini path, validation → retry → fixture; RAG-lite; **MCP route** in `web/` | Blocked card, reviewer panel, switch to the real backend |
| **23:00** | **CP3: live LLM → BLOCKED → (manual fixed proposal) → approve → overlay written into real PC. Stop by 23:30.** | | | |

### Day 2

| Time | 🅰 Shaurya | 🅱 Chinmay | 🅲 Dhriti | 🅳 Vaishnavi |
|---|---|---|---|---|
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

- **A:** 22 rules, all 6 checks tested, blocked/fixed fixtures behave correctly, false-pass = 0 with the denominator, 50/50 identical hashes. The API, SSE with full history, append-only log, review and replay all work.
- **B:** SMCyber shows up in **real** PC's New Submission after a ProvenPath deploy. `ProductModelAPI` confirms it. BLOCKED writes 0 files. An over-limit value in the PC UI is rejected with the rule code. The repo contains **zero Guidewire files**.
- **C:** The live planner produces a valid proposal, repair reaches PASSED in ≤2 iterations, fixture mode works offline, the MCP tools work in Inspector, and the corpus has ≥40 items.
- **D:** The whole demo is driven from the browser plus the PC tab. Deploy progress is live, metrics show denominators, and replay and tamper work.

## 8. Cut list (from the top, at CP4)

1. RAG-lite.
2. Replay animation (keep the hash re-verify).
3. MCP route (use a slide).
4. Stretch B items (SubmissionAPI, startup hash check, rating).
5. PC in Docker → PC native with `host.docker.internal`.
6. Live PC restart during the demo → pre-deployed PC plus a recorded deploy clip.
7. Gosu planner → TypeScript planner in Next.js.

**Never cut:** the Gosu gate · the live BLOCKED moment · the reviewer gate · SMCyber visible in real PC · the PC-side rejection · false-pass = 0 · "not a legal opinion".

## 9. Working rules

- **Git:** branch per track, merge to `main` at checkpoints, and `main` always runs. No AI co-author lines. **Every PR diff is checked for Guidewire files before merge.**
- **Build against fixtures first.** Nobody waits.
- **Gosu is not Java:** `.gs`, `uses`, `var x : T`, `function`, `construct()`, blocks `\ x -> ...`. See `07_GOSU.md`.
- **Secrets** go in `.env` only (`GEMINI_API_KEY`, `PROVENPATH_GATE_SECRET`, `PC_HOME`, `PC_USER`/`PC_PASSWORD`).
- **Standups** at checkpoints, 15 minutes. **Sleep** by 23:30 on Day 1.

### Gotcha questions to rehearse

| Judge asks | Show |
|---|---|
| "What if the AI hallucinates compliance?" | Tamper → SOURCE block. Module graph: `:planner` can't compile against `:core` |
| "Is this really PolicyCenter?" | Open PC, New Submission → SMCyber, show the generated coverage-pattern XML + manifest |
| "What if someone edits PC directly?" | Type an over-limit value in PC → the Gosu gate inside PC rejects it with the rule code |
| "Is this scripted?" | Replay → identical hash. Type a fresh prompt |
| "Why Gosu?" | The same language runs inside PolicyCenter. Our gate *is* a PC plugin |
| "Only 22 rules / only GL line?" | Deliberate scope. Roadmap: a dedicated `SMCyberLine` via APD, real IRDAI ingestion |
| "Legal sign-off?" | No. It's a rule-graph verdict plus a named reviewer. The footer says so |

### Demo beat owners

| Beat | Presenter |
|---|---|
| Hook, close, "why Gosu" | Shaurya |
| Live request | Dhriti |
| Verification moment + tamper | Shaurya |
| Reviewer + deploy into PC + PC-side rejection | Chinmay |
| Metrics, before/after, replay | Vaishnavi |
