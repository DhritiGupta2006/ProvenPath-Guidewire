# VM final integration: prompt for Claude Code on the Guidewire VM

**When:** Day 2, 11:30, after **CP4a** (`main` is laptop-complete and tagged `v0.9-laptop`).
**Who:** Chinmay drives. Everyone else stays on call and fixes bugs on their laptops, then pushes to `main`.
**Where:** a terminal on the VM, inside `C:\ProvenPath`, running `claude` (already installed; log in first).
**Before starting:** `gh auth login` with a fine-grained token scoped to this repo only. Put secrets in `C:\ProvenPath\.env` and `policycenter\agent\agent.env` by hand; never commit them.

Paste this into Claude Code on the VM:

```
You are doing the FINAL INTEGRATION of ProvenPath on the Guidewire-provided Windows VM. Repo: C:\ProvenPath (public GitHub repo shauryaaojha/ProvenPath-Guidewire). READ FIRST: 12_BUILD_PLAN_2_DAYS.md (§0, §2, Day 2), docs/policycenter.md (VM facts), team/CHINMAY.md, backend/README.md, policycenter/README.md, policycenter/agent/README.md.

VM FACTS: Windows Server 2022, user Student (NOT admin: no services, no Windows features, no Docker). PolicyCenter 10.2.1.1711 at C:\GW10\PolicyCenter, Gosu 1.14.26, start `gwb.bat runServer`, stop `gwb.bat stopServer`, http://localhost:8180/pc, su/gw. PC's JDK = Corretto 11 via the global JAVA_HOME — NEVER change the global JAVA_HOME. Our JDK = Temurin 11 at C:\Users\Student\AppData\Local\Programs\temurin-11 (set JAVA_HOME only inside our scripts/sessions). Node 20 + npm installed; the VM's .npmrc points at Guidewire Artifactory, so ALWAYS pass --registry=https://registry.npmjs.org. Backup of modules/configuration: C:\ProvenPath-backup\configuration-20260926-1918. Outbound internet works; no inbound. Everything runs natively here and talks over localhost.

HARD RULES
- Never commit Guidewire files, PC jars, the backup, .env or agent.env. Before any commit run `git status` and `git diff --cached --name-only` and make sure nothing from C:\GW10 or any secret is staged. No AI co-author lines in commits.
- Only change files under C:\GW10\PolicyCenter\modules\configuration through the ProvenPath agent's deploy (or explicitly documented manual steps from policycenter/README.md). If PC breaks, restore from the backup (stop PC, robocopy /MIR from the backup) and report.
- Fix bugs in our code in small commits on a branch `vm/integration`, push, and open a PR to main. Tell me which teammate owns each broken area (Shaurya: backend/app/core/eval, Chinmay: pcexport/pcagent/policycenter, Dhriti: planner/rules/MCP, Vaishnavi: web) when a fix is big.
- Keep a running log in C:\ProvenPath-backup\INTEGRATION_LOG.md (outside the repo): each step, command, result, timing.

STEPS
1. `git pull` on main and check out the tag v0.9-laptop (or main if newer and green). Build the backend with the Gradle wrapper under Temurin 11: `backend\gradlew.bat test` then build the app + agent jars. All tests must pass here too.
2. Database: NOTHING to install. The backend runs with DB_MODE=embedded (EMBEDDED_PG_DIR=C:\ProvenPath-tools\pgdata, EMBEDDED_PG_PORT=5433): it starts its own private PostgreSQL 16 from binaries inside the jar, as Student, and never touches PolicyCenter's H2 database. The first start extracts the binaries (~20 s); check for the log line "Embedded PostgreSQL running".
3. Web: `npm ci --registry=https://registry.npmjs.org` and `npm run build` in web/, with NEXT_PUBLIC_API_URL=http://localhost:8080.
4. Start everything with `vm\start-all.cmd` (backend :8080, web :3000, agent). Check: GET http://localhost:8080/health, http://localhost:3000 loads, the agent logs "polling".
5. PC: start it with gwb.bat runServer if it isn't running; wait for http://localhost:8180/pc; record the boot time.
6. Fixture run first (LLM_MODE=fixture): from Mission Control, run the demo prompt → BLOCKED on CYB-RNG-002 → repaired → PASSED → approve as "A. Mehta — Compliance Reviewer" → Deploy to PolicyCenter. Watch pc.pulled → pc.write → pc.restart → pc.ready → pc.verified. Record the restart time.
7. Verify in real PC (browser on the VM): log in su/gw → New Submission → product SMCyber → the SMCyber coverages and terms match the approved clauses. Then enter an extortion limit above the verified max → PC must reject it with the ProvenPath CYB-RNG-002 message. If the PC-side gate doesn't compile or register, read PC's server log, fix it in policycenter/ (Gosu 1.14.26, PC APIs only), redeploy.
8. Negative checks: (a) a BLOCKED run produces no package and nothing changes under modules/configuration (compare file hashes before and after); (b) drop a tampered package zip into C:\provenpath\inbox → the agent refuses it with pc.failed "tampered package" and PC is untouched; (c) Tamper button → SOURCE-layer block; (d) Replay → identical verdict hash.
9. Live mode (LLM_MODE=live, GEMINI_API_KEY in .env): run the demo prompt 3 times; it must reach PASSED within 2 repair iterations each time. If flaky, record the best run as the fixture (Dhriti's procedure).
10. Run the full demo script from the plan end to end 3 times, timing each beat. Write the results, timings, open bugs and the final state (which tag/commit is deployed, PC state) into INTEGRATION_LOG.md, and summarise them for me.
```

## Full-testing checklist (14:00–16:00)
- [ ] Fixture mode: BLOCKED → repair → PASSED → approve → deploy → SMCyber visible in PC
- [ ] Live mode ×3: PASSED within 2 iterations each time
- [ ] PC-side gate rejects an over-limit value, citing the rule code
- [ ] BLOCKED writes 0 files (hash check on `modules/configuration`)
- [ ] Tampered package refused by the agent
- [ ] Tamper button → SOURCE block · Replay → identical hash
- [ ] Metrics panel: false-pass 0 / N shown with the denominator
- [ ] Deploy and restart time measured; known-good pre-deployed state saved
- [ ] `git status` on the VM is clean; no Guidewire files or secrets committed
