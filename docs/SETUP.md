# Setup: run and test ProvenPath (no Docker needed)

The same setup runs on your laptop and on the Guidewire VM: **JDK 11 + the Gradle wrapper + the backend's embedded PostgreSQL**. Docker is optional (see the end).

## 1. One-time
1. **JDK 11** (Gosu 1.18 builds on 11; JDK 17 has issues). Download the Temurin 11 **JDK** zip (not the JRE: the Gosu runtime needs `jdk.compiler`) from adoptium.net and unzip it anywhere. No admin needed.
   Set `PROVENPATH_JAVA_HOME` to that folder, or point `JAVA_HOME` at it in your terminal.
   On the Guidewire VM it's already installed: `C:\Users\Student\AppData\Local\Programs\temurin-11`. **Don't change the VM's global `JAVA_HOME`**; PolicyCenter uses Corretto.
2. **Node 20+** (for `web/`).
3. In the repo root: `cp .env.example .env` and set `PROVENPATH_GATE_SECRET` (any long random string).
   Also set `PC_AGENT_KEY`, and `GEMINI_API_KEY` for `LLM_MODE=live`.

## 2. Backend
| | Windows (cmd / PowerShell) | Git Bash / macOS / Linux |
|---|---|---|
| Run (builds the jar, starts it with its own embedded PostgreSQL) | `scripts\run-local.cmd` | `bash scripts/run-local.sh` |
| Stop cleanly (also stops the embedded PostgreSQL) | `scripts\stop-local.cmd` | `bash scripts/stop-local.sh` |
| Tests (core + app integration + eval; the app tests start their own embedded PostgreSQL) | `cd backend` then `gradlew.bat test` | `cd backend && ./gradlew test` |
| Eval metrics → `eval/metrics.json` | `gradlew.bat :eval:run` | `./gradlew :eval:run` |
| Smoke test of a running backend | Git Bash: `bash scripts/smoke.sh` (on the VM: `C:\Guidewire\Apps\Git\bin\bash.exe scripts/smoke.sh`) | `bash scripts/smoke.sh` |

- The backend listens on `PORT`, or `BACKEND_PORT` from `.env` (default 8080). If something else already uses 8080 (it did on one laptop: an Apache service), set `BACKEND_PORT=18080` in `.env`.
- The embedded database lives in `.provenpath-pgdata/` (gitignored) on a random free private port. After a crash or force-kill, the next start stops the orphaned Postgres automatically.
- The first Gradle run downloads Gradle 8.10.2 and the dependencies (a few minutes).

## 3. Frontend
`cd web && npm install && npm run dev`, with `NEXT_PUBLIC_API_URL=http://localhost:<backend port>`.
On the VM, add `--registry=https://registry.npmjs.org` to every npm command (the VM's `.npmrc` points at Guidewire's Artifactory).

## 4. Optional: Docker
If you prefer containers: `docker compose up --build` (Postgres 16 + backend), and `bash backend/test-with-db.sh` for tests against a Postgres container. Same code, same results. The Guidewire VM **cannot** run Docker, so the no-Docker path above is the one that must always work.
