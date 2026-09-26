# ProvenPath — 2-Day Build Plan (4 people)

> **Goal at the end of Day 2:** A PM types *"Cyber insurance for Indian startups, up to ₹50L coverage"* and Mission Control shows the full run live. The LLM proposes a config. The rule-graph **blocks** it and names the rule, the layer and the citation. The planner revises the config, which then passes all 5 layers. A named reviewer approves it, and the mocked PolicyCenter receives a Guidewire-shaped payload. Metrics show **0% false-pass** on a labelled test corpus, and pressing replay re-verifies the config with an identical verdict hash.
>
> Sources this plan is built from: PRD v2 · `PROVENPATH_PROJECT_PLAN.md` · `PROVENPATH_DATABASE_ARCHITECTURE.md` · `02_PRODUCT_MODEL.md` · `04_RULES_AND_UNDERWRITING.md` · `05_RATING.md` · `09_INTEGRATIONS.md` · `10_PROVENPATH_MAPPING.md`.

---

## 0. Decisions locked before anyone writes code

These settle the PRD's open questions (§14) so they can't eat time on Day 1.

| Question | Decision | Why |
|---|---|---|
| Product line | **Cyber Insurance for SMEs** (`SMCyber` / `SMCyberLine`) | Every doc already assumes it |
| Backend language | **Python 3.11 + FastAPI + Pydantic v2** | Reuses RazorMind patterns (tool-contract ABCs, `import-linter`) |
| DB | **PostgreSQL 16 in docker-compose**, via SQLAlchemy (so we can drop to SQLite in an emergency) | Matches DB architecture doc |
| DB scope | **8 of the 16 tables** (see §4) | We don't need all 16 for the demo. The dropped ones become roadmap items |
| Rule engine | **`networkx` DAG + a JSON rule-logic evaluator**. Rules live in **YAML in git** and are seeded to the DB at startup | Rules become diffable and reviewable, and every run records the ruleset hash |
| LLM | **Gemini (free tier)**, `temperature=0`, with `LLM_MODE=live\|fixture` | A fixture fallback means the demo cannot die on a rate limit |
| MCP tools | **4 tools**: `propose_product`, `add_coverage` (also handles exclusions), `verify_compliance`, `deploy_product`. `configure_rating` is folded into `propose_product` | Follows the PRD's §9 fallback |
| Layers | **All 5** (TYPE, RANGE, CONSISTENCY, RULE-MATCH, SOURCE) plus a grounding check | Each layer is small once the evaluator exists, so we don't need to compress to 3 |
| Frontend | **Vite + React + TypeScript + Tailwind + React Flow**, fed by SSE | Node graph for free |
| Auth | None. A reviewer dropdown with 2 seeded named users | PRD §5 non-goal |

### ⚠️ One PRD contradiction to resolve: all-or-nothing vs. "remaining clauses flow through"

The PRD demo script (§11 step 5) says the *remaining* verified clauses deploy. §7 invariant 4 says **any failure blocks the entire config**. We keep the invariant and change the demo:

**Run #1 is BLOCKED** (ransomware sublimit too high), so nothing reaches PC. The planner receives the named failure and re-proposes. **Run #2 passes all 5 layers**, goes to reviewer approval, and deploys.

This is a better story than the original: the judge sees the gate hold, and then sees the system recover without anyone overriding it.

---

## 1. Team tracks

| Track | Owner | Owns | Why this split |
|---|---|---|---|
| **A — Verification Core** (+ tech lead) | **Shaurya** | Rule-graph engine, 5 layers, all-or-nothing gate, gate token, grounding check, eval harness, `contracts.py` | This is the RazorMind core. The person who built it once builds it fastest |
| **B — Platform & PolicyCenter** | **Chinmay** | FastAPI, Postgres schema, append-only audit/event log, SSE, review workflow, **mock PolicyCenter + PreUpdateHandler**, Guidewire XML adapter | All the plumbing the other three plug into |
| **C — AI Layer & Rule Content** | **Dhriti** | Regulatory sources + the 22 rules (YAML), MCP server, Gemini planner, repair loop, RAG-lite, labelled test corpus | The LLM side and the regulatory content are the domain-heavy parts |
| **D — Mission Control UI** (+ pitch deck) | **Vaishnavi** | React app: live trace, DAG graph, tools panel, blocked card, reviewer panel, deploy/provenance views, metrics, replay, before/after slider | The judges see the product through this, so it gets a full owner |

