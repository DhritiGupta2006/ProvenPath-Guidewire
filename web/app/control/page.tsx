'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useExecutionStream, StreamMode } from '@/lib/useExecutionStream';
import { api, ApiError, shortHash } from '@/lib/api';
import { GateBlockedPayload, HealthResponse, Proposal, ReviewDecidedPayload, RuleDefinition } from '@/lib/contracts';
import { Composer, TopBar, stageOf } from '@/components/control/Chrome';
import { GateGraph } from '@/components/control/GateGraph';
import { ActivityView, EventLog } from '@/components/control/Activity';
import { BlockedView, RuleView } from '@/components/control/Verdicts';
import { ReviewView } from '@/components/control/ReviewView';
import { DeployView } from '@/components/control/DeployView';
import { MetricsDialog, ProvenanceSheet } from '@/components/control/Overlays';
import { Ticker } from '@/components/ui/primitives';

const DEFAULT_PROMPT = 'Cyber insurance for Indian startups, up to ₹50L coverage';

type Toast = { tone: 'pass' | 'fail' | 'muted'; title: string; detail?: string } | null;

const HEADLINE: Record<string, string> = {
  idle: 'Connecting',
  starting: 'Starting…',
  running: 'Verifying',
  blocked: 'Blocked',
  repairing: 'Repairing',
  passed: 'Passed',
  review_pending: 'Awaiting sign-off',
  approved: 'Approved',
  rejected: 'Rejected',
  deploying: 'Deploying',
  deployed: 'Live in PolicyCenter',
  error: 'Error',
};

