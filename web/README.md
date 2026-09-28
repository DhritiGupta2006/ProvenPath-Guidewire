# Mission Control (web/)

Next.js UI for ProvenPath. **It never computes or invents a verdict, hash, metric or manifest.** Everything shown comes from the Gosu backend (`lib/api.ts`), which it calls directly (the backend allows CORS `*`).

## Run
```bash
cp .env.example .env.local        # NEXT_PUBLIC_API_URL = backend (scripts/run-local), NEXT_PUBLIC_PC_URL = PolicyCenter
npm install                        # on the Guidewire VM: add --registry=https://registry.npmjs.org
npm run dev                        # or: npm run build && npm start
```
Start the backend first: `scripts/run-local.cmd` / `bash scripts/run-local.sh` (see `docs/SETUP.md`).

## Modes
- **Live** (default): **Run** calls `POST /api/v1/executions {prompt}` and streams `/api/v1/executions/{id}/stream`. The planner, gate, review, replay, provenance and deployment are all real.
- **Recorded**: plays `fixtures/events_demo_run.jsonl` (a real recorded run, nothing synthesized) through `/api/dev-stream`, shown with a **RECORDED** badge. Review and deploy are disabled because there's no live execution behind it.

## What talks to what
| Panel | Backend call |
|---|---|
| Rule graph | `GET /rules` + `verify.node` events. Each rule shows its **worst** result across all clauses it checked; its folio lists every clause, each opening provenance |
| Blocked card | `gate.blocked` payload. Stays visible after the planner repairs, until dismissed |
| Reviewer | `GET /users`, `GET /executions/{id}` (verified proposal), `POST /reviews`; backend errors shown verbatim |
| Deploy | `POST /deployments`, `GET /deployments/{id}` (signed manifest), `pc.*` events. Shows `503 exporter_unavailable` honestly until `:pcexport` is wired |
| Re-verify | `POST /executions/{id}/replay` (original vs recomputed verdict hash) |
| Tamper test | Real `fixtures/proposal_demo_fixed.json` with one cited snippet altered → `POST /verify` → real SOURCE-layer block |
| Metrics | `GET /metrics` (`eval/metrics.json`, with denominators) plus this run's measured request → verified time |
| Provenance | `GET /provenance/{clauseId}?executionId=` |

## Checks
`npm run lint` and `npx tsc --noEmit` are clean, and `npm run build` is green. An end-to-end browser run against the real backend (live run → blocked → repair → review → approve → deploy 503 → re-verify → tamper → metrics → provenance → recorded mode) passed 10/10.
