# ProvenPath — 2-Day Build Plan (4 people) · Gosu + Next.js + Docker

> **Goal at the end of Day 2:** A PM types *"Cyber insurance for Indian startups, up to ₹50L coverage"* and Mission Control shows the full run live. The LLM proposes a config. The rule-graph, written in Gosu, **blocks** it and names the rule, the layer and the citation. The planner revises the config, which then passes all 5 layers. A named reviewer approves it, and the mocked PolicyCenter, a separate Gosu container, receives a Guidewire-shaped payload. Metrics show **0% false-pass** on a labelled test corpus, and pressing replay re-verifies the config with an identical verdict hash. **Everything runs with `docker compose up --build`.**
>
> Sources this plan is built from: PRD v2 · `PROVENPATH_PROJECT_PLAN.md` · `PROVENPATH_DATABASE_ARCHITECTURE.md` · `01_OVERVIEW.md` · `02_PRODUCT_MODEL.md` · `04_RULES_AND_UNDERWRITING.md` · `07_GOSU.md` · `09_INTEGRATIONS.md` · `10_PROVENPATH_MAPPING.md`.

---

## 0. Decisions locked before anyone writes code

| Question | Decision | Why |
|---|---|---|
| Product line | **Cyber Insurance for SMEs** (`SMCyber` / `SMCyberLine`) | Every doc already assumes it |
| Main backend | **Gosu on JDK 11**, Gradle multi-module (`gradle-gosu-plugin`), running standalone outside PolicyCenter | This is PolicyCenter's own language (`07_GOSU.md`). The pitch line: *"our gate is Gosu, so it ports into PC as an `IPreUpdateHandler` plugin"* |
| Gosu version | Try **1.14.x first**, which matches PC 10's Gosu 1.14.26 (`01_OVERVIEW.md`). If the build spike fails, use **1.18.x** (latest on Maven Central) | Same dialect as PolicyCenter |
| Java libs (all JDK 11-compatible; Gosu calls Java libs directly) | **Javalin 5.6.x** (HTTP + built-in SSE) · Jackson · PostgreSQL JDBC + HikariCP · **Flyway 9.x** (10.x needs Java 17) · **JGraphT** (the DAG) · SnakeYAML · `java.net.http.HttpClient` (Gemini) · JUnit 5 | Nothing exotic, and no Java 17 dependencies |
| AI planner | **Gosu** (`:planner` module): Gemini REST + function calling, `temperature=0`, `LLM_MODE=live\|fixture` | It's HTTP + JSON, so it doesn't need Python. **If it gets stuck, move it to TypeScript in Next.js, not Python**, so the stack stays at 2 languages |
| MCP server | **Next.js route** `web/app/api/mcp` using `@modelcontextprotocol/sdk` (TypeScript). The tools proxy to the Gosu REST API | The Java MCP SDK needs Java 17, which conflicts with Gosu's JDK 11 |
| **Python** | **Removed entirely.** The eval harness is a Gosu program too | After Next.js there is nothing left for Python to do |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + React Flow (`@xyflow/react`)** | The node graph comes built in, and the same app hosts the MCP route |
| DB | **PostgreSQL 16** container, migrations via Flyway plain SQL | Matches the DB architecture doc |
| Everything | **Docker Compose**: `db`, `backend`, `policycenter-mock`, `web` | One command to run the demo on any laptop |
| Layers | All 5 (TYPE, RANGE, CONSISTENCY, RULE-MATCH, SOURCE) plus a grounding check | |
| MCP tools | 4: `propose_product`, `add_coverage` (also handles exclusions), `verify_compliance`, `deploy_product`. `configure_rating` is folded into `propose_product` | Follows the PRD's §9 fallback |
| Auth | None. A reviewer dropdown with 2 seeded named users | PRD §5 non-goal |

### ⚠️ One PRD contradiction to resolve: all-or-nothing vs. "remaining clauses flow through"

