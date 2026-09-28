/**
 * Typed client for the ProvenPath Gosu backend. The UI never computes a verdict, hash, metric or
 * manifest itself: it only displays what these endpoints return. The backend allows CORS *, so the
 * browser calls it directly (NEXT_PUBLIC_API_URL, default http://localhost:8080).
 */
import {
  DeploymentSummary,
  EvalMetrics,
  ExecutionDetail,
  HealthResponse,
  Proposal,
  ProvenanceResponse,
  ReplayResponse,
  RulesResponse,
  UserRow,
  Verdict,
} from './contracts';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');
export const PC_URL = process.env.NEXT_PUBLIC_PC_URL || 'http://localhost:8180/pc';

/** Error carrying the backend's {error, message} body so the UI can show it verbatim. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'backend_unreachable', `Backend not reachable at ${API_URL}. Start it with scripts/run-local.`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = (body || {}) as { error?: string; message?: string };
    throw new ApiError(res.status, b.error || `http_${res.status}`, b.message || `HTTP ${res.status}`);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => call<HealthResponse>('/health'),
  rules: () => call<RulesResponse>('/rules'),
  users: () => call<UserRow[]>('/users'),
  metrics: () => call<EvalMetrics>('/metrics'),

  startExecution: (prompt: string) => post<{ executionId: string; stream: string }>('/executions', { prompt }),
  execution: (id: string) => call<ExecutionDetail>(`/executions/${encodeURIComponent(id)}`),
  replay: (id: string) => post<ReplayResponse>(`/executions/${encodeURIComponent(id)}/replay`),
  streamUrl: (id: string) => `${API_URL}/api/v1/executions/${encodeURIComponent(id)}/stream`,

  /** Stateless verification of an arbitrary proposal (tamper demo). */
  verify: (proposal: Proposal) => post<Verdict>('/verify', proposal),

  review: (req: { executionId: string; runId: string; reviewerId: string; decision: 'approve' | 'reject'; comment?: string }) =>
    post<{ reviewId: string; status: string; decision: string }>('/reviews', req),

  deploy: (executionId: string) => post<{ deploymentId: string; status: string }>('/deployments', { executionId }),
  deployment: (id: string) => call<DeploymentSummary>(`/deployments/${encodeURIComponent(id)}`),
  packageUrl: (id: string) => `${API_URL}/api/v1/deployments/${encodeURIComponent(id)}/package`,

  provenance: (clauseId: string, executionId?: string) =>
    call<ProvenanceResponse>(
      `/provenance/${encodeURIComponent(clauseId)}${executionId ? `?executionId=${encodeURIComponent(executionId)}` : ''}`
    ),
};

/** ₹ formatting in the Indian system (e.g. 25,00,000). */
export function inr(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function shortHash(h?: string | null, n = 12): string {
  return h ? `${h.slice(0, n)}…` : '—';
}
