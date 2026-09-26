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

## Future Modules
- `app`: Javalin API, Flyway, SSE (Shaurya)
- `planner`: Gemini planner (Dhriti)
- `pcexport`: PolicyCenter export (Chinmay)
- `pcagent`: PolicyCenter agent (Chinmay)
