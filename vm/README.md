# vm/ — running ProvenPath on the Guidewire VM

All native, all on localhost, no admin, no Docker, no Windows services. Run from a normal `cmd` console in the repo (`C:\ProvenPath`).

| Script | What it does |
|---|---|
| `start-all.cmd [--build]` | Builds the jars and the web app the first time (or with `--build`), then starts the backend (:8080, embedded PostgreSQL in `C:\ProvenPath-tools\pgdata`), Mission Control (`next start` :3000) and the PC agent, each in its own titled console. Anything already running is left alone, so it is safe to re-run. |
| `stop-all.cmd` | Stops the agent, the web app and the backend (gracefully, so the embedded PostgreSQL stops too; force only as a fallback). **PolicyCenter keeps running.** Consoles are closed by their command line, never by window title. |
| `env.cmd` | Shared settings: Temurin 11 for our processes only (`PROVENPATH_JAVA_HOME`, default `%LOCALAPPDATA%\Programs\temurin-11`), PolicyCenter's own `JAVA_HOME` kept as `PC_JAVA_HOME`, `.env` loaded, ports, log folder `C:\ProvenPath-backup\logs`. |
| `run-backend.cmd`, `run-web.cmd`, `run-agent.cmd` | What each console runs (called by `start-all.cmd`). |

## First time on the VM
```
cd C:\ProvenPath
git pull
copy .env.example .env                                        (secrets, GEMINI_API_KEY, LLM_MODE=live)
copy policycenter\agent\agent.env.example policycenter\agent\agent.env
vm\start-all.cmd --build
```
npm on the VM always uses `--registry=https://registry.npmjs.org` (the script does). `web` is built with `NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%`.

## Logs
`C:\ProvenPath-backup\logs\backend.log`, `web.log`, `pcagent.log`, `pc-server-*.log` (PolicyCenter output when the agent restarts it), `pc-stop-*.log`. Backups of every deployment: `C:\ProvenPath-backup\deployments\`.

## Do not
Change the global `JAVA_HOME`, reboot, or run these scripts on a laptop (they open consoles and manage processes; on laptops use `scripts\run-local`).
