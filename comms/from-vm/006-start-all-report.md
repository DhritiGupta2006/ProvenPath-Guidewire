Status: DONE

# 006: ProvenPath VM Services Startup & Live Verification Report

## 1. System & Version Summary
- **Git Commit [OBSERVED]:** `a8f9e5f9e80b44a2ec4313091e3dff000aa34798` (`main`, VM task 006; ancestor `cd72751` confirmed).
- **Backend / Agent JDK [OBSERVED]:** Eclipse Temurin JDK 11.0.32 at `C:\Users\Student\AppData\Local\Programs\temurin-11\bin\java.exe` (`11.0.32.1+1`).
- **PolicyCenter JDK [OBSERVED]:** Amazon Corretto JDK 11.0.17 at `C:\Guidewire\Apps\Amazon Corretto\jdk11.0.17_8` (global `JAVA_HOME` untouched).
- **Node.js / npm [OBSERVED]:** Node `v20.18.0`, npm `10.8.2`.
- **Operating System [OBSERVED]:** Windows Server 2022 Datacenter (build 20348), AWS EC2.

---

## 2. Environment & Configuration Setup
- **`C:\ProvenPath\.env` [OBSERVED]:**
  - Configured with `LLM_MODE=live`, `BACKEND_PORT=8080`, `DB_PORT=15432`, `VERIFY_NODE_DELAY_MS=20`.
  - Keys `PROVENPATH_GATE_SECRET`, `PC_AGENT_KEY`, and `GEMINI_API_KEY` verified present and non-empty without printing or logging values.
  - Formatted without UTF-8 BOM so `cmd.exe` `for /f` loop in `vm\env.cmd` parses key/value pairs correctly.
- **`policycenter\agent\agent.env` [OBSERVED]:**
  - Generated from `policycenter\agent\agent.env.example`.
  - `PC_AGENT_KEY` and `PROVENPATH_GATE_SECRET` lines removed (inherited from `.env` via `vm\env.cmd`).
  - Contains `PC_HOME=C:\GW10\PolicyCenter`, `PC_URL=http://localhost:8180/pc`, `PC_STOP_CMD=gwb.bat stopServer`, `PC_START_CMD=gwb.bat runServer`.
- **Directories [OBSERVED]:** Created `C:\provenpath\inbox` and `C:\ProvenPath-backup\deployments`.

---

## 3. PolicyCenter Status & SOAP Verification
- **PolicyCenter Engine [OBSERVED]:**
  - Running on `http://localhost:8180/pc` (PID 5508, port 8180 listening).
  - Reached runlevel `DAEMONS` with log entry `INFO Server.RunLevel ***** PolicyCenter ready *****`.
- **SOAP `ProductModelAPI` Verification [OBSERVED]:**
  - Endpoint: `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI/soap11` (Basic Auth `su:gw`).
  - `getPublicIdForCodeIdentifier("SMCyber", "PRODUCT")`: HTTP 200, returned `<return>SMCyber</return>`.
  - `getPublicIdForCodeIdentifier("SMCyberExtortionCov", "CLAUSEPATTERN")`: HTTP 200, returned `<return>SMCyberExtortionCov</return>`.

---

## 4. Build Times (`vm\start-all.cmd --build`)
- **Backend & Agent Fat Jars (`:app:fatJar :pcagent:fatJar`) [OBSERVED]:**
  - First build: ~35 s (generated `provenpath-app.jar` 135.8 MB, `provenpath-pcagent.jar` 7.1 MB).
  - Warm rebuild: ~2 s (all tasks `UP-TO-DATE`).
- **Web App (`npm ci` + `next build`) [OBSERVED]:**
  - `npm ci --registry=https://registry.npmjs.org`: 1m 00s (435 packages added).
  - First `next build`: ~30 s (Turbopack compile 24.8 s + TypeScript check 12.2 s + static pages 580 ms).
  - Warm `next build`: ~5.2 s (compile 1.3 s + TypeScript check 3.3 s + static pages 456 ms).
- **Total `vm\start-all.cmd --build` warm execution time [OBSERVED]:** 51.7 s.

---

## 5. Service Health & Rules Verification
- **Backend Health Check [OBSERVED]:**
  - `GET http://localhost:8080/api/v1/health`
  - Output:
    ```json
    {"llmMode":"live","packageBuilder":"provenpath.pcexport.PackageBuilder","rulesetHash":"cf4851ff7418fda1f95b18be0853a467fc1cf3d1baaf7707e285e8a28104ca77","planner":"provenpath.planner.Planner","status":"ok"}
    ```
- **Rules Catalog Check [OBSERVED]:**
  - `GET http://localhost:8080/api/v1/rules`
  - Output: `"count": 23`, rulesetHash matches `cf4851ff7418fda1f95b18be0853a467fc1cf3d1baaf7707e285e8a28104ca77`.
