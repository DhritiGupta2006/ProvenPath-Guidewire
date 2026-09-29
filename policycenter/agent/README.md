# PC agent

`backend/pcagent` → `backend/pcagent/build/libs/provenpath-pcagent.jar` (build: `cd backend && ./gradlew :pcagent:fatJar`).

Runs on the PolicyCenter machine as the normal user, from a console (never a Windows service):

```
java -jar backend\pcagent\build\libs\provenpath-pcagent.jar policycenter\agent\agent.env
```

On the VM, `vm\start-all.cmd` starts it (with Temurin 11 for the agent and PolicyCenter's own JDK passed as `PC_JAVA_HOME` for `gwb.bat`).

## Configuration
Copy `agent.env.example` to `agent.env` (gitignored). Environment variables override the file, so `PC_AGENT_KEY` and `PROVENPATH_GATE_SECRET` can also come from the repo's `.env` (as `vm\env.cmd` does). Keys: `BACKEND_URL`, `PC_AGENT_KEY`, `PROVENPATH_GATE_SECRET`, `AGENT_NAME`, `PC_HOME`, `PC_URL`, `PC_USER`, `PC_PASSWORD`, `PC_STOP_CMD`, `PC_START_CMD`, `PC_JAVA_HOME`, `PC_READY_TIMEOUT_MIN`, `PC_ALWAYS_RESTART`, `INBOX_DIR`, `BACKUP_DIR`, `LOG_DIR`.

## What it does with each package
1. **Pull**: long-polls `GET /api/v1/pc-agent/next` (bearer `PC_AGENT_KEY`); also installs zips dropped into `INBOX_DIR`.
2. **Verify**: manifest HMAC, gate token recomputed from `runId|proposalHash|rulesetHash`, every file's SHA-256, no unlisted file, only product-model paths (+ the display-name fragment and `pc-edits.json`). Any failure: "Tampered package refused", nothing written.
3. **Back up** every file it may touch to `BACKUP_DIR\<deployment>-<time>\before\`.
4. **Write** only files whose bytes change; merge the marked display-name block in `productmodel.display.properties` (keeps CRLF); apply `pc-edits.json` idempotently. Errors roll back.
5. **Restart** only if something changed (or PolicyCenter is down): `PC_STOP_CMD`, then `PC_START_CMD` in the background with output in `LOG_DIR\pc-server-*.log`; progress every 30 s.
6. **Confirm** via ProductModelAPI (SOAP, pc1000): the product, each coverage pattern, each capped cov term.
7. **Report** each step to `POST /api/v1/pc-agent/status` → `pc.write`, `pc.restart`, `pc.ready`, `pc.verified` / `pc.failed` in Mission Control.

Stopping the agent (`vm\stop-all.cmd`) never stops a PolicyCenter it started.

## Tests
`./gradlew :pcagent:test`: the full loop on a temp `PC_HOME` (install, idempotent re-deploy, tampered file, edited manifest, wrong secret, path attacks, wrong run, PolicyCenter not coming up). The tests use a local HTTP responder for ProductModelAPI; that is test configuration, not part of the product.