§7 invariant 4 says any failure blocks the whole config. We keep that and change the demo:

**Run #1 is BLOCKED** (ransomware sublimit too high), so nothing reaches PC. The planner receives the named failure and re-proposes. **Run #2 passes**, goes to reviewer approval, and deploys.

### ⚠️ Biggest technical risk: Gosu tooling. It is handled by a spike in the first hour.

Standalone Gosu is less common than Java, and AI coding agents write it less fluently. By **10:30 on Day 1**, Chinmay must have a Gosu Javalin "hello" endpoint running in Docker next to Postgres and Next.js. If it isn't working, fall back in this order:

1. Switch the Gosu version to 1.18.x.
2. Build with Maven (`gosu-maven-compiler`) instead of Gradle.
3. At **12:30**, escalate to Shaurya for a team decision.

Nobody waits on this: everyone else writes code against the contracts and fixtures in the meantime.

---

## 1. Team tracks

| Track | Owner | Owns |
|---|---|---|
| **A — Verification Core (Gosu)** + tech lead | **Shaurya** | `:contracts`, `:core` (rule loader, JGraphT DAG, evaluator, 5 layers + grounding, gate, gate token), `:eval` harness, fixtures |
| **B — Platform, Docker & PolicyCenter mock (Gosu)** | **Chinmay** | Gosu/Gradle/Docker spike, `docker-compose.yml`, `:app` (Javalin API, Flyway, event log, SSE, review workflow, replay), `:pcmock` container (PreUpdateHandler + Guidewire XML adapter) |
| **C — AI Layer (Gosu planner + TS MCP) & Rule Content** | **Dhriti** | `rules/` (22 rules + sources YAML), `:planner` (Gemini, repair loop), shared tool schemas, `web/app/api/mcp` MCP server, eval corpus |
| **D — Mission Control (Next.js)** + pitch deck | **Vaishnavi** | `web/`: live trace, DAG graph, tools panel, blocked card, reviewer panel, deploy/provenance, metrics, replay, tamper/bypass, disclaimer |

> The owners are suggestions. Swap them freely, but keep one owner per track and **one owner for `:contracts`** (Shaurya).

---

## 2. Architecture and repo layout

```
docker compose up --build
 ├─ db                 postgres:16                                  :5432
 ├─ backend            Gosu/JDK11  (:app + :core + :planner)        :8080
 ├─ policycenter-mock  Gosu/JDK11  (:pcmock)                        :8180/pc
 └─ web                Next.js  (Mission Control + /api/mcp)        :3000
```

```
backend/                      Gradle multi-module, Gosu, JDK 11
  settings.gradle  build.gradle  Dockerfile  (multi-stage: temurin:11-jdk → temurin:11-jre)
  contracts/   provenpath.contracts.*      Proposal, Clause, Citation, NodeResult, Verdict, Event
  core/        provenpath.core.engine.*    RuleLoader, RuleGraph (JGraphT), LogicEvaluator
               provenpath.core.layers.*    Check (abstract) → Type/Range/Consistency/RuleMatch/Source/GroundingCheck
               provenpath.core.gate.*      Gate (all-or-nothing), GateToken (HMAC), Hashing
  planner/     provenpath.planner.*        GeminiClient, Planner, RepairLoop, FixturePlanner   ← depends ONLY on :contracts
  app/         provenpath.app.*            Main (Javalin), api/, db/ (JDBC+Flyway), events/, services/VerifyService, ToolService
               resources/db/migration/V1__init.sql
  pcmock/      provenpath.pcmock.*         Main, PreUpdateHandler, ProductModelXmlBuilder     ← depends ONLY on :contracts
  eval/        provenpath.eval.RunEval     corpus → metrics.json
shared/tools/*.json           JSON Schemas of the 4 tools (used by the Gosu planner AND the TS MCP server)
rules/sources.yaml  rules/rules/*.yaml
eval/corpus/*.json   eval/metrics.json
fixtures/proposal_demo_blocked.json  proposal_demo_fixed.json  events_demo_run.jsonl
web/                          Next.js App Router + TS + Tailwind + @xyflow/react
  app/page.tsx  components/*  lib/useExecutionStream.ts  app/api/mcp/route.ts
docker-compose.yml  .env.example
```