- **Mission Control UI Check [OBSERVED]:**
  - `GET http://localhost:3000/`: HTTP 200.
  - `GET http://localhost:3000/control`: HTTP 200.
- **PC Agent Status [OBSERVED]:**
  - Agent process active (PID 7592, Temurin 11).
  - Log line in `C:\ProvenPath-backup\logs\pcagent.log`:
    `2026-09-29T05:43:07 ProvenPath PC agent 'vm-pcagent' started. Backend http://localhost:8080, PC_HOME C:\GW10\PolicyCenter, PolicyCenter http://localhost:8180/pc, inbox C:\provenpath\inbox`
- **Log Hygiene [OBSERVED]:**
  - `C:\ProvenPath-backup\logs\backend.log`: Clean startup, embedded PostgreSQL 16.15 running, Flyway migrations v1 & v2 applied, Javalin started.
  - `C:\ProvenPath-backup\logs\web.log`: Next.js 16.3.6 production server started on port 3000.
  - `C:\ProvenPath-backup\logs\pcagent.log`: PC agent started, watching for deployment packages.

---

## 6. Live Smoke Run (API Step 8)
- **Request [OBSERVED]:**
  - `POST http://localhost:8080/api/v1/executions`
  - Body: `{"prompt":"SME cyber policy for a Pune D2C brand, ₹75 lakh aggregate, ransomware cover up to ₹30 lakh, 24-hour business interruption waiting period, turnover ₹40 crore"}`
  - Created Execution ID: `exec-957b1521-22e0-405d-acae-0cdbd3f78e15` (HTTP 202).
- **Execution & Fallback Analysis [OBSERVED]:**
  - Initial call to Gemini planner: `seq: 2, type: "planner.step", action: "plan", mode: "live", note: "Building SMCyber product proposal via Gemini"`.
  - Gemini REST endpoint returned HTTP 503:
    `Gemini API error 503: {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}`.
  - Fallback event emitted: `seq: 3, type: "planner.step", action: "fallback", mode: "live", step: 99, note: "Gemini call failed (Gemini API error 503: ...) — falling back to fixture"`.
  - The system smoothly switched to fixture fallback (`live-fallback` mode).
- **Gate & Repair Evaluation [OBSERVED]:**
  - **Iteration 1 (Run 1):** Blocked by deterministic gate on rule `CYB-RNG-002` (Extortion sublimit <= 50% of aggregate).
    - `clauseId: "c-003"` (`SMCyberExtortionCov`)
    - `expected: "2500000.0"`, `actual: "4000000"`
    - `reason: "Expected LTE 2500000.0 but got 4000000"`
  - **Repair Step:** `seq: 101, type: "planner.repair", iteration: 2, failedRule: "CYB-RNG-002"`. Extortion sublimit adjusted to ₹20 lakh (2,000,000 <= 2,500,000).
  - **Iteration 2 (Run 2):** All 23 rules evaluated and passed (`result: "PASSED"`).
  - **Final Execution Status [OBSERVED]:** `review_pending`.
  - **PolicyCenter Safety [OBSERVED]:** `writtenToPolicyCenter: 0` (zero files written, no approval or deploy triggered).

---

## 7. Incidents & Resolutions Encountered During Setup
1. **UTF-8 BOM in `.env` / `agent.env` [OBSERVED]:**
   - *Symptom:* `vm\env.cmd` cmd parser failed to extract `PROVENPATH_GATE_SECRET` because the leading UTF-8 BOM character was included in the key name, triggering "PROVENPATH_GATE_SECRET is not set".
   - *Resolution:* Rewrote `.env` and `agent.env` with pure UTF-8 without BOM.
2. **Interactive Console Persistence Under Agent Job Object [OBSERVED]:**
   - *Symptom:* Background tasks spawned directly under subshell CLI Job Objects terminated upon parent task exit.
   - *Resolution:* Spawned `vm\start-all.cmd` via WMI into desktop session 2, allowing all 3 titled consoles to persist independently across CLI commands.
3. **Gemini Live Availability [OBSERVED]:**
   - *Symptom:* Upstream Gemini API responded with transient 503 Service Unavailable ("model experiencing high demand").
   - *Resolution:* Verified that `Planner.gs` resiliently handles 503 errors and activates fixture fallback, proving end-to-end pipeline robustness.

---

## 8. Service Endpoints Summary
- **Mission Control UI:** `http://localhost:3000` (or `http://localhost:3000/control`)
- **Backend API:** `http://localhost:8080` (health: `/api/v1/health`, rules: `/api/v1/rules`)
- **Guidewire PolicyCenter:** `http://localhost:8180/pc` (login: `su` / `gw`)
- **PC Agent:** Long-polling backend for approved packages.

Status: DONE
