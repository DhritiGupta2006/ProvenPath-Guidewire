/**
 * ProvenPath Contracts - TypeScript mirror of backend/contracts
 * Master Plan docs/plan/12_BUILD_PLAN_2_DAYS.md § 3
 */

export type ClauseKind = 'COVERAGE' | 'EXCLUSION' | 'RATING';

export type Layer = 
  | 'TYPE' 
  | 'RANGE' 
  | 'CONSISTENCY' 
  | 'RULE_MATCH' 
  | 'SOURCE' 
  | 'GROUNDING';

export type NodeStatus = 
  | 'PASSED' 
  | 'FAILED' 
  | 'SKIPPED' 
  | 'NEEDS_REVIEW'
  | 'PENDING';

export type VerdictStatus = 'PASSED' | 'BLOCKED';

export interface Citation {
  sourceCode: string;
  section: string;
  textSnippet: string;
}

export interface Clause {
  clauseId: string;
  kind: ClauseKind;
  patternCode: string;
  name: string;
  category: string;
  owningEntityType: string;
  existence: 'Required' | 'Suggested' | 'Electable' | 'Preset';
  limitMaxInr?: number;
  deductibleInr?: number;
  waitingHours?: number;
  conditions?: string[];
  factors?: Record<string, number>;
  excludesPatternCodes?: string[];
  citations?: Citation[];
}

export interface Proposal {
  proposalId: string;
  executionId: string;
  iteration: number;
  line: 'SMCyber';
  aggregateLimitInr: number;
  turnoverInr: number;
  minimumPremiumInr: number;
  targetEffectiveDate: string;
  jurisdiction: 'IN';
  clauses: Clause[];
  proseSummary?: string;
  llmMeta?: {
    model?: string;
    temperature?: number;
    [key: string]: unknown;
  };
}

export interface NodeResult {
  ruleCode: string;
  clauseId: string | null;
  layer: Layer;
  result: NodeStatus;
  expected: string;
  actual: string;
  reason?: string;
  sourceCode: string;
  runId?: string;
}

export interface Verdict {
  runId: string;
  status: VerdictStatus;
  nodes: NodeResult[];
  rulesetHash: string;
  proposalHash: string;
  verdictHash: string;
  gateToken?: string;
}

export type EventType =
  | 'run.started'
  | 'planner.step'
  | 'tool.called'
  | 'tool.result'
  | 'proposal.created'
  | 'verify.started'
  | 'verify.node'
  | 'gate.blocked'
  | 'gate.passed'
  | 'planner.repair'
  | 'review.requested'
  | 'review.decided'
  | 'pc.export'
  | 'pc.queued'
  | 'pc.pulled'
  | 'pc.write'
  | 'pc.restart'
  | 'pc.ready'
  | 'pc.verified'
  | 'pc.failed'
  | 'run.completed';

export interface BaseEvent<T = Record<string, unknown>> {
  executionId: string;
  seq: number;
  ts: string;
  type: EventType;
  payload: T;
}

// Specific event payload definitions
export interface RunStartedPayload {
  prompt: string;
  mode: 'fixture' | 'live' | 'mcp' | 'test';
}

export interface PlannerStepPayload {
  step: number;
  action: string;
  note: string;
  mode: string;
}

