# Briefing for the agent on the Guidewire VM (status + how we work)

You did the VM prior setup earlier (report: `C:\ProvenPath-backup\VM_REPORT.md`). This is what happened since, how the team works, and one small task for you now.

## What ProvenPath is
AI proposes an SME Cyber insurance product config, and a **deterministic Gosu rule-graph** verifies it:
- **23** curated IRDAI-style rules across 5 layers plus a grounding check;
- **all-or-nothing**: any failure BLOCKS, and nothing reaches PolicyCenter;
- a **named Compliance Reviewer** approves;
- only then is a signed package deployed into the real PolicyCenter on this VM.

The LLM never decides compliance.

## Decisions made (because of your report)
- **No Docker on this VM**, and college Wi-Fi blocks tunnels and port forwarding. So **GitHub is the only link**: the team builds on laptops and pushes; this VM runs `git pull` and runs everything **natively over localhost**.
- **No Postgres install needed.** The backend jar starts its **own private embedded PostgreSQL 16** (`DB_MODE=embedded`, as the normal user, on a random free port, data in `.provenpath-pgdata/`). It **never touches PolicyCenter's H2 database**.
- **Docker is optional everywhere.** The standard way is JDK 11 + the Gradle wrapper + embedded Postgres, exactly how this VM will run it. Setup: `docs/SETUP.md`.
- PolicyCenter is only the **destination**. Nothing we build runs inside PC except (maybe, as a stretch goal) a small Gosu validation check. A small **ProvenPath PC agent** (a Java process, built by teammate Chinmay) will pull approved packages from our backend on localhost, re-verify their signatures, write the SMCyber product files into `C:\GW10\PolicyCenter\modules\configuration`, restart PC, and confirm via ProductModelAPI.

## Done so far (all on `main`, all tests green)
- **Verification core (Gosu 1.18.1, JDK 11):** rule loader, rule DAG, 6 checks, all-or-nothing gate, HMAC gate token. Eval: 12 labelled cases, **0/6 false-pass, 0/6 false-block**.
- **Backend service (`backend/app`):**
  - REST API and live SSE event stream;
  - append-only audit log;
  - the demo flow in `LLM_MODE=fixture`: blocked on CYB-RNG-002 → repaired → passed → review → approved;
  - a deploy gate that re-checks the proposal hash, the ruleset hash and the gate token;
  - pull endpoints for the PC agent, replay (identical hash), provenance, metrics, and the 4 MCP tools.
- **Tests:** 47 pass (core 34, app 12 with a real embedded Postgres, eval 1), verified **natively on Windows with Temurin 11.0.32 (the same build as this VM)**.
- **Scripts:** `scripts\run-local.cmd` (build + start backend), `scripts\stop-local.cmd` (clean stop), `bash scripts/smoke.sh` (end-to-end check).

## Still in progress (other teammates, on laptops)
- Dhriti: Gemini planner + MCP route.
- Vaishnavi: the Next.js Mission Control UI.
- Chinmay: the PolicyCenter package builder + the PC agent + the `vm\start-all.cmd` scripts.
- Day 2: the final merge and full testing happen **on this VM** via `team/VM_INTEGRATION.md`.

## Your task now: a backend dry run on this VM (no PolicyCenter involved)
Goal: prove the no-Docker backend builds, tests and runs here **today**, so Day 2 has no surprises.

HARD RULES (same as before):
- Do NOT touch anything under `C:\GW10`.
- Do NOT start or stop PolicyCenter.
- Do NOT change the global `JAVA_HOME`.
- Do NOT log in anywhere.
- Do NOT commit or push.
- Do NOT reboot.

Steps:
1. `cd C:\ProvenPath` then `git pull` (the repo is public; no login needed).
2. In **this terminal session only**: `set PROVENPATH_JAVA_HOME=C:\Users\Student\AppData\Local\Programs\temurin-11` and `set JAVA_HOME=%PROVENPATH_JAVA_HOME%`.
3. `copy .env.example .env`, then edit `.env`:
   - `PROVENPATH_GATE_SECRET` = any long random string;
   - `PC_AGENT_KEY` = any string;
   - keep `LLM_MODE=fixture`;
   - `BACKEND_PORT=8080` (pick another if 8080 is busy).
   `.env` is gitignored; never commit it.
4. `cd backend` then `gradlew.bat test --no-daemon`. Record the pass/fail counts from `backend\*\build\test-results\test\*.xml`, and how long the first Gradle download took.
5. `cd ..` then start `scripts\run-local.cmd` in its own console window. Wait for the log line "Ruleset … (23 rules)". Then `curl http://localhost:8080/api/v1/health`.
6. If Git Bash exists (`C:\Guidewire\Apps\Git\bin\bash.exe`): run `bash scripts/smoke.sh`. Otherwise use `curl` to:
   - `POST /api/v1/executions` with body `{"prompt":"Cyber insurance for Indian startups, up to 50L coverage"}`;
   - wait about 20 s, then `GET /api/v1/executions/<id>` and expect `status = review_pending`;
   - `POST /api/v1/executions/<id>/replay` and expect `match = true`.
7. `scripts\stop-local.cmd`. Confirm no `postgres.exe` whose command line contains `provenpath-pgdata` is still running.
8. Append the results to `C:\ProvenPath-backup\VM_REPORT.md` under a heading "Backend dry run (Day 0)": the test counts, first-build time, backend start time, smoke results, any errors with their exact messages, and anything that differed from `docs/SETUP.md`. Then print a short summary.

If a step fails, don't work around it by changing our code. Record the exact error and continue with the next step where possible.
