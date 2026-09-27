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
| Boot / stop / restart (measured, VM task 002) | Cold boot **8 m 18 s** · stop **18 s** · warm restart **3 m 32 s** (Gradle up-to-date ~30 s + Jetty ~3 m). Ready log line: `***** PolicyCenter ready *****`. Banner: `DEV mode - 10.2.1.1711` |
| ProductModelAPI (SOAP) | **`pc1000`**, not `pc900`: WSDL `http://localhost:8180/pc/ws/gw/webservice/pc/pc1000/productmodel/ProductModelAPI?WSDL`, SOAP 1.1 endpoint `…/ProductModelAPI/soap11`. Auth: HTTP Basic `su:gw` or the `gwsoap:authentication` header. Existence check: `getPublicIdForCodeIdentifier(codeIdentifier, productModelType)` returns `<return>` if it exists, otherwise an empty response (~50 ms) |
| REST | Only `/pc/rest/apis` and `/system/v1/server`; **no product-model or submission REST API**. Use SOAP plus XML config |
| Product model facts | GL line pattern `GLLine` (entity `GeneralLiabilityLine`, coverage subtype `GeneralLiabilityCov`). A new coverage = drop `<Code>.xml` + `<Code>-lookups.xml` into `policylinepatterns/GLLine/coveragepatterns/` (not listed in `GLLine.xml`). A product can reuse `GLLine` (`CommercialPackage` does). Display names live in the shared file `config/locale/productmodel.display.properties`. APD is present. New product-model XML needs a restart |

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
scripts/run-local + npm run dev ─── push ─► main ─ pull ─► vm\start-all.cmd
agent tested against a local folder                            ├─ (PostgreSQL 16 embedded in the backend jar: DB_MODE=embedded, private free port, data in C:\ProvenPath-tools\pgdata)
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

## Backend dry run on the VM (Day 0): ✅ passed
Temurin 11.0.32 (in-session `JAVA_HOME` only; PC's Corretto untouched), embedded PostgreSQL 16.15, no Docker, no admin.
| Step | Result |
|---|---|
| `backend\gradlew.bat test` | **47/47 pass** (core 34, app 12, eval 1). First Gradle download + build: ~2 min |
| `:app:fatJar` | 22 s, 135.7 MB |
| `scripts\run-local.cmd --no-build` | Ready in **14.7 s**, embedded DB on a free port |
| `bash scripts/smoke.sh` (Git Bash at `C:\Guidewire\Apps\Git\bin\bash.exe`) | Blocked on CYB-RNG-002 → repaired → passed → review → replay hash match → approved → deploy 503 (expected until `:pcexport`) → 0/6 false-pass |
| `scripts\stop-local.cmd` | Clean stop; no leftover `postgres.exe` or `java.exe` |

**Not yet exercised on the VM:** starting/stopping PolicyCenter (boot and restart times still TODO), the SMCyber package, the PC agent, ProductModelAPI, and the web UI.