> The owners are suggestions. Swap them freely, but keep **one owner per track** and **one owner for `contracts.py`** (Track A).

---

## 2. Architecture as we'll build it

```
┌─────────────── frontend/ (Track D) ───────────────┐
│ Request box · Trace timeline · DAG graph (React   │
│ Flow) · Tools panel · Reviewer panel · Deploy &   │
│ Provenance · Metrics · Replay                     │
└──────────────▲──────────────────────┬─────────────┘
          SSE  │                      │ REST
┌──────────────┴──────────────────────▼─────────────┐
│ backend/app/api        (Track B)                  │
│   POST /executions  GET /executions/{id}/stream   │
│   POST /reviews  POST /executions/{id}/replay     │
│   GET /metrics  GET /provenance/{clause}          │
├───────────────────────────────────────────────────┤
│ backend/app/llm   (Track C)  Planner ──calls──►   │
│ backend/app/mcp_server (C)   4 tools (thin wrap)  │
│        │ may NOT import core.gate internals       │
├────────▼──────────────────────────────────────────┤
│ backend/app/core  (Track A)                       │
│   engine/ (DAG, evaluator)  layers/ (5 + ground)  │
│   gate.py  → verdict + HMAC gate token            │
├───────────────────────────────────────────────────┤
│ backend/app/events (B)  append-only log → SSE     │
│ backend/app/db     (B)  8 tables                  │
├───────────────────────────────────────────────────┤
│ backend/app/pc_mock (B)  /mock-pc/*               │
│   PreUpdateHandler: 403 unless valid gate token   │
│   + approved review   (mirrors IPreUpdateHandler) │
└───────────────────────────────────────────────────┘
rules/  sources.yaml + rules/*.yaml   (C authors, A validates)
eval/   corpus/*.json + run_eval.py   (C builds corpus, A builds harness)
```

**Enforced boundary (invariant 1):** an `import-linter` contract says `app.llm` and `app.mcp_server` cannot import `app.core.engine` or `app.core.layers`. They can only call `services.verify(proposal) -> Verdict`. As a result, the LLM code has no way to produce or change a verdict. This is worth one slide.

**Two cheap features for the "what if the AI lies?" question:**
1. **Tamper button:** inject a proposal where the LLM claims `"compliant": true` and cites a real source id with fabricated text. The SOURCE layer blocks it because the citation text doesn't byte-match the stored source.
2. **Bypass button:** call `/mock-pc/deploy_product` directly without a gate token. The mock PC's PreUpdateHandler returns `403 PC_PREUPDATE_REJECTED`. This is the `IPreUpdateHandler.gwp` story from `09_INTEGRATIONS.md`.

---

## 3. Shared contracts (frozen at Checkpoint 0; changes need a PR plus a ping to the whole team)

**`backend/app/models/contracts.py`** (owner: Shaurya). Base it on `PROVENPATH_PROJECT_PLAN.md` §4, with these additions:

```python
Clause      = CoverageSpec | ExclusionSpec | RatingRuleSpec   # each has clause_id, citations[]
Citation    = {source_code, section, text_snippet}            # text must byte-match pp_regulatory_source
Proposal    = {proposal_id, execution_id, line:'SMCyber', aggregate_limit_inr,
               clauses[], prose_summary, llm_meta}
NodeResult  = {rule_code, clause_id, layer: TYPE|RANGE|CONSISTENCY|RULE_MATCH|SOURCE|GROUNDING,
               result: PASSED|FAILED|SKIPPED|NEEDS_REVIEW, expected, actual, reason, source_code}
Verdict     = {run_id, status: PASSED|BLOCKED, nodes[], ruleset_hash, proposal_hash,
               verdict_hash, gate_token | None}               # gate_token only when PASSED
```

- `NEEDS_REVIEW` (a clause with no matching rule node, per invariant 6) **counts as blocking**.
- `SKIPPED` means an upstream dependency failed. The UI shows it greyed out.

