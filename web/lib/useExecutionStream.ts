'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BaseEvent,
  NodeResult,
  NodeStatus,
  GateBlockedPayload,
  PlannerRepairPayload,
  ReviewRequestedPayload,
  PcExportPayload,
  PcStatusPayload,
  ProposalCreatedPayload,
  VerifyStartedPayload,
  RunCompletedPayload,
} from './contracts';
import { api, ApiError } from './api';

export interface ToolCallItem {
  seq: number;
  tool: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  ts: string;
}

/** One rule in the graph: the worst result across all clauses it was evaluated on, plus the per-clause results. */
export interface RuleNodeState extends NodeResult {
  clauseResults: NodeResult[];
}

export type StreamMode = 'live' | 'recorded';

export type OverallStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'blocked'
  | 'repairing'
  | 'passed'
  | 'review_pending'
  | 'approved'
  | 'rejected'
  | 'deploying'
  | 'deployed'
  | 'error';

export type PcStage = 'idle' | 'export' | 'queued' | 'pulled' | 'write' | 'restart' | 'ready' | 'verified' | 'failed';

// FAILED beats NEEDS_REVIEW beats SKIPPED beats PASSED: a rule is only green if every clause passed.
const SEVERITY: Record<NodeStatus, number> = { PENDING: 0, PASSED: 1, SKIPPED: 2, NEEDS_REVIEW: 3, FAILED: 4 };

function worst(a: NodeResult, b: NodeResult): NodeResult {
  return (SEVERITY[b.result] ?? 0) > (SEVERITY[a.result] ?? 0) ? b : a;
}

export interface UseExecutionStreamReturn {
  mode: StreamMode;
  executionId: string | null;
  events: BaseEvent[];
  nodesMap: Record<string, RuleNodeState>;
  nodeStatusSummary: { passed: number; failed: number; skipped: number; needsReview: number; pending: number; total: number };
  overallStatus: OverallStatus;
  currentIteration: number;
  currentRunId: string | null;
  blockedData: GateBlockedPayload | null;
  repairData: PlannerRepairPayload | null;
  reviewData: ReviewRequestedPayload | null;
  pcStage: PcStage;
  pcDetail: string;
  pcExportData: PcExportPayload | null;
  proposalData: ProposalCreatedPayload | null;
  toolCalls: ToolCallItem[];
  isConnected: boolean;
  isStreaming: boolean;
  lastError: string | null;
  /** Measured from the event stream: run.started → review.requested (ms), null until known. */
  timeToVerifiedMs: number | null;
  speed: number;
  setSpeed: (speed: number) => void;
  startLive: (prompt: string) => Promise<void>;
  startRecorded: () => void;
  stopStream: () => void;
  resetStream: () => void;
  elapsedRestartSeconds: number;
}