export interface ToolCalledPayload {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResultPayload {
  tool: string;
  result: Record<string, unknown>;
}

export interface ProposalCreatedPayload {
  proposalId: string;
  iteration: number;
  clauses: number;
  aggregateLimitInr: number;
}

export interface VerifyStartedPayload {
  runId: string;
  iteration: number;
  proposalId: string;
  ruleCount: number;
  nodeCount: number;
  rulesetHash: string;
}

export interface GateBlockedPayload {
  runId: string;
  iteration: number;
  verdictHash: string;
  failedRules: string[];
  skippedRules: string[];
  needsReviewClauses: string[];
  failures: NodeResult[];
  writtenToPolicyCenter: number;
}

export interface GatePassedPayload {
  runId: string;
  iteration: number;
  verdictHash: string;
  proposalHash: string;
  rulesetHash: string;
  nodeCount: number;
}

export interface PlannerRepairPayload {
  runId: string;
  iteration: number;
  failedRule: string;
  clauseId: string | null;
  expected: string;
  actual: string;
  reason: string;
}

export interface ReviewRequestedPayload {
  runId: string;
  iteration: number;
  verdictHash: string;
  reviewers: string[];
}

export interface ReviewDecidedPayload {
  runId: string;
  reviewId: string;
  decision: 'approved' | 'rejected';
  reviewer: string;
  reviewerId: string;
  comment?: string | null;
}

export interface PcExportPayload {
  deploymentId: string;
  runId: string;
  productCode: string;
  files: number;
  packageBytes: number;
  manifestSha256: string;
}

export interface PcStatusPayload {
  deploymentId: string;
  agent?: string;
  detail?: string;
  stage?: string;
}

export interface RunCompletedPayload {
  deploymentId?: string;
  status: 'blocked' | 'rejected' | 'deployed' | 'error';
  runId?: string;
  iterations?: number;
  error?: string;
}

export interface PcTermRange {
  patternCode: string;
  termCode: string;
  min: number | string;
  max: number | string;
  ruleCode: string;
}

export interface PcFile {
  path: string;
  sha256: string;
}

export interface PcManifest {
  productCode: string;
  files: PcFile[];
  verdictHash: string;
  gateToken: string;
  reviewId: string;
  reviewer: string;
  termRanges: PcTermRange[];
  generatedAt: string;
}

export interface RuleDefinition {
  ruleCode: string;
  name: string;
  layer: Layer;
  appliesTo: string;
  dependsOn: string[];
  sourceCode: string;
  pcMapping?: string;
}

// ---- Real backend responses (Gosu backend, see backend/README.md and docs/events.md) ----

export interface RulesResponse {
  rulesetHash: string;
  count: number;
  rules: RuleDefinition[];
}

export interface HealthResponse {
  status: string;
  rulesetHash: string;
  llmMode: string;
  planner: string;
  packageBuilder: string;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: 'proposer' | 'reviewer' | 'admin';
}

export interface RunRow {
  id: string;
  iteration: number;
  status: VerdictStatus;
  verdict_hash: string;
  ruleset_hash: string;
  proposal_hash: string;
  nodes_total: number;
  nodes_failed: number;
  nodes_skipped: number;
  nodes_needs_review: number;
  duration_ms: number;
  created_at: string;
}

export interface ExecutionDetail {
  id: string;
  prompt: string;
  mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  runs: RunRow[];
  reviews: { id: string; run_id: string; decision: string; comment: string | null; reviewed_at: string; reviewer: string }[];
  deployments: { id: string; run_id: string; status: string; detail: string | null; created_at: string }[];
  latestRunId?: string;
  latestProposal?: Proposal;
}

export interface ReplayResponse {
  executionId: string;
  runId: string;
  iteration: number;
  originalHash: string;
  verdictHash: string;
  match: boolean;
  status: VerdictStatus;
  originalStatus: VerdictStatus;
  rulesetChanged: boolean;
}

export interface ProvenanceCheck {
  position: number;
  rule_code: string;
  clause_id: string;
  layer: Layer;
  result: NodeStatus;
  expected: string | null;
  actual: string | null;
  reason: string | null;
  source_code: string | null;
  ruleName?: string;
}

export interface ProvenanceCitation {
  sourceCode: string;
  section: string;
  textSnippet: string;
  found: boolean;
  title?: string;
  fullText?: string;
  effectiveDate?: string;
  jurisdiction?: string;
  snippetMatchesSource: boolean;
}

export interface ProvenanceResponse {
  clauseId: string;
  executionId: string;
  proposalId: string;
  iteration: number;
  clause: Clause;
  runId?: string;
  runStatus?: VerdictStatus;
  checks: ProvenanceCheck[];
  citations: ProvenanceCitation[];
  cited: boolean;
}

export interface DeploymentSummary {
  id: string;
  execution_id: string;
  run_id: string;
  review_id: string;
  status: string;
  manifest: PcManifest;
  detail: string | null;
  created_at: string;
  pulled_at: string | null;
  pc_verified_at: string | null;
}

/** eval/metrics.json as written by backend/eval RunEval */
export interface EvalMetrics {
  total: number;
  accuracy: number;
  falsePassCount: number;
  falsePassDenominator: number;
  falsePassRate: number;
  falseBlockCount: number;
  falseBlockDenominator: number;
  falseBlockRate: number;
  provenanceCompleteness: number;
  perLayer?: Record<string, { passed: number; failed: number }>;
}
