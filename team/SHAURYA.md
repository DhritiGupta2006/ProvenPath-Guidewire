# Shaurya — Track A: Verification Core + Backend App (Gosu) · Tech lead

**Branch:** `track-a/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `backend/contracts`, `backend/core`, `backend/eval`, `backend/app`, `fixtures/`, `docs/events.md`

> **Status:** agy is building the first cut of `:contracts`, `:core`, `:eval`, the rules seed and the fixtures on branch `track-a/core`. Your first job on Day 1 is to review it, get it green, and merge it.

## Checklist
- [ ] **D1 09:00–10:30:** agy's Track A output builds and tests green in Docker. Freeze contracts. Push to `main` (**CP0**)
- [ ] **D1 10:30–13:30:** `:app`: Javalin, Flyway `V1__init.sql` (8 tables + append-only trigger), DAO, seed loader
- [ ] **D1 14:00–18:00:** event bus + SSE (subscribe-then-replay), REST routes, `VerifyService` emitting `verify.node`
- [ ] **D1 18:00 CP2:** fixture run → gate → SSE → UI turns red on CYB-RNG-002
- [ ] **D1 19:00–23:00:** review state machine, `/replay`, `/provenance`, `/metrics`, planner wiring through ports
- [ ] **D2 09:30–12:30:** `RunEval` → `metrics.json`, false-pass = 0, determinism ×50. Help Chinmay map RANGE rules → PC `termRanges`
- [ ] **D2 13:30–15:00:** grounding hardening, tamper test, 100% provenance
- [ ] **D2 17:00:** backup video, code freeze, tag `v1.0-demo`

## Prompt for your coding agent

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan, follow exactly), team/SHAURYA.md, 07_GOSU.md, PROVENPATH_DATABASE_ARCHITECTURE.md, rules/README.md, docs/events.md.

STACK: backend in GOSU on JDK 11 (Gradle multi-module, gradle-gosu-plugin), frontend Next.js, REAL Guidewire PolicyCenter 10 (no mock), everything via Docker, NO Python. Gosu is not Java: .gs files, `uses`, `var x : Type`, `function`, `construct()`, blocks `\ x -> ...`. Never write .java files. Build/test inside Docker: `bash backend/gradlew-docker.sh test` (gradle:8.x-jdk11 image).

I own TRACK A: verification core + backend app. Principle: the LLM never produces a compliance verdict; deterministic Gosu code does.

1. Verification core (first cut already on branch track-a/core — review, fix, get all tests green): :contracts (Proposal, Clause, Citation, NodeResult, Verdict, Event, PcManifest, VerifyPort, EventPort, Json canonical), :core (RuleLoader, JGraphT RuleGraph, LogicEvaluator with value_ref grammar "<path> [* <number>]" and no eval, BuiltinFunctions, abstract Check + Type/Range/Consistency/RuleMatch/Source/Grounding checks, Gate all-or-nothing where FAILED or NEEDS_REVIEW → BLOCKED, Hashing, HMAC GateToken), :eval RunEval → eval/metrics.json. Tests: blocked fixture → BLOCKED on CYB-RNG-002 with CYB-CON-001 SKIPPED; fixed fixture → PASSED with valid token; tamper → SOURCE block; injected "compliant": true ignored; NEEDS_REVIEW blocks; grounding mismatch fails; 50 runs → same verdictHash; false-pass = 0.

2. :app module (package provenpath.app), depends on contracts, core, planner, pcexport (Chinmay owns :pcexport, :pcagent and the /pc-agent endpoints — coordinate):
- Javalin 5.6.x Main on :8080, CORS for http://localhost:3000.
- Flyway 9.x V1__init.sql with the 8 tables in plan §4 + a trigger raising on UPDATE/DELETE of pp_event_log. JDBC + HikariCP DAO. Seed on startup: users "A. Mehta — Compliance Reviewer", "PM Demo"; rules/sources.yaml + rules/rules/*.yaml → DB.
- Event bus implementing EventPort: insert pp_event_log with monotonic seq per execution → publish to subscribers.
- SSE GET /api/v1/executions/{id}/stream: subscribe-then-replay (history from seq 0, then live, no gaps/dupes).
- Routes per plan §3: POST /executions {prompt} (runs planner async), GET /executions/{id}, POST /verify, POST /tools/{name}, GET /rules, POST /reviews (comment required on reject), POST /deployments (builds + queues the PC package via :pcexport; must be refused unless gate token valid AND review approved), GET /pc-agent/next + POST /pc-agent/status (bearer PC_AGENT_KEY, pull model — the agent on the Guidewire VM calls us), GET /deployments/{id}, POST /executions/{id}/replay → {verdictHash, originalHash, match}, GET /provenance/{clauseId}, GET /metrics.
- VerifyService implements VerifyPort: persist run + nodes + rule_logic_snapshot, emit verify.node in topological order ~150ms apart.
- Review state machine: verified_pass → review_pending → approved/rejected → deployed, each transition an event.
- backend/Dockerfile multi-stage eclipse-temurin:11-jdk → 11-jre.
- Keep :planner and :pcexport depending ONLY on :contracts (compile-time boundary).
- Config ONLY from env vars with localhost defaults (DB_URL, PROVENPATH_RULES_DIR, GEMINI_API_KEY, PROVENPATH_GATE_SECRET, PC_AGENT_KEY): the same jar runs in Docker on laptops AND natively on the Guidewire VM (Temurin 11, portable Postgres, no Docker). Build a runnable fat jar for :app.

Rules: merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 12:30, 15:00 freeze). main must always run `docker compose up --build`. No AI co-author lines in commits. The repo is PUBLIC — never commit Guidewire/PolicyCenter files, jars or images. Rule values are curated/illustrative, not legal advice.
```
