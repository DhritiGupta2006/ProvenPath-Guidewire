# 006: Pull, install and start all ProvenPath services on the VM

**Goal:** the latest `main` runs natively on this VM: backend :8080 (live Gemini planner, real package builder), Mission Control :3000, and the PC agent next to the real PolicyCenter. A human will then create a new product in Mission Control and deploy it into PolicyCenter. You only prepare and verify; you do **not** approve or deploy anything.

**Allowed to commit:** only `comms/from-vm/006-start-all-report.md`.

READ FIRST: `README.md`, `vm/README.md`, `policycenter/agent/README.md`, `docs/policycenter.md`, `comms/README.md` (evidence rule: mark every claim **[OBSERVED]** or **[INFERRED]**; end with `Status: DONE | PARTIAL | BLOCKED`).

## Hard rules
- Never print, log or commit secrets (`.env`, `agent.env`, keys). Never commit `.env` or `agent.env`.
- Never change the global `JAVA_HOME`; no reboot, no admin, no Windows services.
- Do **not** modify `C:\GW10\PolicyCenter` yourself. Only the ProvenPath PC agent writes there, and only when the human clicks Deploy (it backs everything up first).
- npm always with `--registry=https://registry.npmjs.org`.
- Run the `vm\*.cmd` scripts from a normal `cmd` console; they open titled consoles (expected on the VM).

## Steps
1. `cd C:\ProvenPath`, `git status`, `git pull`. Must be at commit `cd72751` or later. If there are local changes, stop and report them; discard nothing.
2. Check that `C:\ProvenPath\.env` exists (the human creates it). Check **only that these keys are non-empty, without printing values**: `PROVENPATH_GATE_SECRET`, `PC_AGENT_KEY`, `GEMINI_API_KEY`, `LLM_MODE` (must be `live`), `BACKEND_PORT` (must be `8080`). If anything is missing, stop and say which key.
3. If `policycenter\agent\agent.env` doesn't exist, create it from `policycenter\agent\agent.env.example`. **Remove** its `PC_AGENT_KEY` and `PROVENPATH_GATE_SECRET` lines (they come from `.env` via `vm\env.cmd`). Keep `PC_HOME=C:\GW10\PolicyCenter`, `PC_URL=http://localhost:8180/pc`, `PC_STOP_CMD=gwb.bat stopServer`, `PC_START_CMD=gwb.bat runServer`. Create `C:\provenpath\inbox` and `C:\ProvenPath-backup\deployments` if missing.
4. Confirm `%LOCALAPPDATA%\Programs\temurin-11\bin\java.exe` exists (otherwise set `PROVENPATH_JAVA_HOME` for this console only), and that `node -v` is 20.x.
5. Make sure PolicyCenter is running: `http://localhost:8180/pc` answers. If not, start it the usual way (`cd C:\GW10\PolicyCenter && gwb.bat runServer` in its own console) and wait for `PolicyCenter ready`. Confirm via ProductModelAPI SOAP (pc1000, basic su/gw): `getPublicIdForCodeIdentifier` for `SMCyber` (PRODUCT) and `SMCyberExtortionCov` (CLAUSEPATTERN).
6. Run `vm\start-all.cmd --build`. It builds the backend and PC agent jars (Gradle wrapper, Temurin 11), runs `npm ci` + `next build` for the web, then starts backend :8080, web :3000 and the PC agent. The first build takes several minutes.
7. Verify:
   - `curl http://localhost:8080/api/v1/health` shows `"llmMode":"live"`, `"planner":"provenpath.planner.Planner"`, `"packageBuilder":"provenpath.pcexport.PackageBuilder"` and a `rulesetHash`.
   - `curl http://localhost:8080/api/v1/rules` shows `"count":23`.
   - `http://localhost:3000` and `http://localhost:3000/control` load.
   - The "ProvenPath PC agent" console shows `ProvenPath PC agent 'vm-pcagent' started ...` with `PC_HOME C:\GW10\PolicyCenter`.
   - `C:\ProvenPath-backup\logs\backend.log`, `web.log`, `pcagent.log` have no errors.
8. One live smoke run through the API (**do not approve, do not deploy**): `POST http://localhost:8080/api/v1/executions` with body
   `{"prompt":"SME cyber policy for a Pune D2C brand, ₹75 lakh aggregate, ransomware cover up to ₹30 lakh, 24-hour business interruption waiting period, turnover ₹40 crore"}`.
   Poll `GET /api/v1/executions/{id}` until the status is `review_pending`, `blocked` or `error`, then read `GET /api/v1/executions/{id}/stream` (header `Accept: text/event-stream`). Report whether any `planner.step` has `action: "fallback"` (meaning Gemini was not used) and its note, the number of iterations, and which rules blocked (if any).
9. Leave everything running. Write `comms\from-vm\006-start-all-report.md` with: versions (git commit, java, node), build times, health output, rule count, PolicyCenter state and SOAP result, the smoke-run result, any errors with exact messages. Run `bash scripts/vm-check-staged.sh` before committing, commit **only** that file, push. Then print a short summary for the human with the URLs: Mission Control `http://localhost:3000`, PolicyCenter `http://localhost:8180/pc`.
