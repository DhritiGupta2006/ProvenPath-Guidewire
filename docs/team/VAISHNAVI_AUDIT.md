# Audit: `frontend` branch (Mission Control), Day 3

> ✅ **Resolved (Day 3):** Shaurya took over Track D and rebuilt the UI on the real backend on branch `track-d/web` (merged to `main`). All P0/P1/P2 items below are fixed; see `web/README.md`. This audit is kept for the record.

Audited commit `06eac01` (branch `origin/frontend`).

## Verdict: good UI shell, but NOT mergeable yet. The data is faked.
The screens are there and the production build succeeds: rule DAG, trace, tools, blocked card, reviewer, deploy, provenance, metrics, replay/tamper, light/dark mode. But **every number and verdict the UI shows comes from hard-coded Next.js routes or a recorded replay, never from the Gosu backend.** For a project whose whole pitch is "nothing is faked, deterministic code decides", a judge who opens `web/app/api/v1/verify/route.ts` ends the demo.

## P0: integrity (must fix before merge)
| # | Where | Problem |
|---|---|---|
| 1 | `app/api/v1/verify/route.ts` | Always returns BLOCKED (`… \|\| true`), with invented hashes (`tamper_fake_sha256_…`). |
| 2 | `app/api/v1/executions/[id]/replay/route.ts` | Compares two **identical hard-coded strings** and reports "100% deterministic". |
| 3 | `app/api/v1/deployments/route.ts` | Fabricates a manifest: made-up sha256s, a fake gate token, and a file (`SMCyberPrivacyLiabilityCov.xml`) that isn't in the real overlay. |
| 4 | `app/api/v1/metrics/route.ts` | Claims "0 / 20" and "50 / 50". The real eval is **0 / 6 false-pass, 0 / 6 false-block, 12 items** (`eval/metrics.json`). |
| 5 | `app/api/v1/provenance/[clauseId]/route.ts` | Hard-coded source text with fake sha256s. |
| 6 | `app/api/v1/reviews/route.ts` | Returns success for anything; the real named-reviewer gate is never called. |
| 7 | `app/api/v1/rules/route.ts` + `lib/rules-catalog.ts` | A static catalog instead of the real `GET /api/v1/rules`. The codes match today, but it drifts silently (hashes, dependencies). |
| 8 | `app/page.tsx` → `startStream(false)` | The Start button **always replays the recorded fixture** (`/api/dev-stream`). The prompt box is ignored, and `POST /api/v1/executions` is never called. |
| 9 | Deploy button | `fetch('/api/v1/deployments', {method:'POST'})` with no body and no execution id. |

**Rule:** the UI never computes or invents a verdict, hash, metric or manifest. It only displays what the backend returns. The fixture replay may stay **only** as an explicit "Recorded demo" mode with a visible **RECORDED** badge, never as the default.

## P1: correctness
10. **`nodesMap` is keyed by `ruleCode`.** The backend sends about 85 `verify.node` events for 23 rules (one per rule **per clause**), so the last one wins and **a FAILED result can be hidden by a later PASSED one**. Aggregate per rule with the worst status (FAILED > NEEDS_REVIEW > SKIPPED > PASSED), keep the per-clause list for the drawer, and reset when `verify.started` brings a new `runId`.
11. **Payload shapes:** align `lib/contracts.ts` with `docs/events.md` and the real responses:
    - `gate.blocked.failures[]` and `needsReviewClauses`;
    - `review.requested.reviewers[]`;
    - the `/metrics` shape (`total, accuracy, falsePassCount, falsePassDenominator, falseBlockCount, falseBlockDenominator, provenanceCompleteness, perLayer`);
    - `/provenance` (`clause, checks[], citations[{found, fullText, snippetMatchesSource}], cited`);
    - `/replay` (`match, verdictHash, originalHash, rulesetChanged`).
12. **Reviewer:** the real API needs `{executionId, runId, reviewerId (uuid from GET /api/v1/users), decision: "approve" | "reject", comment}`, and a comment is required on reject. Show the backend's 4xx messages (e.g. `stale_run`, `comment_required`) in the panel.
13. **Deploy:** `POST {API}/api/v1/deployments {executionId}`. Until Chinmay's exporter lands, the backend answers **503 `exporter_unavailable`**. Show that honestly ("PolicyCenter exporter not wired yet"), never a fake success.
14. **Lint:** 2 errors (`react-hooks/set-state-in-effect` in `lib/useTheme.ts` and one more) and 5 warnings. Remove the unused `components/deck/PitchDeckModal.tsx`, the `canvas-confetti` dependency and the unused `Presentation` import.

