# ProvenPath Event Log Format

This document details the event log format used by the ProvenPath verification core to emit execution steps during product proposition and verification.

## Event Envelope Format

Every event is serialized as a single JSON object per line (JSONL format) with the following structure:

```json
{
  "executionId": "string",
  "seq": "integer",
  "ts": "ISO 8601 timestamp string",
  "type": "string",
  "payload": "object"
}
```

- **executionId**: A unique identifier for the entire execution run.
- **seq**: A monotonically increasing integer sequence starting from 1 for each execution run.
- **ts**: ISO-8601 formatted timestamp of the event.
- **type**: The specific event type which defines the schema of the `payload` object.
- **payload**: The event-specific payload containing details.

## Event Types & Payloads

### `run.started`
Emitted when a new agent run begins.
- `prompt` (string): The initial user request or prompt.

### `planner.step`
Emitted when the planner decides on the next step.
- `step` (integer): Step number.
- `action` (string): The intended action.

### `tool.called`
Emitted when a tool is invoked.
- `tool` (string): Name of the tool.
- `args` (object): Arguments passed to the tool.

### `tool.result`
Emitted when a tool execution completes.
- `tool` (string): Name of the tool.
- `result` (string or object): Result of the execution.

### `proposal.created`
Emitted when a product proposal is constructed.
- `proposalId` (string): Unique identifier for the proposal.
- `iteration` (integer): Current iteration number for this proposal.

### `verify.started`
Emitted when the verification phase begins for a proposal.
- `runId` (string): Specific verification run identifier.
- `iteration` (integer): Corresponding proposal iteration.
- `ruleCount` (integer): Total number of rules to execute.

### `verify.node`
Emitted for every verification node execution.
- `ruleCode` (string): Rule identifier.
- `layer` (string): Verification layer (e.g., TYPE, RANGE, STRUCTURAL, CITATION, CONDITION).
- `result` (string): Result of verification (`PASSED`, `FAILED`, `SKIPPED`).
- `reason` (string, optional): Reason for failure or skipping.

### `gate.blocked`
Emitted when verification fails and blocks deployment.
- `runId` (string): Verification run ID.
- `failedRules` (list of strings): List of rules that failed.
- `skippedRules` (list of strings, optional): List of rules that were skipped due to upstream failures.

### `planner.repair`
Emitted when the planner identifies a fix for a failed proposal.
- `failedRule` (string): The primary rule that caused the failure.
- `reason` (string): The explanation of why it failed and how it needs to be repaired.

### `gate.passed`
Emitted when a proposal passes all verification rules.
- `runId` (string): Verification run ID.
- `verdictHash` (string): Hash of the successful verdict state.

### `review.requested`
Emitted when a passed proposal is sent for manual or external review.
- `runId` (string): Verification run ID.
- `reviewer` (string): Identity of the required reviewer.

### `review.decided`
Emitted when the review decision is made.
- `runId` (string): Verification run ID.
- `decision` (string): Review outcome (`approved`, `rejected`).
- `reviewer` (string): Identity of the reviewer who made the decision.

### `pc.request`
Emitted when a request to deploy to PolicyCenter is initiated.
- `endpoint` (string): PolicyCenter API endpoint.
- `payload` (object): The request body being sent.

### `pc.response`
Emitted when the PolicyCenter API responds.
- `status` (integer): HTTP status code.
- `message` (string): API response message.

### `run.completed`
Emitted when the entire execution run is completed.
- `status` (string): Final status (`success`, `failure`).
- `iterations` (integer): Total number of iterations executed.
