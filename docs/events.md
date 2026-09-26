# ProvenPath events (SSE + append-only audit log)

Every event is appended to `pp_event_log` (a trigger rejects UPDATE/DELETE/TRUNCATE) **before** it is streamed.

**Stream:** `GET /api/v1/executions/{id}/stream`
- Send `Accept: text/event-stream` (browser `EventSource` does this automatically).
- Every SSE message uses the event name `message`, so `EventSource.onmessage` receives all of them.
- The SSE `id` is the seq. On reconnect, `Last-Event-ID` (or `?after=N`) resumes with no gaps or duplicates.
- A new subscriber first gets the **full history from seq 1**, then live events.
- A comment ping is sent every 15 s.

```json
{"executionId": "exec-…", "seq": 12, "ts": "2026-09-27T01:50:44.123Z", "type": "verify.node", "payload": { … }}
```

`fixtures/events_demo_run.jsonl` is a **real recorded run** of the demo (`LLM_MODE=fixture`) up to `review.decided`. The `pc.*` tail is a sample in the exact shapes below, until `:pcexport` and the VM agent exist.

## Who emits what
| Emitter | Types |
|---|---|
| Backend (`ExecutionService`, `ToolService`) | `run.started`, `review.requested`, `run.completed` |
| **Planner** (`FixturePlanner`, or Track C's `provenpath.planner.Planner`) | `planner.step`, `tool.called`, `tool.result`, `planner.repair` |
| **Verifier** (`VerifyService`, the only producer of verdicts) | `proposal.created`, `verify.started`, `verify.node`, `gate.blocked`, `gate.passed` |
| Review / deploy gate | `review.decided`, `pc.export`, `pc.queued`, `pc.failed` (export stage) |
| **VM agent** (via `POST /api/v1/pc-agent/status`) | `pc.pulled` (on claim), `pc.write`, `pc.restart`, `pc.ready`, `pc.verified`, `pc.failed` |

## Payloads
| Type | Payload |
|---|---|
| `run.started` | `prompt`, `mode` (`fixture` \| `live` \| `mcp` \| `test`) |
| `planner.step` | `step`, `action` (tool name), `note`, `mode` |
| `tool.called` | `tool`, `args` |
| `tool.result` | `tool`, `result` |
| `proposal.created` | `proposalId`, `iteration`, `clauses` (count), `aggregateLimitInr` |
| `verify.started` | `runId`, `iteration`, `proposalId`, `ruleCount` (23), `nodeCount`, `rulesetHash` |
| `verify.node` | `runId`, `ruleCode`, `clauseId` (null = proposal-level), `layer` (TYPE \| RANGE \| CONSISTENCY \| RULE_MATCH \| SOURCE \| GROUNDING), `result` (PASSED \| FAILED \| SKIPPED \| NEEDS_REVIEW), `expected`, `actual`, `reason`, `sourceCode`. Sent in topological order, `VERIFY_NODE_DELAY_MS` apart. `ruleCode: "UNMATCHED"` marks a clause no rule covers (NEEDS_REVIEW) |
| `gate.blocked` | `runId`, `iteration`, `verdictHash`, `failedRules[]`, `skippedRules[]`, `needsReviewClauses[]`, `failures[]` (each shaped like a `verify.node` payload), `writtenToPolicyCenter: 0` |
| `gate.passed` | `runId`, `iteration`, `verdictHash`, `proposalHash`, `rulesetHash`, `nodeCount` |
| `planner.repair` | `runId` (the blocked run), `iteration` (the next one), `failedRule`, `clauseId`, `expected`, `actual`, `reason` |
| `review.requested` | `runId`, `iteration`, `verdictHash`, `reviewers[]` (names) |
| `review.decided` | `runId`, `reviewId`, `decision` (approved \| rejected), `reviewer`, `reviewerId`, `comment` |
| `pc.export` | `deploymentId`, `runId`, `productCode`, `files` (count), `packageBytes`, `manifestSha256` |
| `pc.queued` | `deploymentId` |
| `pc.pulled` | `deploymentId`, `agent` |
| `pc.write` / `pc.restart` / `pc.ready` / `pc.verified` | `deploymentId`, `detail` (free text from the agent, e.g. elapsed restart time) |
| `pc.failed` | `deploymentId`, `detail` (agent), or `stage: "export"`, `detail` (backend) |
| `run.completed` | `status` (`blocked` \| `rejected` \| `deployed` \| `error`), plus `runId` / `iterations` / `deploymentId` / `error` |

## Execution status (`GET /api/v1/executions/{id}` → `status`)
`planning` → `verified_fail` (still blocked) · `review_pending` → `approved` | `rejected` → `deploying` → `deployed` | `deploy_failed` (can be redeployed) · `error`