**SSE event envelope** (`docs/events.md`, owner: Chinmay): `{execution_id, seq, ts, type, payload}`

Event types: `run.started` · `planner.step` · `tool.called` · `tool.result` · `proposal.created` · `verify.started` · `verify.node` · `gate.blocked` · `gate.passed` · `planner.repair` · `review.requested` · `review.decided` · `pc.request` · `pc.response` · `run.completed`

**Rule YAML format** (owner: Dhriti, validated by Shaurya). This uses the `rule_logic` JSONB schema from the DB doc:

```yaml
rule_code: CYB-RNG-002
name: Ransomware sublimit ≤ 50% of aggregate
layer: RANGE
applies_to: "coverage[pattern_code=SMCyberExtortionCov]"
depends_on: [CYB-TYPE-001, CYB-RNG-001]
logic: {operator: LTE, field: "limit.max_inr", value_ref: "proposal.aggregate_limit_inr * 0.5"}
source_code: IRDAI-CYB-G-2024-S3.4
error_template: "Extortion sublimit ₹{actual} exceeds 50% of aggregate (₹{expected})"
pc_mapping: "CovTermPattern SMCyberExtortionLimit (modelType=Limit)"
```

**Fixtures (committed by 10:30 on Day 1):**
- `fixtures/proposal_demo_blocked.json`
- `fixtures/proposal_demo_fixed.json`
- `fixtures/events_demo_run.jsonl`, which the UI builds against before the backend exists

---

## 4. Database: 8 tables for the MVP (cut down from the 16-table architecture doc)

| Keep | Change from the architecture doc |
|---|---|
| `pp_regulatory_source` | Add `text_sha256` (used by the SOURCE layer) |
| `pp_rule` | Dependencies stored as a `depends_on` array. Drops `pp_rule_dependency` and `pp_rule_parameter` (params inline in `rule_logic`) |
| `pp_proposal` | Clauses stored as **JSONB**. Drops the 4 `pp_proposal_*` child tables. Add `execution_id` and `iteration` |
| `pp_verification_run` | Add `ruleset_hash`, `proposal_hash`, `verdict_hash` |
| `pp_verification_node` | As specified. Drops `pp_verification_edge` (edges are derived from rule deps) |
| `pp_compliance_review` | Keep `reviewer_user_id`. The seeded users stand in for `pp_user` |
| `pp_deployment` | Keep `artifact_manifest` and `pc_response_*` |
| `pp_event_log` | Merges `pp_audit_log` with the SSE event stream. **A trigger rejects UPDATE/DELETE** (invariant 7) |

Seed two users: *"A. Mehta — Compliance Reviewer"* and *"PM Demo"*. The dropped tables go in the pitch as roadmap items.

---

## 5. The rule set: 22 IRDAI-style curated rules

Dhriti authors these and Shaurya reviews them for testability. The values are **curated parameters, not legal advice**, and every artifact must say so. The one real anchor is CERT-In's 6-hour incident reporting direction (2022). Cite it accurately.

| Layer | Rule codes | What they check |
|---|---|---|
| **TYPE** (3) | CYB-TYPE-001..003 | Limits and deductibles are `money` in INR · `pattern_code` matches `^SMCyber[A-Za-z]+Cov$` (mirrors `FieldValidators.xml`) · `existence` ∈ {Required, Suggested, Electable, Preset} · `owningEntityType == SMCyberLine` · `coverageCategory` in the allowed set |
| **RANGE** (7) | CYB-RNG-001..007 | Aggregate limit ₹5L–₹5Cr · extortion/ransomware sublimit ≤ 50% of aggregate · deductible 1–10% of limit · BI waiting period 8–72h · eligibility turnover ≤ ₹250Cr · rating factors 0.5–3.0 · minimum premium floor |
| **CONSISTENCY** (4) | CYB-CON-001..004 | Sum of first-party sublimits ≤ aggregate · deductible < limit on each coverage · no exclusion nullifies a Required coverage · no duplicate pattern codes |
| **RULE-MATCH** (5) | CYB-RM-001..005 | Mandatory coverages present (Data Breach Response, Privacy Liability) · mandatory exclusions present (war/state-sponsored, prior known incidents, intentional acts, infrastructure failure) · ransom coverage carries a law-enforcement-notification condition · regulatory fines only "where insurable by law" · CERT-In 6-hour notification condition present |
| **SOURCE** (3) | CYB-SRC-001..003 | Every clause has ≥1 citation · the cited `source_code` exists and the snippet byte-matches the stored text (sha256) · the source is active on `target_effective_date` for jurisdiction IN |