**The boundary is enforced by the compiler (invariant 1).** `:planner` depends only on `:contracts`. It receives a `VerifyPort` interface, which `:app` wires to `VerifyService`, so any attempt to `uses provenpath.core.*` from the planner fails to compile. This is stronger than Python's import-linter and deserves a slide: *"the LLM code cannot even see the verdict code."*

**The mock PolicyCenter is a separate container.** It shares only the HMAC secret, and rejects any write without a valid gate token plus an approved review. This is the `IPreUpdateHandler.gwp` pattern from `09_INTEGRATIONS.md`, as a real process boundary.

**One set of tools, two ways to reach them.** The Gosu planner uses the 4 tools in-process as Gemini function declarations. The Next.js MCP server exposes the same 4 tools, built from the same `shared/tools/*.json`, to any external agent (Claude Desktop, MCP Inspector). Demo line: *"even an outside agent goes through the same gate."*

**Two cheap features for the "what if the AI lies?" question:**
1. **Tamper button:** a proposal with `"compliant": true` and a real source id but fabricated text. The SOURCE layer blocks it because the sha256 doesn't match.
2. **Bypass button:** call `policycenter-mock` directly without a token. It returns `403 PC_PREUPDATE_REJECTED`.

---

## 3. Shared contracts (frozen at Checkpoint 0; changes need a PR plus a ping to the whole team)

**`backend/contracts`** (owner: Shaurya). Gosu classes, serialized with Jackson:

```
Citation    { sourceCode, section, textSnippet }                 // snippet must byte-match stored source text
Clause      { clauseId, kind: COVERAGE|EXCLUSION|RATING, patternCode, category, owningEntityType,
              existence, limitMaxInr, deductibleInr, waitingHours, conditions[], factors{}, citations[] }
Proposal    { proposalId, executionId, iteration, line:"SMCyber", aggregateLimitInr, turnoverInr,
              targetEffectiveDate, clauses[], proseSummary, llmMeta{} }
NodeResult  { ruleCode, clauseId, layer: TYPE|RANGE|CONSISTENCY|RULE_MATCH|SOURCE|GROUNDING,
              result: PASSED|FAILED|SKIPPED|NEEDS_REVIEW, expected, actual, reason, sourceCode }
Verdict     { runId, status: PASSED|BLOCKED, nodes[], rulesetHash, proposalHash, verdictHash, gateToken? }
Event       { executionId, seq, ts, type, payload }
```

- `NEEDS_REVIEW` (a clause no rule covers, per invariant 6) is **blocking**.
- `SKIPPED` means an upstream rule failed. The UI shows it greyed out.
- The same shapes are mirrored as TypeScript types in `web/lib/contracts.ts`, owned by Vaishnavi and kept in sync.

**SSE event types** (`docs/events.md`, owner: Chinmay): `run.started` · `planner.step` · `tool.called` · `tool.result` · `proposal.created` · `verify.started` · `verify.node` · `gate.blocked` · `gate.passed` · `planner.repair` · `review.requested` · `review.decided` · `pc.request` · `pc.response` · `run.completed`

