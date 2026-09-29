# ProvenPath

**AI proposes. Rules decide. People approve.**

**v1.0: SME Cyber.** v2 brings every product line; see [`docs/ROADMAP.md`](docs/ROADMAP.md).

ProvenPath is a deterministic pre-commit compliance gate between an AI planner and **Guidewire PolicyCenter 10**. A planner (Google Gemini) drafts an insurance product (here: SME cyber insurance, product `SMCyber`); a Gosu rule graph of 23 rules in 6 layers verifies every clause; a named Compliance Reviewer approves; only then is a signed package built, pulled by an agent next to PolicyCenter, installed, and confirmed through PolicyCenter's ProductModelAPI. A blocked or unapproved proposal can never write a file into PolicyCenter.

The full explanation of the pipeline, every rule and every word in the UI: [`docs/ProvenPath-Explained.pdf`](docs/ProvenPath-Explained.pdf).

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | Gosu 1.18 on Java 11, Gradle multi-module: `contracts`, `core` (the gate), `eval`, `app` (HTTP + SSE + embedded PostgreSQL), `planner` (Gemini), `pcexport` (package builder), `pcagent` (PC agent). See [`backend/README.md`](backend/README.md) |
| `web/` | Next.js 16 Mission Control: landing page, live run, rule graph, sign-off, deployment, MCP endpoint. See [`web/README.md`](web/README.md) |
| `rules/` | The 23 rules (`rules/rules/*.yaml`) and the regulatory source texts (`rules/sources.yaml`). See [`rules/README.md`](rules/README.md) |
| `shared/tools/` | JSON schemas of the 4 planner / MCP tools |
| `fixtures/` | Recorded demo proposals and a recorded real run (used by fixture mode and "Watch a recorded run") |
| `eval/` | Labelled corpus (40 proposals) and the latest `metrics.json` |
| `policycenter/` | `overlay-template/` (the SMCyber product-model files installed in PolicyCenter) and `agent/` (PC agent config). See [`policycenter/README.md`](policycenter/README.md) |
| `vm/` | Native start/stop scripts for the Guidewire VM. See [`vm/README.md`](vm/README.md) |
| `scripts/` | Laptop helpers: `run-local` / `stop-local` (backend without Docker), `smoke.sh`, `vm-check-staged.sh`, `gen_corpus.ps1` |
| `comms/` | Mailbox with the agent on the Guidewire VM (`to-vm/` tasks, `from-vm/` reports). See [`comms/README.md`](comms/README.md) |
| `docs/` | Setup, events, PolicyCenter facts, plans, Guidewire notes, team briefs. See [`docs/README.md`](docs/README.md) |

## Quick start (laptop)

Needs a JDK 11+ (`JAVA_HOME`) and Node 20. No Docker, no database install: the backend starts its own PostgreSQL.

```
copy .env.example .env                 # set PROVENPATH_GATE_SECRET, PC_AGENT_KEY, GEMINI_API_KEY, LLM_MODE=live
scripts\run-local.cmd                  # backend on BACKEND_PORT (builds the jar the first time)
cd web && npm install && npm run dev   # Mission Control on http://localhost:3000 (web/.env.local → NEXT_PUBLIC_API_URL)
```

Tests: `cd backend && ./gradlew test` (62 tests) · `cd web && npm run lint && npm run build`.

## On the Guidewire VM

```
vm\start-all.cmd --build    # backend :8080, web :3000, PC agent (each in its own console)
vm\stop-all.cmd             # stops ProvenPath, leaves PolicyCenter running
```

Details: [`vm/README.md`](vm/README.md) and [`docs/policycenter.md`](docs/policycenter.md).

## Rules of the repo
- The repo is public: never commit `.env`, `agent.env`, keys, jars, or any Guidewire file (only files we author, like `policycenter/overlay-template`).
- The UI never invents a verdict, hash, metric or step; anything illustrative is labelled.