Plus **GROUNDING** (CYB-GRD-001, from PRD §13): every number in the LLM's `prose_summary` must match a verified clause value. We parse ₹, lakh, crore and % to integers before comparing. **Total: 22 rules** (15–25 target ✔).

**Demo trigger:** "up to ₹50L" leads the LLM (or the fixture) to propose a ₹40L extortion sublimit. That is 80% of the aggregate, which is more than 50%, so **CYB-RNG-002 FAILS**, CYB-CON-001 is **SKIPPED**, and the gate reports **BLOCKED**. The repair iteration proposes ₹20L and passes.

---

## 6. Hour-by-hour plan

The schedule assumes about 13 focused hours on Day 1 and 11 on Day 2. Shift the clock times to suit, but keep the checkpoints.

### Day 1: build everything against fixtures, then connect it

| Time | 🅰 Shaurya: Verification Core | 🅱 Chinmay: Platform & PC | 🅲 Dhriti: AI & Rules | 🅳 Vaishnavi: Mission Control |
|---|---|---|---|---|
| **09:00–10:30** | **Everyone: CP0 contracts session.** Repo + monorepo skeleton, `contracts.py`, `events.md`, rule YAML format, the 3 fixtures, branch rules. Walk through the demo script end to end on a whiteboard. | ← | ← | ← |
| **10:30–13:30** | Rule loader (YAML → model, cycle check), `networkx` DAG + topological order, JSON-logic evaluator (`AND OR NOT GT GTE LT LTE EQ NEQ IN REGEX EXISTS TYPE_IS`, `value_ref` expressions), SKIPPED-on-upstream-failure. Unit tests. | docker-compose (PG), FastAPI scaffold, SQLAlchemy models + Alembic migration for the 8 tables, append-only trigger, seed script (users, sources, rules from YAML) | Write `rules/sources.yaml` (~12 source sections, IRDAI-style text + CERT-In) and **all 22 rule YAMLs**. Check with Shaurya at 12:00 that the loader parses them | Vite/React/TS/Tailwind scaffold, page layout (5 panels), `useExecutionStream()` SSE hook + a tiny script that replays `events_demo_run.jsonl` as SSE |
| **13:30** | **CP1: each track runs on its own against fixtures (15-min standup)** | | | |
| **14:00–18:00** | The 5 layers + grounding as `Check` subclasses of one ABC (invariant 8). `gate.py`: all-or-nothing, NEEDS_REVIEW for unmapped clauses, `verdict_hash`, HMAC `gate_token(run_id, proposal_hash, ruleset_hash)`. Test: demo_blocked → BLOCKED on RNG-002; demo_fixed → PASSED | Event bus: write to `pp_event_log`, then publish. SSE `/executions/{id}/stream` with **subscribe-then-replay** (history from seq 0, then live). Routes: `POST /executions`, `GET /executions/{id}`, `POST /reviews`, `GET /metrics` (stub) | MCP server (Python MCP SDK / FastMCP) with the 4 tools as thin wrappers over services. `verify_compliance` returns the Verdict **verbatim**. Test in MCP Inspector | React Flow DAG: nodes = rules grouped by layer, colored live by `verify.node`. Trace timeline (planner steps / tool calls). Tools panel with collapsible input/output JSON |
| **18:00** | **CP2: walking skeleton ⭐ (most important checkpoint).** `POST /executions` with the fixture proposal → engine → events in DB → SSE → UI graph turns red on RNG-002. **Merge everything to `main`.** | | | |
| **19:00–23:00** | Wire the engine into `services.verify()`: persist run + nodes + `rule_logic_snapshot`, emit `verify.node` events in topological order (~150ms apart so the graph animates). `import-linter` boundary contract in CI/pre-commit | **Mock PolicyCenter** `/mock-pc/`: `create_product`, `add_coverage`, `configure_rating`, `deploy_product` with realistic request/response shapes. **PreUpdateHandler**: 403 unless the gate token is valid **and** an approved review exists. Log `pc.request`/`pc.response` | **Gemini planner:** decomposes the request into tool calls, strict JSON schema, Pydantic validation (malformed output → retry once → fixture), emits `planner.step`. `LLM_MODE=fixture` path. RAG-lite: keyword retrieval over `sources.yaml` into the prompt (**drafting only**) | **Blocked card:** rule code, layer, expected vs actual, reason, cited source text, big "NOTHING WRITTEN TO POLICYCENTER" banner. **Reviewer panel:** named reviewer, per-clause provenance list, Approve/Reject, comment required on reject. Switch from fixture SSE to the real backend |
| **23:00** | **CP3: live LLM → MCP tools → verify → BLOCKED in UI. Review and mock deploy work via API. Write down what broke; that list is Day 2's first hour.** | | | |