export function useExecutionStream(): UseExecutionStreamReturn {
  const [mode, setMode] = useState<StreamMode>('live');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [events, setEvents] = useState<BaseEvent[]>([]);
  const [nodesMap, setNodesMap] = useState<Record<string, RuleNodeState>>({});
  const [ruleCount, setRuleCount] = useState<number>(0);
  const [overallStatus, setOverallStatus] = useState<OverallStatus>('idle');
  const [currentIteration, setCurrentIteration] = useState<number>(1);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [blockedData, setBlockedData] = useState<GateBlockedPayload | null>(null);
  const [repairData, setRepairData] = useState<PlannerRepairPayload | null>(null);
  const [reviewData, setReviewData] = useState<ReviewRequestedPayload | null>(null);
  const [pcStage, setPcStage] = useState<PcStage>('idle');
  const [pcDetail, setPcDetail] = useState<string>('');
  const [pcExportData, setPcExportData] = useState<PcExportPayload | null>(null);
  const [proposalData, setProposalData] = useState<ProposalCreatedPayload | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [timeToVerifiedMs, setTimeToVerifiedMs] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number>(3);
  const [elapsedRestartSeconds, setElapsedRestartSeconds] = useState<number>(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const seenSeqsRef = useRef<Set<number>>(new Set());
  const restartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedTsRef = useRef<string | null>(null);

  const stopRestartTimer = () => {
    if (restartTimerRef.current) {
      clearInterval(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const resetStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    stopRestartTimer();
    seenSeqsRef.current.clear();
    startedTsRef.current = null;
    setExecutionId(null);
    setEvents([]);
    setNodesMap({});
    setRuleCount(0);
    setOverallStatus('idle');
    setCurrentIteration(1);
    setCurrentRunId(null);
    setBlockedData(null);
    setRepairData(null);
    setReviewData(null);
    setPcStage('idle');
    setPcDetail('');
    setPcExportData(null);
    setProposalData(null);
    setToolCalls([]);
    setIsConnected(false);
    setIsStreaming(false);
    setLastError(null);
    setTimeToVerifiedMs(null);
    setElapsedRestartSeconds(0);
  }, []);

  const handleEvent = useCallback((event: BaseEvent) => {
    if (seenSeqsRef.current.has(event.seq)) return; // SSE may replay after a reconnect
    seenSeqsRef.current.add(event.seq);
    setEvents(prev => [...prev, event]);
    const p = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'run.started':
        startedTsRef.current = event.ts;
        setOverallStatus('running');
        break;

      case 'proposal.created': {
        const payload = p as unknown as ProposalCreatedPayload;
        setProposalData(payload);
        if (payload.iteration) setCurrentIteration(payload.iteration);
        break;
      }

      case 'tool.called':
        setToolCalls(prev => [
          ...prev,
          { seq: event.seq, tool: String(p.tool), args: p.args as Record<string, unknown>, ts: event.ts },
        ]);
        break;

      case 'tool.result':
        setToolCalls(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].tool === p.tool && !updated[i].result) {
              updated[i] = { ...updated[i], result: p.result as Record<string, unknown> };
              break;
            }
          }
          return updated;
        });
        break;

      case 'verify.started': {
        // A new verification run starts: the graph shows this run only.
        const payload = p as unknown as VerifyStartedPayload;
        setNodesMap({});
        setCurrentRunId(payload.runId);
        setRuleCount(payload.ruleCount || 0);
        if (payload.iteration) setCurrentIteration(payload.iteration);
        setOverallStatus('running');
        break;
      }

      case 'verify.node': {
        const node = p as unknown as NodeResult;
        setNodesMap(prev => {
          const existing = prev[node.ruleCode];
          const clauseResults = [...(existing?.clauseResults || []), node];
          const head = existing ? worst(existing, node) : node;
          return { ...prev, [node.ruleCode]: { ...head, clauseResults } };
        });
        break;
      }

      case 'gate.blocked':
        setBlockedData(p as unknown as GateBlockedPayload);
        setOverallStatus('blocked');
        break;

      case 'planner.repair': {
        const payload = p as unknown as PlannerRepairPayload;
        setRepairData(payload); // keep blockedData: the BLOCKED card stays visible, labelled as repaired
        setOverallStatus('repairing');
        if (payload.iteration) setCurrentIteration(payload.iteration);
        break;
      }

      case 'gate.passed':
        setOverallStatus('passed');
        break;

      case 'review.requested':
        setReviewData(p as unknown as ReviewRequestedPayload);
        setOverallStatus('review_pending');
        if (startedTsRef.current) {
          setTimeToVerifiedMs(new Date(event.ts).getTime() - new Date(startedTsRef.current).getTime());
        }
        break;

      case 'review.decided':
        setOverallStatus(p.decision === 'approved' ? 'approved' : 'rejected');
        break;

      case 'pc.export': {
        const payload = p as unknown as PcExportPayload;
        setPcExportData(payload);
        setPcStage('export');
        setOverallStatus('deploying');
        setPcDetail(`Package built for ${payload.productCode}: ${payload.files} files, ${payload.packageBytes} bytes`);
        break;
      }
      case 'pc.queued':
        setPcStage('queued');
        setPcDetail('Package queued; waiting for the PolicyCenter agent on the VM to pull it');
        break;
      case 'pc.pulled': {
        const payload = p as unknown as PcStatusPayload;
        setPcStage('pulled');
        setPcDetail(`Agent ${payload.agent || ''} pulled the package and is re-verifying its signature`);
        break;
      }
      case 'pc.write':
        setPcStage('write');
        setPcDetail(String(p.detail || 'Writing overlay into modules/configuration'));
        break;
      case 'pc.restart':
        setPcStage('restart');
        setPcDetail(String(p.detail || 'Restarting PolicyCenter'));
        if (!restartTimerRef.current) {
          restartTimerRef.current = setInterval(() => setElapsedRestartSeconds(s => s + 1), 1000);
        }
        break;
      case 'pc.ready':
        setPcStage('ready');
        setPcDetail(String(p.detail || 'PolicyCenter is up'));
        stopRestartTimer();
        break;
      case 'pc.verified':
        setPcStage('verified');
        setOverallStatus('deployed');
        setPcDetail(String(p.detail || 'ProductModelAPI confirmed the SMCyber patterns'));
        break;
      case 'pc.failed':
        setPcStage('failed');
        setOverallStatus('error');
        setPcDetail(String(p.detail || 'PolicyCenter deployment failed'));
        stopRestartTimer();
        break;

      case 'run.completed': {
        const payload = p as unknown as RunCompletedPayload;
        if (payload.status === 'error') {
          setOverallStatus('error');
          setLastError(payload.error || 'The run ended with an error');
        }
        if (payload.status === 'rejected') setOverallStatus('rejected');
        if (payload.status === 'blocked') setOverallStatus('blocked');
        break;
      }
      default:
        break;
    }
  }, []);

  const connect = useCallback(
    (url: string) => {
      const es = new EventSource(url);
      eventSourceRef.current = es;
      es.onopen = () => setIsConnected(true);
      es.onmessage = e => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        // The browser reconnects on its own (sending Last-Event-ID); only a CLOSED source is final.
        setIsConnected(false);
        if (es.readyState === EventSource.CLOSED) setIsStreaming(false);
      };
    },
    [handleEvent]
  );

  /** Real run: the backend creates the execution, runs the planner and the deterministic gate. */
  const startLive = useCallback(
    async (prompt: string) => {
      resetStream();
      setMode('live');
      setOverallStatus('starting');
      setIsStreaming(true);
      try {
        const { executionId: id } = await api.startExecution(prompt);
        setExecutionId(id);
        connect(api.streamUrl(id));
      } catch (e) {
        setIsStreaming(false);
        setOverallStatus('error');
        setLastError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
      }
    },
    [resetStream, connect]
  );

  /** Recorded replay of fixtures/events_demo_run.jsonl (a real recorded run). Clearly labelled in the UI. */
  const startRecorded = useCallback(() => {
    resetStream();
    setMode('recorded');
    setIsStreaming(true);
    connect(`/api/dev-stream?speed=${speed}`);
  }, [resetStream, connect, speed]);

  const stopStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    stopRestartTimer();
    setIsStreaming(false);
    setIsConnected(false);
  }, []);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
      stopRestartTimer();
    },
    []
  );

  const nodeValues = Object.values(nodesMap);
  const total = ruleCount || nodeValues.length;
  const nodeStatusSummary = {
    passed: nodeValues.filter(n => n.result === 'PASSED').length,
    failed: nodeValues.filter(n => n.result === 'FAILED').length,
    skipped: nodeValues.filter(n => n.result === 'SKIPPED').length,
    needsReview: nodeValues.filter(n => n.result === 'NEEDS_REVIEW').length,
    pending: Math.max(0, total - nodeValues.length),
    total,
  };

  return {
    mode,
    executionId,
    events,
    nodesMap,
    nodeStatusSummary,
    overallStatus,
    currentIteration,
    currentRunId,
    blockedData,
    repairData,
    reviewData,
    pcStage,
    pcDetail,
    pcExportData,
    proposalData,
    toolCalls,
    isConnected,
    isStreaming,
    lastError,
    timeToVerifiedMs,
    speed,
    setSpeed,
    startLive,
    startRecorded,
    stopStream,
    resetStream,
    elapsedRestartSeconds,
  };
}
