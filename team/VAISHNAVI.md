# Vaishnavi — Track D: Mission Control (Next.js) + Pitch Deck

**Branch:** `track-d/*` · **Master plan:** `12_BUILD_PLAN_2_DAYS.md` · **Owns:** `web/` (except `web/app/api/mcp`, which is Dhriti's), pitch deck

## Checklist
- [ ] **D1 09:00–13:30:** Next.js scaffold, Dockerfile, layout, `lib/contracts.ts`, `useExecutionStream` + dev SSE replay of the fixture
- [ ] **D1 14:00–18:00:** React Flow rule DAG with live colors, trace timeline, tools panel
- [ ] **D1 18:00 CP2:** the graph turns red on CYB-RNG-002 from the real backend
- [ ] **D1 19:00–23:00:** Blocked card, Reviewer panel, switch to the real backend
- [ ] **D2 09:30–12:30:** **PolicyCenter deploy panel** (live `pc.*` steps, manifest viewer, "Open in PolicyCenter"), provenance drawer, metrics panel
- [ ] **D2 13:30–15:00:** replay + re-verify hash, Tamper button, before/after slider, disclaimer footer
- [ ] **D2 15:00–17:00:** 6-slide pitch deck

## Prompt for your coding agent

```
You are helping me build ProvenPath (hackathon, 2 days, 4 people). Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: 12_BUILD_PLAN_2_DAYS.md (master plan — follow exactly), team/VAISHNAVI.md, docs/events.md, backend/contracts (data shapes), fixtures/events_demo_run.jsonl.

STACK: frontend Next.js (App Router) + TypeScript + Tailwind + React Flow (@xyflow/react). Plain `npm run dev` (Docker optional; the final demo runs natively on the Guidewire VM with `next start`). Backend = Gosu service at http://localhost:8080 (SSE at /api/v1/executions/{id}/stream). Deployment target = a REAL Guidewire PolicyCenter 10 on a Guidewire cloud VM (no mock); the ProvenPath agent on the VM pulls approved packages and reports pc.pulled/write/restart/ready/verified/failed. Build against fixtures FIRST so I never wait on the backend.

I own TRACK D — Mission Control UI in web/ (do not touch web/app/api/mcp — Dhriti owns it).

1. Scaffold web/ (TS, Tailwind, App Router), web/Dockerfile, env NEXT_PUBLIC_API_URL + NEXT_PUBLIC_PC_URL. Dark mission-control layout: request box top; left = trace timeline; center = rule DAG; right = tools panel; drawer = reviewer / PolicyCenter deploy panels.
2. web/lib/contracts.ts mirroring plan §3 (Proposal, Clause, NodeResult, Verdict, Event, PcManifest).
3. lib/useExecutionStream.ts: EventSource, dedupe by seq, reconnect. Dev route app/api/dev-stream/route.ts that replays fixtures/events_demo_run.jsonl as SSE with delays.
4. Rule DAG (React Flow) from GET /api/v1/rules: 22 nodes in columns by layer (TYPE, RANGE, CONSISTENCY, RULE_MATCH, SOURCE, GROUNDING), edges = depends_on; live colors on verify.node: grey pending, green PASSED, red FAILED, striped SKIPPED, amber NEEDS_REVIEW.
5. Trace timeline (planner.*, tool.*, gate.*, review.*, pc.*) + tools panel (click → collapsible input/output JSON).
6. BLOCKED card on gate.blocked: rule code, layer, expected vs actual, reason, cited source text, banner "BLOCKED — nothing written to PolicyCenter".
7. Reviewer panel on review.requested: reviewer dropdown ("A. Mehta — Compliance Reviewer"), clause list with provenance (rule → source), Approve / Reject (comment required on reject) → POST /api/v1/reviews. Must look like a real gate, not decoration.
8. PolicyCenter deploy panel: "Deploy to PolicyCenter" (POST /api/v1/deployments) → live stepper from pc.export → pc.queued → pc.pulled → pc.write → pc.restart (show elapsed time, PC restarts take minutes) → pc.ready → pc.verified / pc.failed; generated file list + provenpath-manifest.json viewer (verdictHash, gateToken, reviewer, termRanges); "Open in PolicyCenter" button → NEXT_PUBLIC_PC_URL (http://localhost:8180/pc; the final demo runs in the VM browser, where web and PC sit side by side). Nothing may assume Docker hostnames: read all URLs from env with localhost defaults, because the final build runs natively on the Guidewire VM with `next start`.
9. Provenance drawer (GET /api/v1/provenance/{clauseId}), Metrics panel (GET /api/v1/metrics — accuracy, FALSE-PASS highlighted with target 0%, false-block, provenance completeness, ALWAYS with denominators like "0 / 20"), before/after slider ("~3 weeks manual" vs measured run.started → pc.verified).
10. Replay: event-log playback at 3× + "Re-verify" (POST /api/v1/executions/{id}/replay) → "verdict hash identical ✔". Tamper button: POST /api/v1/verify with a fake-citation proposal → SOURCE-layer block shown.
11. Loading/error states; footer everywhere: "Rule-graph verdict against a curated constraint set. Not a legal opinion."
12. From D2 15:00: 6-slide pitch deck — problem → "LLM proposes, Gosu verifies" → architecture (3 gates: pre-commit, signed manifest, runtime gate inside PolicyCenter) → live demo → metrics → roadmap + competitive positioning.

Done = the whole demo runs from the browser + the PolicyCenter tab, no curl. Branch track-d/*, merge to main at checkpoints (D1 10:30, 13:30, 18:00, 23:00; D2 12:30, 15:00 freeze). No AI co-author lines. Repo is PUBLIC — no Guidewire files.
```