## P2: repo hygiene
15. **The branch has no common history with `main`** (it started as a separate repo copy), so it can't be merged or PR'd normally. Nothing outside `web/` differs from `main`, so recreate it: `git fetch && git checkout -b track-d/web origin/main`, then copy the `web/` folder in and commit. That's a clean diff.
16. **4 of 5 commits are authored as `Gaurav <gaurav@local>`.** Set `git config user.name/user.email` to your real identity (or confirm who Gaurav is).
17. `web/public/fixtures/*` duplicates `/fixtures` (identical today). Prefer reading `../fixtures` in the dev-stream route, so the copies can't go stale.

## What the real backend already gives you (on `main`, tested)
Run it with `scripts\run-local.cmd` (see `docs/SETUP.md`; no Docker needed). CORS is `*`, so call `${NEXT_PUBLIC_API_URL}` directly from the browser; no Next.js proxy routes are needed.

| UI need | Real endpoint |
|---|---|
| Start a run | `POST /api/v1/executions {prompt}` → `{executionId}` |
| Live events | `GET /api/v1/executions/{id}/stream` (SSE, full history then live; `Last-Event-ID` supported) |
| Rule graph | `GET /api/v1/rules` |
| Reviewers | `GET /api/v1/users` (role `reviewer`) |
| Review | `POST /api/v1/reviews` |
| Replay | `POST /api/v1/executions/{id}/replay` |
| Tamper | `POST /api/v1/verify` with a proposal whose citation snippet was altered (take `fixtures/proposal_demo_fixed.json` and append text to one `textSnippet`) → real SOURCE-layer BLOCKED |
| Provenance | `GET /api/v1/provenance/{clauseId}?executionId=…` |
| Metrics | `GET /api/v1/metrics` |
| Deploy | `POST /api/v1/deployments {executionId}` and `GET /api/v1/deployments/{id}` |
| Execution detail | `GET /api/v1/executions/{id}` (status, runs, reviews, deployments, latest proposal) |

## Prompt for your coding agent
```
Repo: https://github.com/shauryaaojha/ProvenPath-Guidewire. READ FIRST: docs/team/VAISHNAVI_AUDIT.md (this file, follow it exactly), docs/events.md, docs/SETUP.md, backend/README.md, fixtures/events_demo_run.jsonl.
1. Recreate the branch from main: git checkout -b track-d/web origin/main, copy in the existing web/ folder from the old frontend branch, and commit.
2. DELETE web/app/api/v1/** entirely. All data comes from the Gosu backend at process.env.NEXT_PUBLIC_API_URL (default http://localhost:8080), which allows CORS *. Create lib/api.ts with typed calls for every endpoint in the audit's table. Surface backend errors (status + {error, message}) in the UI instead of hiding them.
3. Start button: POST /api/v1/executions {prompt: promptText}, then stream /api/v1/executions/{executionId}/stream. Keep /api/dev-stream only behind an explicit "Recorded demo" toggle with a visible RECORDED badge (default OFF).
4. Fix nodesMap: aggregate verify.node per ruleCode with the worst status (FAILED > NEEDS_REVIEW > SKIPPED > PASSED), keep the per-clause nodes for the drawer, and reset on each verify.started (new runId).
5. Reviewer: load reviewers from GET /api/v1/users; POST /api/v1/reviews {executionId, runId (from review.requested), reviewerId, decision "approve"|"reject", comment}.
   Replay: POST /api/v1/executions/{id}/replay and show match, verdictHash, originalHash.
   Tamper: POST /api/v1/verify with fixtures/proposal_demo_fixed.json after appending " (altered)" to clauses[0].citations[0].textSnippet; show the real verdict and the SOURCE failure.
   Provenance: GET /api/v1/provenance/{clauseId}?executionId=...
   Metrics: GET /api/v1/metrics (show denominators from falsePassDenominator etc.).
   Deploy: POST /api/v1/deployments {executionId}; show 503 exporter_unavailable honestly.
6. Update lib/contracts.ts to match docs/events.md and the real responses. Remove PitchDeckModal, canvas-confetti and unused imports; fix all lint errors (npm run lint must be clean) and keep npm run build green.
7. Test against the real backend: run scripts\run-local.cmd, then npm run dev, click Start, and check that the graph turns red on CYB-RNG-002, then repairs, passes, review → approve, replay shows match true, tamper shows a SOURCE block, and deploy shows the 503 message. Use your real git identity; no AI co-author lines. Push track-d/web and open a PR to main.
```