### Day 2: close the loop, measure it, harden it, rehearse

| Time | 🅰 Shaurya | 🅱 Chinmay | 🅲 Dhriti | 🅳 Vaishnavi |
|---|---|---|---|---|
| **09:00–09:30** | **Standup: triage the CP3 breakage list** | | | |
| **09:30–12:30** | **Eval harness** `eval/run_eval.py`: runs the corpus through the gate and writes `metrics.json` (accuracy, **false-pass**, false-block, denominators, per-layer confusion). Fix engine bugs until **false-pass = 0**. Determinism test: 50 re-runs → identical `verdict_hash` | **Guidewire adapter:** generate `products/SMCyber/SMCyber.xml`, `policylinepatterns/SMCyberLine/SMCyberLine.xml`, `coveragepatterns/*.xml` with `<CovTerms>` / `OptionCovTermPattern` (modelType Limit/Deductible, valueType money), exclusion patterns, and a lookup CSV, following `02_PRODUCT_MODEL.md`. `/deployments/{id}/artifact` zip + diff manifest | **Labelled corpus** `eval/corpus/`: ≥40 clauses/proposals, ~20 compliant and ~20 not. Include adversarial ones: fake citation, real id with altered text, lakh/crore unit trick, off-by-one cap, missing mandatory exclusion, a `"compliant": true` field. Hand it to Shaurya by 11:00 | **Deploy panel:** exact PC payload + XML preview tab. **Provenance drawer:** clause → rule → source text → layer results. **Metrics panel** from `/metrics` (show denominators). **Before/after slider:** "~3 weeks manual" vs measured request-to-approved time |
| **12:30** | **CP4: full demo path works end to end.** Request → BLOCKED → repair → PASSED → approve → deploy → metrics. **Anything not working now gets cut (see §8).** | | | |
| **13:30–15:00** | Grounding check hardening (₹/L/Cr/% parser). Tamper scenario test. Review `/provenance` for 100% citation completeness | Review state machine (`verified_pass → review_pending → approved/rejected → deployed`, reject logged with reason). `POST /executions/{id}/replay`: re-verifies the stored proposal and returns `verdict_hash` match true/false. Hosting + seeded demo DB | **Repair loop:** on `gate.blocked`, feed the named failures back to the planner, re-propose (max 2 iterations), and emit `planner.repair`. Tune the demo prompt so live mode reliably takes the blocked → fixed path, and record the fixture from a good live run | **Replay:** event-log playback at 3× speed + "Re-verify" showing an identical hash ✔. **Tamper** and **Bypass** buttons (§2). Loading/error states. Footer on every screen: *"Rule-graph verdict against a curated constraint set. Not a legal opinion."* |
| **15:00** | **CP5: feature freeze.** From here on, fix bugs only. | | | |
| **15:00–17:00** | Bug bash, running the demo script 3 times each in live and fixture mode | Deployment smoke tests, env/secrets check (Gemini key only in `.env`, never committed), backup local run | README + architecture diagram. Freeze a copy of the fixtures as a known-good demo | **Pitch deck** (6 slides: problem → boundary principle → architecture → live demo → metrics → roadmap + competitive positioning from PRD §12) |
| **17:00–18:00** | **Record the backup demo video (full 5-min script).** Code freeze at 18:00, tag `v1.0-demo`. | | | |
| **18:00–20:00** | **3 full rehearsals with a timer.** One teammate plays the judge and asks gotcha questions (§9). | | | |

