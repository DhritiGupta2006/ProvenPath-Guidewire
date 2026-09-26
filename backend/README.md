# ProvenPath Verification Core (Track A)

This project contains the deterministic pre-commit compliance gate verification core for ProvenPath.

## Toolchain & Versions
- **Language**: Gosu 1.18.1 (`org.gosu-lang.gosu:gosu-core:1.18.1`, `gosu-core-api:1.18.1`)
- **Gradle Plugin**: `org.gosu-lang.gosu` version `8.2.1` (resolved from Gradle Plugin Portal)
- **JVM Target**: JDK 11 (`gradle:8.10-jdk11` inside Docker)
- **Libraries**:
  - Jackson Databind 2.15.3 + JSR310 (`jackson-datatype-jsr310`)
  - SnakeYAML 2.2
  - JGraphT Core 1.5.2
  - JUnit Jupiter 5.10.2

## Module Architecture
- `:contracts` (`provenpath.contracts`):
  - Canonical domain models (`Proposal`, `Clause`, `Citation`, `NodeResult`, `Verdict`, `Event`, `RegulatorySource`, `PcManifest`, `PcFile`, `PcTermRange`)
  - Domain enums (`ClauseKind`, `Layer`, `NodeStatus`, `VerdictStatus`)
  - Verification & event ports (`VerifyPort`, `EventPort`)
  - Shared JSON utility (`Json.gs`) with `PropertyNamingStrategies.LOWER_CAMEL_CASE` and recursion prevention for Gosu reflection proxies (`GosuObjectMixIn`).
- `:core` (`provenpath.core`):
  - Engine (`RuleLoader`, `RuleGraph` DAG with cycle detection & deterministic topological sort, `Selector`, `LogicEvaluator`, `BuiltinFunctions`)
  - Verification Layer Checks (`TypeCheck`, `RangeCheck`, `ConsistencyCheck`, `RuleMatchCheck`, `SourceCheck`, `GroundingCheck`)
  - Security Gate (`Gate`, `GateToken` HMAC-SHA256, `Hashing`)
  - JUnit 5 test suite (`CoreTests.gs`)
- `:eval` (`provenpath.eval`):
  - Benchmark evaluation runner (`RunEval.gs`) reading `eval/corpus/*.json` and writing `eval/metrics.json` at repo root.

## Building and Testing via Docker

Docker Desktop runs the build in a container with JDK 11 and Gradle 8.10:

```bash
# Run all unit and integration tests
bash backend/gradlew-docker.sh test

# Run the evaluation benchmark
bash backend/gradlew-docker.sh :eval:run
```

Or directly via Docker CLI (using MSYS_NO_PATHCONV=1 for Git Bash on Windows):
```bash
docker run --rm \
  -v "C:/Users/shaur/Documents/ProvenPathGuidewire:/work" \
  -v provenpath-gradle-cache:/home/gradle/.gradle \
  -w /work/backend \
  -e PROVENPATH_RULES_DIR=/work/rules \
  -e PROVENPATH_GATE_SECRET=test-secret \
  gradle:8.10-jdk11 \
  gradle test --no-daemon
```

`gradlew-docker.sh test` skips the `:app` integration tests (they need Postgres). The full suite runs against a throwaway PostgreSQL 16 container:

```bash
bash backend/test-with-db.sh              # core 34 + app 12 + eval 1 tests
bash backend/test-with-db.sh test :eval:run
```

## `:app`: the backend service (`provenpath.app`)
Javalin 5.6 on JDK 11. It's a single fat jar (`gradle :app:fatJar` → `app/build/libs/provenpath-app.jar`) and **needs a JDK at runtime, not a JRE**: the Gosu 1.18 runtime uses `jdk.compiler`.

| Package | What |
|---|---|
| `Main`, `Config`, `Services`, `Server`, `Seeder` | Startup, env config (localhost defaults), wiring, HTTP routes + SSE, idempotent seed (users, sources, rules) |
| `db` | `Db` (Hikari + Flyway), `Repository` (all SQL), `EmbeddedDb` (`DB_MODE=embedded`) |
| `events` | `EventBus` (append-only `pp_event_log`, per-execution seq, live fan-out), `ReplayingSubscriber` (subscribe → replay → live, no gaps or duplicates) |
| `services` | `VerifyService` (the only producer of verdicts; persists runs and nodes and streams them), `ExecutionService` (lifecycle), `ReviewService` (named reviewer gate), `DeploymentService` (write-path gate), `AgentService` (VM agent pull endpoints), `ToolService` (the 4 MCP tools), `QueryService` (detail, rules, replay, provenance, metrics) |
| `planner.FixturePlanner` | `LLM_MODE=fixture`: the recorded demo proposals through the **real** gate |

**Plug-in points** (loaded by class name, so `:app` never compiles against them):
- `PLANNER_CLASS` (default `provenpath.planner.Planner`, used when `LLM_MODE=live`) implements `PlannerPort`.
- `PACKAGE_BUILDER_CLASS` (default `provenpath.pcexport.PackageBuilder`) implements `PackageBuilderPort`. Until it exists, `POST /deployments` answers `503 exporter_unavailable`.

**Deploy gate:** a package is built and queued only if the execution is approved, the approved review targets a PASSED run with a gate token, the stored proposal still hashes to the verified `proposalHash`, the ruleset is unchanged, and the HMAC token verifies. A BLOCKED run can never produce a package.

**Run modes:**
- Laptops: `docker compose up --build` from the repo root (copy `.env.example` to `.env` first). Smoke test: `bash scripts/smoke.sh`.
- Guidewire VM (no Docker, no admin): `java -jar provenpath-app.jar` with `DB_MODE=embedded`. The jar starts its own PostgreSQL 16; data lives in `EMBEDDED_PG_DIR` (default `../.provenpath-pgdata`), port `EMBEDDED_PG_PORT` (default 5433). Verified natively on Windows with Temurin 11.0.32 as a non-admin user; the database is UTF8, so ₹ is safe.

| Env var | Default | |
|---|---|---|
| `PROVENPATH_GATE_SECRET` | *(required)* | HMAC key for gate tokens; the backend refuses to start without it |
| `PORT` | 8080 | |
| `DB_MODE` | external | `embedded` on the VM |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/provenpath` / provenpath / provenpath | external mode |
| `PROVENPATH_RULES_DIR` / `_FIXTURES_DIR` / `_EVAL_DIR` | `../rules` or `./rules` etc. | |
| `LLM_MODE` | fixture | `live` → `PLANNER_CLASS` |
| `PC_AGENT_KEY` | *(empty = agent endpoints return 503)* | Bearer token for `/api/v1/pc-agent/*` |
| `VERIFY_NODE_DELAY_MS` | 150 | Pacing of `verify.node` events for the UI animation |
| `AGENT_LONG_POLL_MS` | 25000 | |

API: plan §3 and `docs/events.md`. SSE clients must send `Accept: text/event-stream` (browsers' `EventSource` does); `Last-Event-ID` or `?after=N` resumes after seq N.

## Modules still to come
- `planner`: Gemini planner (Dhriti), see `team/DHRITI.md`
- `pcexport`, `pcagent`: PolicyCenter package builder and VM agent (Chinmay), see `team/CHINMAY.md`