function MissionControl() {
  const params = useSearchParams();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selectedMode, setSelectedMode] = useState<StreamMode>(params.get('mode') === 'recorded' ? 'recorded' : 'live');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDefinition[]>([]);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [clauseId, setClauseId] = useState<string | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [tab, setTab] = useState<'now' | 'trace'>('now');
  const [tamper, setTamper] = useState<GateBlockedPayload | null>(null);
  const [showDeploy, setShowDeploy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = useExecutionStream();
  const { events, nodesMap } = s;

  const notify = (t: NonNullable<Toast>) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then(h => !cancelled && setHealth(h))
      .catch(e => !cancelled && setHealthError(e instanceof ApiError ? e.message : String(e)));
    api
      .rules()
      .then(r => !cancelled && setRules(r.rules))
      .catch(e => !cancelled && setRulesError(e instanceof ApiError ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Arriving from "Watch a recorded run": start the replay straight away.
  // (No run-once ref: under StrictMode the first mount's stream is closed on cleanup, so it must restart.)
  const { startRecorded, stopStream } = s;
  const wantRecorded = params.get('mode') === 'recorded';
  useEffect(() => {
    if (!wantRecorded) return;
    startRecorded();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per mount, not when the replay speed changes
  }, [wantRecorded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (clauseId) setClauseId(null);
      else if (metricsOpen) setMetricsOpen(false);
      else if (selectedRule) setSelectedRule(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clauseId, metricsOpen, selectedRule]);

  // Without the backend, a recorded replay still draws the graph from the replayed events (no dependency edges).
  const graphRules = useMemo<RuleDefinition[]>(() => {
    if (rules.length > 0 || !rulesError) return rules;
    return Object.values(nodesMap)
      .filter(n => n.ruleCode !== 'UNMATCHED')
      .map(n => ({ ruleCode: n.ruleCode, name: n.ruleCode, layer: n.layer, appliesTo: '', dependsOn: [], sourceCode: n.sourceCode }));
  }, [rules, rulesError, nodesMap]);

  const lastGate = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'gate.blocked') return { seq: e.seq, kind: 'blocked' as const };
      if (e.type === 'gate.passed') return { seq: e.seq, kind: 'passed' as const };
    }
    return null;
  })();

  const decided = (() => {
    const e = [...events].reverse().find(x => x.type === 'review.decided');
    return e ? (e.payload as unknown as ReviewDecidedPayload) : null;
  })();

  const started = s.isStreaming || s.events.length > 0 || s.overallStatus !== 'idle';
  const mode = started ? s.mode : selectedMode;

  const run = () => {
    setTamper(null);
    setShowDeploy(false);
    setSelectedRule(null);
    setTab('now');
    if (selectedMode === 'live') void s.startLive(prompt);
    else s.startRecorded();
  };

  const newRun = () => {
    setTamper(null);
    setShowDeploy(false);
    setSelectedRule(null);
    s.resetStream();
  };

  const reverify = async () => {
    if (!s.executionId) return;
    try {
      const r = await api.replay(s.executionId);
      notify({
        tone: r.match ? 'pass' : 'fail',
        title: r.match ? 'Same verdict, same hash' : 'Verdict hash differs',
        detail: `${shortHash(r.originalHash, 10)} → ${shortHash(r.verdictHash, 10)}${r.rulesetChanged ? ' · rules changed since' : ''}`,
      });
    } catch (e) {
      notify({ tone: 'fail', title: 'Re-verify failed', detail: e instanceof ApiError ? e.message : String(e) });
    }
  };

  /** Take the compliant demo proposal, change one word of a cited regulation, send it to the real gate. */
  const tamperTest = async () => {
    notify({ tone: 'muted', title: 'Tamper test running', detail: 'Changing “shall” to “may” in IRDAI §4.1…' });
    try {
      const res = await fetch('/api/fixtures/proposal_demo_fixed.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('fixture proposal not found');
      const proposal = (await res.json()) as Proposal;
      const cite = proposal.clauses?.[0]?.citations?.[0];
      if (!cite) throw new Error('fixture has no citation to tamper with');
      cite.textSnippet = cite.textSnippet.replace(/\bshall\b/, 'may') + ' (paraphrased by the model)';
      const verdict = await api.verify(proposal);
      const failures = verdict.nodes.filter(n => n.result === 'FAILED' || n.result === 'NEEDS_REVIEW');
      setTamper({
        runId: verdict.runId,
        iteration: proposal.iteration,
        verdictHash: verdict.verdictHash,
        failedRules: Array.from(new Set(failures.filter(f => f.result === 'FAILED').map(f => f.ruleCode))),
        skippedRules: Array.from(new Set(verdict.nodes.filter(n => n.result === 'SKIPPED').map(n => n.ruleCode))),
        needsReviewClauses: [],
        failures,
        writtenToPolicyCenter: 0,
      });
      setSelectedRule(null);
      setTab('now');
      if (verdict.status === 'PASSED') notify({ tone: 'fail', title: 'Unexpected: the tampered proposal passed' });
      else notify({ tone: 'pass', title: 'Tamper caught', detail: `${failures.length} blocking result${failures.length === 1 ? '' : 's'} · nothing stored` });
    } catch (e) {
      notify({ tone: 'fail', title: 'Tamper test failed', detail: e instanceof ApiError ? `${e.code}: ${e.message}` : String(e) });
    }
  };

  const repairedIteration = s.blockedData && s.repairData && s.repairData.runId === s.blockedData.runId ? s.repairData.iteration : null;
  const selectedDef = selectedRule ? graphRules.find(r => r.ruleCode === selectedRule) : null;
  const canDeploy = s.overallStatus === 'approved' && s.mode === 'live';

  let nowKey: string;
  let nowView: React.ReactNode;
  if (selectedDef) {
    nowKey = `rule-${selectedDef.ruleCode}`;
    nowView = <RuleView rule={selectedDef} state={s.nodesMap[selectedDef.ruleCode]} onBack={() => setSelectedRule(null)} onOpenProvenance={setClauseId} />;
  } else if (tamper) {
    nowKey = 'tamper';
    nowView = <BlockedView data={tamper} isTamper repairedIteration={null} onDismiss={() => setTamper(null)} />;
  } else if (showDeploy || s.pcStage !== 'idle') {
    nowKey = 'deploy';
    nowView = (
      <DeployView
        executionId={s.executionId}
        mode={s.mode}
        canDeploy={canDeploy}
        pcStage={s.pcStage}
        pcDetail={s.pcDetail}
        pcExportData={s.pcExportData}
        elapsedRestartSeconds={s.elapsedRestartSeconds}
      />
    );
  } else if (s.reviewData) {
    nowKey = 'review';
    nowView = (
      <ReviewView
        executionId={s.executionId}
        mode={s.mode}
        reviewData={s.reviewData}
        decided={decided}
        onDeploy={() => setShowDeploy(true)}
        onOpenProvenance={setClauseId}
      />
    );
  } else if (s.blockedData && s.overallStatus !== 'passed') {
    nowKey = `blocked-${s.blockedData.runId}`;
    nowView = <BlockedView data={s.blockedData} isTamper={false} repairedIteration={repairedIteration} onOpenProvenance={setClauseId} />;
  } else {
    nowKey = 'activity';
    nowView = <ActivityView events={s.events} />;
  }

  const sum = s.nodeStatusSummary;
  const { tone } = stageOf(s.overallStatus, !!s.currentRunId);
  const headline = HEADLINE[s.overallStatus] || '';
  const statusColor = tone === 'fail' ? 'text-fail' : ['passed', 'approved', 'deployed'].includes(s.overallStatus) ? 'text-pass' : 'text-fg';
  const segments = graphRules.map(r => s.nodesMap[r.ruleCode]?.result || 'PENDING');

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        status={s.overallStatus}
        hasRun={started}
        mode={mode}
        health={health}
        healthError={healthError}
        canReverify={!!s.executionId && s.mode === 'live' && !!s.currentRunId}
        onReverify={() => void reverify()}
        onTamper={() => void tamperTest()}
        onMetrics={() => setMetricsOpen(true)}
        onNewRun={started ? newRun : null}
      />

      <LayoutGroup>
        <AnimatePresence mode="wait">
          {!started && !tamper ? (
            <motion.main key="compose" className="relative flex-1 overflow-hidden" exit={{ opacity: 0, filter: 'blur(6px)' }} transition={{ duration: 0.35 }}>
              <div className="absolute inset-0 bg-grid mask-radial opacity-70" />
              <Composer
                prompt={prompt}
                setPrompt={setPrompt}
                mode={selectedMode}
                setMode={setSelectedMode}
                onRun={run}
                health={health}
                healthError={healthError}
                ruleCount={rules.length}
              />
            </motion.main>
          ) : (
            <motion.main
              key="stage"
              className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Stage: prompt, verdict, graph */}
              <section className="flex min-h-0 flex-col gap-6 overflow-y-auto p-6 lg:overflow-hidden">
                <motion.div
                  layoutId="composer"
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5"
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Request</span>
                  <span className="truncate text-sm text-fg">
                    {(s.events.find(e => e.type === 'run.started')?.payload.prompt as string | undefined) ?? (tamper && !started ? 'Tamper test on the compliant demo proposal' : prompt)}
                  </span>
                  {s.executionId && <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{s.executionId.slice(0, 13)}</span>}
                </motion.div>

                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                      {s.currentRunId ? `Iteration ${s.currentIteration} · run ${s.currentRunId.slice(0, 8)}` : started ? 'Planner drafting' : 'Tamper test'}
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={headline}
                        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                        transition={{ duration: 0.35 }}
                        className={`mt-1 font-serif text-5xl italic leading-none ${statusColor}`}
                      >
                        {headline || '—'}
                        {(s.overallStatus === 'running' || s.overallStatus === 'starting' || s.overallStatus === 'repairing') && (
                          <span className="text-shimmer ml-1 not-italic">…</span>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="flex items-end gap-6 text-right">
                    {[
                      { k: 'passed', v: sum.passed, c: 'text-pass' },
                      { k: 'failed', v: sum.failed, c: sum.failed ? 'text-fail' : 'text-fg' },
                      { k: 'skipped', v: sum.skipped, c: 'text-muted' },
                      { k: 'pending', v: sum.pending, c: 'text-muted' },
                    ].map(x => (
                      <div key={x.k}>
                        <div className={`text-2xl font-medium tabular-nums ${x.c}`}>
                          <Ticker value={x.v} />
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-faint">{x.k}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex h-1 gap-[3px]">
                  {segments.map((st, i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full transition-colors duration-500 ${
                        st === 'PASSED' ? 'bg-pass' : st === 'FAILED' ? 'bg-fail' : st === 'NEEDS_REVIEW' ? 'bg-warn' : st === 'SKIPPED' ? 'bg-faint' : 'bg-line-strong'
                      }`}
                    />
                  ))}
                </div>

                <div className="min-h-[420px] flex-1">
                  {rulesError && rules.length === 0 && graphRules.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted">Rule graph unavailable: {rulesError}</div>
                  ) : (
                    <GateGraph
                      rules={graphRules}
                      nodesMap={s.nodesMap}
                      runKey={s.currentRunId}
                      selected={selectedRule}
                      onSelect={code => {
                        setSelectedRule(code);
                        setTab('now');
                      }}
                      stamp={lastGate}
                    />
                  )}
                </div>
              </section>

              {/* Inspector */}
              <aside className="flex min-h-0 flex-col border-t border-line bg-surface/50 lg:border-l lg:border-t-0">
                <div className="flex shrink-0 items-center gap-1 border-b border-line px-4 py-2.5">
                  {(['now', 'trace'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`relative rounded-md px-3 py-1.5 text-xs transition-colors ${tab === t ? 'text-fg' : 'text-muted hover:text-fg'}`}
                    >
                      {tab === t && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-md bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                      <span className="relative">{t === 'now' ? 'Now' : `Trace · ${s.events.length}`}</span>
                    </button>
                  ))}
                  {s.lastError && <span className="ml-auto truncate text-[11px] text-fail" title={s.lastError}>{s.lastError}</span>}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab === 'now' ? nowKey : 'trace'}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {tab === 'now' ? nowView : <EventLog events={s.events} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </aside>
            </motion.main>
          )}
        </AnimatePresence>
      </LayoutGroup>

      <ProvenanceSheet clauseId={clauseId} executionId={s.executionId} onClose={() => setClauseId(null)} />
      <MetricsDialog open={metricsOpen} onClose={() => setMetricsOpen(false)} timeToVerifiedMs={s.timeToVerifiedMs} />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 py-3 pl-4 pr-3 shadow-2xl shadow-black"
          >
            {toast.tone === 'pass' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-pass" />
            ) : toast.tone === 'fail' ? (
              <XCircle className="h-4 w-4 shrink-0 text-fail" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />
            )}
            <div className="min-w-0">
              <div className="text-sm">{toast.title}</div>
              {toast.detail && <div className="truncate font-mono text-[11px] text-muted">{toast.detail}</div>}
            </div>
            <button aria-label="Dismiss" onClick={() => setToast(null)} className="ml-2 rounded p-1 text-muted hover:text-fg">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ControlPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-bg" />}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <MissionControl />
      </motion.div>
    </Suspense>
  );
}