---

## 7. Definition of done, per track

- **A (Verification Core):** 22 rules load, the DAG is acyclic, and all 5 layers + grounding have unit tests. demo_blocked → BLOCKED on CYB-RNG-002 with CYB-CON-001 SKIPPED. demo_fixed → PASSED with a gate token. `metrics.json` shows **false-pass = 0** with the denominator. 50/50 identical verdict hashes. The import-linter boundary passes.
- **B (Platform & PC):** `docker compose up` gives a working API with seeded data. SSE late-joiners get the full history. The event log rejects UPDATE/DELETE. Mock PC returns 403 without a token or approval and 200 with both. The artifact zip contains valid-looking Guidewire product-model XML. Replay endpoint works.
- **C (AI & Rules):** The 4 MCP tools are callable from MCP Inspector. The live planner produces a schema-valid proposal for the demo prompt. The repair loop reaches PASSED within 2 iterations. Fixture mode reproduces the demo offline. Corpus has ≥40 labelled items.
- **D (Mission Control):** The whole demo runs from the UI with no curl. The blocked card names rule, layer and citation. Reviewer approve/reject is logged against the execution id. Deploy panel shows the exact payload. Metrics show denominators. Replay and tamper/bypass buttons work. The disclaimer is visible.

---

## 8. Cut list (drop from the top when behind at CP4)

1. RAG-lite retrieval. The prompt carries the source list statically instead.
2. Guidewire XML zip. Show the JSON payload only; the XML becomes a slide.
3. Event-log playback animation. Keep the "Re-verify → identical hash" button.
4. Standalone MCP server process. Keep the tools in-process and show the tool schema on a slide.
5. Postgres → SQLite (a one-line SQLAlchemy URL change).
6. Live LLM → **fixture mode for the demo**, saying so honestly if asked.

**Never cut:** the live BLOCKED moment · the reviewer gate · the gate token + PC 403 · false-pass = 0 with denominator · the "not a legal opinion" line.

---

## 9. Working rules for the 2 days

- **Git:** one branch per track (`track-a/...`). Merge to `main` at every checkpoint. **`main` must always run `docker compose up` + the fixture demo.** Contract changes go through a PR tagged `@all`.
- **Build against fixtures first.** Nobody waits on anyone. The UI runs on `events_demo_run.jsonl`, the engine on the fixture proposals, and the planner on a stub `verify()`.
- **Standups** happen only at checkpoints and last 15 minutes. Each person says what works, what's blocked, and what they're cutting.
- **Secrets:** the Gemini key lives in `.env` (gitignored). Commit `.env.example` only.
- **Sleep:** stop by 23:30 on Day 1. A tired Day 2 costs more than the lost hours.

### Gotcha questions to rehearse (the answer comes from the feature)

| Judge asks | Show |
|---|---|
| "What if the AI hallucinates compliance?" | The Tamper button blocks at the SOURCE layer. The import-linter boundary slide shows the LLM code can't reach the verdict |
| "What stops someone skipping your gate?" | The Bypass button returns PC 403 (PreUpdateHandler pattern from `09_INTEGRATIONS.md`) |
| "Is this scripted?" | Replay → re-verify → identical `verdict_hash`. Then type a new prompt live |
| "Only 22 rules?" | Yes, deliberately: one line, curated, denominators shown. Point to the roadmap (real IRDAI ingestion, `pp_rule_dependency` / `pp_rule_parameter` tables already designed) |
| "Is this legal sign-off?" | No. It's a rule-graph verdict plus a named human reviewer, and the footer says so on every screen |

### Demo beat owners

| Beat (PRD §11) | Presenter |
|---|---|
| Hook + close | Shaurya |
| Live request + planner | Dhriti |
| Verification moment + tamper/bypass | Shaurya |
| Reviewer sign-off + deploy payload | Chinmay |
| Metrics + before/after + replay | Vaishnavi |
