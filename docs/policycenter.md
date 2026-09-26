# PolicyCenter on the Guidewire cloud VM: facts & runbook

Source: the VM setup report (Day 0). The hostname and credentials are deliberately left out of this public repo.

## The VM
| | |
|---|---|
| Host | AWS EC2, **Windows Server 2022 Datacenter** (build 20348), 4 vCPU |
| RAM / disk | 31 GB total, ~17.5 GB free with PC stopped · C: 65 GB free |
| User | `Student`, **not an administrator**: no services, no Windows features, no Docker |
| Docker | **Not possible** (Windows Server SKU + no admin + no WSL distro) |
| Outbound network | Direct, no proxy. GitHub, Docker Hub, npm, Maven Central, Gradle plugins, Gemini and Anthropic are all reachable. No inbound |
| npm | The global `.npmrc` points at Guidewire's internal Artifactory, so always use `--registry=https://registry.npmjs.org` |

## PolicyCenter
| | |
|---|---|
| Version | **10.2.1.1711** (platform 10.201.1, Studio 6.0.x) |
| Gosu | **1.14.26**: anything we put *inside* PC must target this version and PC APIs only |
| Location | `C:\GW10\PolicyCenter` (not a git repo) |
| Start / stop | `C:\GW10\PolicyCenter\gwb.bat runServer` / `gwb.bat stopServer` · Studio: `gwb.bat studio` |
| URL / login | `http://localhost:8180/pc` · `su` / `gw` |
| JDK | Amazon Corretto 11.0.17 at `C:\Guidewire\Apps\Amazon Corretto\jdk11.0.17_8` (global `JAVA_HOME`, **don't change it**) |
| State at setup | Stopped |
| Boot time / restart time | **TODO (Chinmay, Day 1):** measure |
| ProductModelAPI WSDL | **TODO (Chinmay):** exact URL under `/pc/ws/...` |

## Backup (done)
`C:\GW10\PolicyCenter\modules\configuration` → `C:\ProvenPath-backup\configuration-20260926-1918` (150,717 files, 937 MB, verified identical).
Restore: stop PC, then `robocopy C:\ProvenPath-backup\configuration-20260926-1918 C:\GW10\PolicyCenter\modules\configuration /MIR`.

## Tools installed for `Student`
Git 2.37 (pre-existing) · Temurin JDK 11.0.32 at `C:\Users\Student\AppData\Local\Programs\temurin-11` (**used by our stack and agent**) · Node 20.18 / npm 10.8 · gh 2.60 · Claude Code 2.1.197 · repo clone at `C:\ProvenPath`.
Logins (`gh auth login` with a repo-scoped fine-grained token, and `claude`) are done manually.

## How ProvenPath talks to PC: no tunnel, no port forwarding
College Wi-Fi blocks tunnels and port forwarding, and the VM can't run Docker. So:

```
LAPTOPS (dev mode)                    GitHub                  VM (integration + demo, all native, all localhost)
docker compose up (db, backend, web) ── push ─► main ─ pull ─► vm\start-all.cmd
agent tested against a local folder                            ├─ (PostgreSQL 16 embedded in the backend jar: DB_MODE=embedded, :5433, data in C:\ProvenPath-tools\pgdata)
                                                               ├─ backend jar, Temurin 11  :8080
                                                               ├─ web (next start)         :3000
                                                               ├─ pcagent ─► long-poll localhost:8080 → verify HMAC + sha256
                                                               │             → write overlay into C:\GW10\PolicyCenter\modules\configuration
                                                               │             → gwb.bat stopServer / runServer → ProductModelAPI → report
                                                               └─ PolicyCenter 10          :8180/pc
```
- **GitHub is the only link** between the laptops and the VM.
- Build everything on laptops first. The final merge, the real PC connection and full testing happen on the VM via Claude Code: see `team/VM_INTEGRATION.md`.
- **VM config (never committed):**
  - `C:\ProvenPath\.env`: DB, `GEMINI_API_KEY`, `PROVENPATH_GATE_SECRET`, `PC_AGENT_KEY`.
  - `C:\ProvenPath\policycenter\agent\agent.env`:
    - `BACKEND_URL=http://localhost:8080`, `PC_AGENT_KEY`, `PROVENPATH_GATE_SECRET`;
    - `PC_HOME=C:\GW10\PolicyCenter`, `PC_URL=http://localhost:8180/pc`, `PC_USER`, `PC_PASSWORD`;
    - `PC_STOP_CMD` / `PC_START_CMD`, the `gwb.bat` commands.
- **JDKs:** only our scripts set `JAVA_HOME` to Temurin 11. PC keeps the global Corretto `JAVA_HOME`.
- **Sessions:** processes run in console windows as `Student`. Disconnect the remote session instead of signing out; `start-all.cmd` is safe to re-run.
- **Fallback:** the agent also watches `C:\provenpath\inbox` for package zips.
- **Demo screen:** the VM desktop, with Mission Control (`localhost:3000`) and PolicyCenter (`localhost:8180/pc`) side by side.
