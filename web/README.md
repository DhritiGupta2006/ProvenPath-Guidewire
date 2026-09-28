# ProvenPath web (web/)

Next.js UI for ProvenPath. **It never computes or invents a verdict, hash, metric or manifest.** Everything shown comes from the Gosu backend (`lib/api.ts`), which it calls directly (the backend allows CORS `*`).

## Run
```bash
cp .env.example .env.local        # NEXT_PUBLIC_API_URL = backend (scripts/run-local), NEXT_PUBLIC_PC_URL = PolicyCenter
npm install                        # on the Guidewire VM: add --registry=https://registry.npmjs.org
npm run dev                        # or: npm run build && npm start
```
Start the backend first: `scripts/run-local.cmd` / `bash scripts/run-local.sh` (see `docs/SETUP.md`).

## Pages
- **`/` Landing.** Explains the product before anyone touches it: the hero (a canvas where proposals stream into a gate, most pass and some shatter), a scroll-told "how it works" in four stages illustrated from the recorded run, the six layers with the real rules from `GET /rules`, the tamper story, and live proof numbers from `GET /metrics` (shown as "—" when the backend is offline, never hard-coded).
- **Launch.** A circle grows out of the clicked button and Mission Control boots by actually calling `/health`, `/rules` and `/users`. If the backend is down it says so and offers the recorded run.
- **`/control` Mission Control.** Empty state is one question and one input. After **Run**, the input collapses into the header and the screen has two parts: the stage (verdict headline, counters, the 23-rule graph) and one inspector that shows what matters now: activity → blocked → sign-off → deployment. The raw event stream is in the **Trace** tab. Re-verify and the tamper test live in the `⋯` menu; Metrics in the top bar. The stage rail at the top tracks Propose → Verify → Review → Deploy.

## Modes
- **Live** (default): calls `POST /api/v1/executions {prompt}` and streams `/api/v1/executions/{id}/stream`. The planner, gate, review, replay, provenance and deployment are all real.
- **Recorded** (`/control?mode=recorded`): plays `fixtures/events_demo_run.jsonl` (a real recorded run, nothing synthesized) through `/api/dev-stream`, with a **RECORDED** badge. Review and deploy are read-only because there's no live execution behind it.

## What talks to what
| UI | Backend call |
|---|---|
| Rule graph | `GET /rules` + `verify.node` events. Each rule shows its **worst** result across the clauses it checked; clicking it lists every clause, each opening provenance |
| Blocked | `gate.blocked` payload, kept (labelled "repairing") while the planner re-proposes |
| Sign-off | `GET /users`, `GET /executions/{id}` (verified proposal), `POST /reviews`; backend errors shown verbatim |
| Deploy | `POST /deployments`, `GET /deployments/{id}` (signed manifest), `pc.*` events. Shows `503 exporter_unavailable` honestly until `:pcexport` is wired |
| Re-verify | `POST /executions/{id}/replay` (original vs recomputed verdict hash) |
| Tamper test | Real `fixtures/proposal_demo_fixed.json` with one cited word changed → `POST /verify` → real SOURCE-layer block |
| Metrics | `GET /metrics` (`eval/metrics.json`, with denominators) plus this run's measured prompt → verified time |
| Provenance | `GET /provenance/{clauseId}?executionId=` |

## Stack
Tailwind v4 tokens in `app/globals.css` (one dark surface, an iris accent, and pass/fail/warn reserved for gate results), Geist + Instrument Serif, [Motion](https://motion.dev) for animation and [Lenis](https://lenis.darkroom.engineering) for smooth scroll on the landing page. The rule graph is custom SVG + DOM (no graph library). `prefers-reduced-motion` is respected.

## Checks
`npm run lint`, `npx tsc --noEmit` and `npm run build` are clean. An end-to-end browser run against the real backend (landing → scroll story → launch boot → live run → blocked → repair → sign-off → rule inspector → provenance → approve → deploy 503 → trace → re-verify → tamper → metrics → recorded run → mobile layout) passed 13/13.