**REST API** (Gosu backend `:8080`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/executions` `{prompt}` | Start a run → `{executionId}` |
| GET | `/api/v1/executions/{id}` | Current state |
| GET | `/api/v1/executions/{id}/stream` | SSE: history from seq 0, then live |
| POST | `/api/v1/tools/{name}` | The 4 tools (used by the MCP route) |
| POST | `/api/v1/verify` | Verify a raw proposal (used by the tamper button) |
| POST | `/api/v1/reviews` | Reviewer approve/reject |
| POST | `/api/v1/executions/{id}/replay` | Re-verify → `{verdictHash, originalHash, match}` |
| GET | `/api/v1/provenance/{clauseId}` | Clause → rule → source → layer results |
| GET | `/api/v1/metrics` | Serves `eval/metrics.json` |
| GET | `/api/v1/rules` | Rule DAG for the graph |

`policycenter-mock` (`:8180/pc`) exposes `create_product`, `add_coverage`, `configure_rating`, `deploy_product` and `GET /artifact/{id}` (XML zip).

**Rule YAML** (owner: Dhriti, validated by Shaurya):

```yaml
rule_code: CYB-RNG-002
name: Ransomware/extortion sublimit ≤ 50% of aggregate
layer: RANGE
applies_to: "coverage[patternCode=SMCyberExtortionCov]"
depends_on: [CYB-TYPE-001, CYB-RNG-001]
logic: {operator: LTE, field: "clause.limitMaxInr", value_ref: "proposal.aggregateLimitInr * 0.5"}
source_code: IRDAI-CYB-G-2024-S3.4
error_template: "Extortion sublimit ₹{actual} exceeds 50% of aggregate (₹{expected})"
pc_mapping: "CovTermPattern SMCyberExtortionLimit (modelType=Limit)"
```

`value_ref` grammar is deliberately tiny: `<path> [* <number>]`. There is no `eval` anywhere.

---

## 4. Database: 8 tables for the MVP (`V1__init.sql`)

| Keep | Change from the 16-table architecture doc |
|---|---|
| `pp_regulatory_source` | Add `text_sha256` |
| `pp_rule` | `depends_on` as a text array. Drops `pp_rule_dependency` and `pp_rule_parameter` |
| `pp_proposal` | Clauses as **JSONB**. Drops the 4 child tables. Add `execution_id` and `iteration` |
| `pp_verification_run` | Add `ruleset_hash`, `proposal_hash`, `verdict_hash` |
| `pp_verification_node` | As specified. Drops `pp_verification_edge` |
| `pp_compliance_review` | Reviewer = one of the seeded users |
| `pp_deployment` | Keep `artifact_manifest` and `pc_response_*` |
| `pp_event_log` | Audit log and SSE stream in one table. **A trigger rejects UPDATE/DELETE** |

Seed two users: *"A. Mehta — Compliance Reviewer"* and *"PM Demo"*.

---

## 5. The rule set: 22 IRDAI-style curated rules

The values are **curated parameters, not legal advice**. The one real anchor is CERT-In's 6-hour incident reporting direction (2022).

| Layer | Rule codes | What they check |
|---|---|---|
| **TYPE** (3) | CYB-TYPE-001..003 | Money fields in INR · `patternCode` matches `^SMCyber[A-Za-z]+Cov$` (mirrors `FieldValidators.xml`) · `existence` enum · `owningEntityType == SMCyberLine` · allowed `category` |
| **RANGE** (7) | CYB-RNG-001..007 | Aggregate ₹5L–₹5Cr · extortion sublimit ≤ 50% of aggregate · deductible 1–10% of limit · BI waiting period 8–72h · turnover ≤ ₹250Cr · rating factors 0.5–3.0 · minimum premium floor |
| **CONSISTENCY** (4) | CYB-CON-001..004 | Sum of first-party sublimits ≤ aggregate · deductible < limit · no exclusion nullifies a Required coverage · no duplicate pattern codes |
| **RULE-MATCH** (5) | CYB-RM-001..005 | Mandatory coverages (Data Breach Response, Privacy Liability) · mandatory exclusions (war/state-sponsored, prior known incidents, intentional acts, infrastructure failure) · ransom cover carries a law-enforcement-notification condition · fines only "where insurable by law" · CERT-In 6-hour notification condition |
| **SOURCE** (3) | CYB-SRC-001..003 | ≥1 citation per clause · source exists and the snippet sha256 matches · source active on the effective date, jurisdiction IN |
| **GROUNDING** (1) | CYB-GRD-001 | Every ₹/L/Cr/% number in `proseSummary` equals a verified clause value |

**Demo trigger:** ₹50L aggregate with a ₹40L extortion sublimit (80%) → **CYB-RNG-002 FAILS**, CYB-CON-001 is **SKIPPED**, and the gate reports **BLOCKED**. The repair iteration proposes ₹20L and passes.

---

## 6. Hour-by-hour plan

### Day 1: build everything against fixtures, then connect it

| Time | 🅰 Shaurya: Core (Gosu) | 🅱 Chinmay: Platform (Gosu + Docker) | 🅲 Dhriti: AI + Rules | 🅳 Vaishnavi: Next.js |
|---|---|---|---|---|
| **09:00–10:30** | Write `:contracts` Gosu classes, `docs/events.md` with Chinmay, the 3 fixtures, `.env.example`. Push by 10:30 | **Gosu spike ⭐:** Gradle multi-module + gosu plugin, JDK 11 Dockerfile, Javalin `GET /health` from a Gosu `Main`, `docker-compose.yml` with db + backend + web placeholder. Push by 10:30 | Read the docs, draft `rules/sources.yaml` (~12 sections + CERT-In), start the rule YAMLs | `create-next-app` (TS, Tailwind, App Router) in `web/`, Dockerfile, 5-panel layout, `lib/contracts.ts` |
| **10:30** | **CP0: contracts + skeleton on `main`; `docker compose up --build` runs all containers (15-min standup)** | | | |
| **10:30–13:30** | `RuleLoader` (SnakeYAML → model, cycle check), `RuleGraph` (JGraphT, topological order), `LogicEvaluator` (`AND OR NOT GT GTE LT LTE EQ NEQ IN REGEX EXISTS TYPE_IS` + `value_ref`), SKIPPED propagation. JUnit tests | Flyway `V1__init.sql` (8 tables + append-only trigger), JDBC/Hikari DAO layer, seed loader (users, sources, rules YAML → DB) | **All 22 rule YAMLs** following §5; check at 12:00 that Shaurya's loader parses them. `shared/tools/*.json` schemas for the 4 tools | `useExecutionStream` (EventSource, dedupe by seq, reconnect) + dev route `app/api/dev-stream` that replays `fixtures/events_demo_run.jsonl` as SSE |
| **13:30** | **CP1: each track runs on its own against fixtures** | | | |
| **14:00–18:00** | `Check` abstract class + 6 subclasses (invariant 8), `Gate` (all-or-nothing; NEEDS_REVIEW blocks), `Hashing` (canonical JSON sha256), `GateToken` (HMAC). Tests: blocked fixture → BLOCKED on RNG-002, fixed fixture → PASSED | Event bus (insert into `pp_event_log` with seq → publish), Javalin SSE `/executions/{id}/stream` (subscribe-then-replay), `POST /executions`, `GET /executions/{id}`, `POST /verify`, `GET /rules`, CORS for :3000 | `:planner` in Gosu: `GeminiClient` (HttpClient → Gemini REST, function declarations from `shared/tools`), `Planner` builds a `Proposal` via the tool loop, emits `planner.step`/`tool.*` through the `EventPort` interface. `FixturePlanner` for `LLM_MODE=fixture` | React Flow DAG from `/rules` (columns by layer, edges = depends_on), colored live by `verify.node`. Trace timeline. Tools panel with collapsible JSON |
| **18:00** | **CP2: walking skeleton ⭐ (most important checkpoint).** `POST /executions` in fixture mode → Gosu engine → events → SSE → the Next.js graph turns red on RNG-002. **Everything merged to `main`, running in Docker.** | | | |
| **19:00–23:00** | Wire `:core` into `VerifyService` in `:app`: persist run + nodes + `rule_logic_snapshot`, emit `verify.node` in topological order ~150ms apart. Confirm `:planner` has no dependency on `:core` | **`:pcmock` container** (`:8180/pc`): 4 endpoints with Guidewire-like JSON; `PreUpdateHandler` → 403 `PC_PREUPDATE_REJECTED` unless HMAC token valid + review approved (checks backend `/reviews`). `POST /reviews`. `pc.request/response` events | Live Gemini path end to end (Pydantic-style validation in Gosu: malformed → retry once → fixture). RAG-lite: keyword match over sources into the prompt (drafting only). **MCP route** `web/app/api/mcp/route.ts` (TS SDK, Streamable HTTP): 4 tools → `POST backend/api/v1/tools/{name}`. Test with MCP Inspector | **Blocked card** (rule, layer, expected vs actual, reason, source text, "NOTHING WRITTEN TO POLICYCENTER"). **Reviewer panel** (named reviewer, per-clause provenance, Approve/Reject, comment required on reject). Switch from the dev stream to the real backend |
| **23:00** | **CP3: live LLM → verify → BLOCKED in UI; review + mock PC deploy via API. Write down what broke. Stop by 23:30.** | | | |

### Day 2: close the loop, measure it, harden it, rehearse

| Time | 🅰 Shaurya | 🅱 Chinmay | 🅲 Dhriti | 🅳 Vaishnavi |
|---|---|---|---|---|
| **09:00–09:30** | **Standup: triage the CP3 breakage list** | | | |
| **09:30–12:30** | `:eval` `RunEval` (Gosu main, run via `docker compose run backend eval`): corpus → `metrics.json` (accuracy, **false-pass**, false-block, denominators, per-layer confusion). Fix engine until **false-pass = 0**. Determinism: 50 runs → identical `verdictHash` | `ProductModelXmlBuilder` in `:pcmock`: `products/SMCyber/SMCyber.xml`, `policylinepatterns/SMCyberLine/SMCyberLine.xml`, `coveragepatterns/*.xml` with `<CovTerms>` `OptionCovTermPattern` (Limit/Deductible, money), exclusions, lookup CSV (per `02_PRODUCT_MODEL.md`). `GET /artifact/{id}` zip + diff manifest | **Corpus** `eval/corpus/`: ≥40 labelled items (~20 pass / ~20 fail incl. fake citation, altered text, lakh/crore trick, off-by-one cap, missing exclusion, missing CERT-In, injected `"compliant": true`, prose number mismatch). Hand to Shaurya by 11:00 | Deploy panel (exact PC payload + XML tab), Provenance drawer, Metrics panel (show denominators), before/after slider |
| **12:30** | **CP4: full demo path end to end in Docker. Anything not working now gets cut (§8).** | | | |
| **13:30–15:00** | Grounding parser hardening (₹/L/Cr/%), tamper test, 100% provenance check | Review state machine (`verified_pass → review_pending → approved/rejected → deployed`), `/replay`, `/provenance`, `/metrics`. Healthchecks + `depends_on` in compose; seeded demo volume | **Repair loop** (feed named failures back, max 2 iterations, `planner.repair`). Tune the demo prompt for blocked → fixed; record the fixture from a good live run | Replay (3× playback + "Re-verify → identical hash ✔"), Tamper + Bypass buttons, loading/error states, disclaimer footer |
| **15:00** | **CP5: feature freeze. Bugs only.** | | | |
| **15:00–17:00** | Bug bash: demo script ×3 in live and fixture mode | Clean-machine test: `git clone` → `docker compose up --build` → demo works. Check image sizes and startup order | README (run instructions, architecture, Gosu boundary diagram) | **Pitch deck** (6 slides) |
| **17:00–18:00** | **Record the backup demo video. Code freeze at 18:00, tag `v1.0-demo`.** | | | |
| **18:00–20:00** | **3 timed rehearsals with gotcha questions (§9).** | | | |

---

## 7. Definition of done, per track

- **A:** 22 rules load, the DAG is acyclic, and all 6 checks have JUnit tests. Blocked fixture → BLOCKED on RNG-002 with CON-001 SKIPPED. Fixed fixture → PASSED with a token. `metrics.json` shows **false-pass = 0** with the denominator. 50/50 identical hashes. `:planner` has no `:core` dependency.
- **B:** A clean `docker compose up --build` works with seed data. Late SSE subscribers get the full history. The event log rejects UPDATE/DELETE. PC mock returns 403 without token/approval and 200 with both. The XML zip looks Guidewire-shaped. Replay works.
- **C:** The live planner produces a valid proposal for the demo prompt. The repair loop reaches PASSED within 2 iterations. Fixture mode works offline. The MCP route's 4 tools are callable from MCP Inspector. Corpus ≥40 items.
- **D:** The whole demo runs from the browser with no curl. The blocked card names rule, layer and citation. Reviewer actions are logged. Metrics show denominators. Replay, tamper and bypass work. The disclaimer is visible everywhere.

---

## 8. Cut list (drop from the top when behind at CP4)

1. RAG-lite retrieval. Put the static source list in the prompt instead.
2. XML zip. Show the JSON payload; the XML becomes a slide.
3. Replay playback animation. Keep "Re-verify → identical hash".
4. MCP route. Show the tool schemas on a slide instead.
5. Gosu planner stuck → move the planner into a Next.js route handler (TypeScript, `@google/genai`). **Core stays Gosu no matter what.**
6. Live LLM → fixture mode for the demo, saying so honestly if asked.

**Never cut:** the Gosu gate · the live BLOCKED moment · the reviewer gate · gate token + PC 403 · false-pass = 0 with denominator · the "not a legal opinion" line.

---

## 9. Working rules

- **Git:** branch per track (`track-a/...`), merge to `main` at every checkpoint. **`main` must always pass `docker compose up --build` + the fixture demo.** Contract changes go through a PR tagged `@all`. No AI co-author lines in commits.
- **Build against fixtures first.** Nobody waits on anyone.
- **Gosu is not Java.** Use `uses` (not `import`), `var x : Type`, `function`, `construct()`, blocks `\ x -> x * 2` (they coerce to Java lambdas/SAMs, e.g. Javalin handlers), properties, and `.gs` files. When unsure, check `07_GOSU.md` and gosu-lang.github.io. Don't let an agent silently write `.java` files.
- **Docker:** backend image = multi-stage `eclipse-temurin:11-jdk` → `11-jre`. Web = `node:20-alpine`. Secrets only in `.env` (gitignored).
- **Standups** only at checkpoints, 15 minutes each.
- **Sleep:** stop by 23:30 on Day 1.

### Gotcha questions to rehearse

| Judge asks | Show |
|---|---|
| "What if the AI hallucinates compliance?" | Tamper → SOURCE block. Module-graph slide: `:planner` cannot compile against `:core` |
| "What stops someone skipping your gate?" | Bypass → PC 403 from a separate container (the PreUpdateHandler pattern) |
| "Is this scripted?" | Replay → identical `verdictHash`, then type a fresh prompt live |
| "Why Gosu?" | It's PolicyCenter's language. The gate classes can be registered as an `IPreUpdateHandler`/`IValidationPlugin` inside real PC |
| "Only 22 rules?" | Deliberately: one line, curated, denominators shown. Roadmap: real IRDAI ingestion plus the full 16-table schema already designed |
| "Is this legal sign-off?" | No. It's a rule-graph verdict plus a named human reviewer, and the footer says so |

### Demo beat owners

| Beat | Presenter |
|---|---|
| Hook + close + "why Gosu" | Shaurya |
| Live request + planner | Dhriti |
| Verification moment + tamper/bypass | Shaurya |
| Reviewer sign-off + PC deploy payload | Chinmay |
| Metrics + before/after + replay | Vaishnavi |
