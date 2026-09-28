'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useExecutionStream, StreamMode } from '@/lib/useExecutionStream';
import { useTheme } from '@/lib/useTheme';
import { api, ApiError } from '@/lib/api';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { TraceTimeline } from '@/components/timeline/TraceTimeline';
import { RuleDag } from '@/components/dag/RuleDag';
import { ToolsPanel } from '@/components/tools/ToolsPanel';
import { BlockedCard } from '@/components/gates/BlockedCard';
import { ReviewerPanel } from '@/components/gates/ReviewerPanel';
import { DeployPanel } from '@/components/deploy/DeployPanel';
import { ProvenanceDrawer } from '@/components/drawers/ProvenanceDrawer';
import { MetricsPanel } from '@/components/metrics/MetricsPanel';
import { GateBlockedPayload, HealthResponse, RuleDefinition } from '@/lib/contracts';

const DEFAULT_PROMPT = 'Cyber insurance for Indian startups, up to ₹50L coverage';

export default function MissionControlPage() {
  const { isDark, toggleTheme } = useTheme();

  const [promptText, setPromptText] = useState<string>(DEFAULT_PROMPT);
  const [selectedMode, setSelectedMode] = useState<StreamMode>('live');
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(true);
  const [tamperBlocked, setTamperBlocked] = useState<GateBlockedPayload | null>(null);
  const [dismissedBlockedRun, setDismissedBlockedRun] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDefinition[]>([]);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const stream = useExecutionStream();
  const {
    mode,
    executionId,
    events,
    nodesMap,
    nodeStatusSummary,
    overallStatus,
    currentIteration,
    blockedData,
    repairData,
    reviewData,
    pcStage,
    pcDetail,
    pcExportData,
    toolCalls,
    isStreaming,
    lastError,
    timeToVerifiedMs,
    speed,
    setSpeed,
    startLive,
    startRecorded,
    resetStream,
    elapsedRestartSeconds,
  } = stream;

  // Backend health + the real rule graph (GET /health, GET /rules).
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

  // Offline recorded replay: without the backend, derive the graph nodes from the replayed events (no dependency edges).
  const graphRules = useMemo<RuleDefinition[]>(() => {
    if (rules.length > 0 || !rulesError) return rules;
    return Object.values(nodesMap)
      .filter(n => n.ruleCode !== 'UNMATCHED')
      .map(n => ({ ruleCode: n.ruleCode, name: n.ruleCode, layer: n.layer, appliesTo: '', dependsOn: [], sourceCode: n.sourceCode }));
  }, [rules, rulesError, nodesMap]);

  const handleStart = () => {
    setIsReviewOpen(true);
    setTamperBlocked(null);
    setUiError(null);
    if (selectedMode === 'live') {
      void startLive(promptText);
    } else {
      startRecorded();
    }
  };

  const handleReset = () => {
    setIsReviewOpen(true);
    setTamperBlocked(null);
    setUiError(null);
    resetStream();
  };

  // The BLOCKED card stays up (even after the planner repairs) until the user dismisses it: it's the key demo beat.
  const runBlocked = blockedData && blockedData.runId !== dismissedBlockedRun ? blockedData : null;
  const effectiveBlockedData = tamperBlocked || runBlocked;
  const repairedIteration = !tamperBlocked && runBlocked && repairData && repairData.runId === runBlocked.runId ? repairData.iteration : null;
  const showReviewer =
    !!reviewData && isReviewOpen && (overallStatus === 'review_pending' || overallStatus === 'approved' || overallStatus === 'rejected');
  const errorText = uiError || lastError;

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden font-sans select-none transition-colors ${
        isDark ? 'bg-[#050507] text-white' : 'bg-[#f8fafc] text-neutral-900'
      }`}
    >
      <Navbar
        overallStatus={overallStatus}
        mode={isStreaming ? mode : selectedMode}
        onModeChange={setSelectedMode}
        executionId={executionId}
        health={health}
        healthError={healthError}
        isStreaming={isStreaming}
        speed={speed}
        setSpeed={setSpeed}
        onStart={handleStart}
        onReset={handleReset}
        onOpenMetrics={() => setIsMetricsOpen(true)}
        onOpenDeploy={() => setIsDeployOpen(true)}
        onOpenReview={() => setIsReviewOpen(true)}
        onTamperResult={setTamperBlocked}
        onError={setUiError}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <div className="px-3 pt-3 shrink-0 space-y-2">
        <div
          className={`flex items-center gap-2 border rounded-xl p-2 transition-colors ${
            isDark ? 'bg-neutral-950/80 border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900 shadow-sm'
          }`}
        >
          <span className={`text-[10px] font-mono font-bold px-2 uppercase tracking-wider shrink-0 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Product request:
          </span>
          <input
            type="text"
            value={promptText}
            disabled={isStreaming || selectedMode === 'recorded'}
            onChange={e => setPromptText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isStreaming && handleStart()}
            placeholder="Describe the insurance product in plain language…"
            className="flex-1 bg-transparent text-xs font-mono outline-none px-1 disabled:opacity-60"
          />
          {selectedMode === 'live' && health && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'border-white/15 text-neutral-400' : 'border-neutral-300 text-neutral-500'}`}>
              planner: {health.llmMode === 'fixture' ? 'fixture (offline)' : health.planner}
            </span>
          )}
          <button
            onClick={() => setPromptText(DEFAULT_PROMPT)}
            disabled={isStreaming}
            className={`text-[10px] font-mono px-3 py-1 rounded border whitespace-nowrap cursor-pointer ${
              isDark ? 'bg-white/10 hover:bg-white/20 text-white border-white/20' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border-neutral-300 font-medium'
            }`}
          >
            Demo prompt (₹50L cyber)
          </button>
        </div>
        {errorText && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-500 text-xs font-mono">
            <span>{errorText}</span>
            <button onClick={() => setUiError(null)} className="px-2 cursor-pointer">
              ×
            </button>
          </div>
        )}
      </div>

      <main className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0 overflow-hidden">
        <section className="col-span-3 h-full min-h-0 flex flex-col">
          <TraceTimeline events={events} isDark={isDark} />
        </section>
        <section className="col-span-6 h-full min-h-0 flex flex-col">
          <RuleDag rules={graphRules} rulesError={rulesError} nodesMap={nodesMap} onSelectClauseId={setSelectedClauseId} isDark={isDark} />
        </section>
        <section className="col-span-3 h-full min-h-0 flex flex-col">
          <ToolsPanel toolCalls={toolCalls} isDark={isDark} />
        </section>
      </main>

      <Footer currentIteration={currentIteration} nodeStats={nodeStatusSummary} executionId={executionId} mode={mode} isDark={isDark} />

      <BlockedCard
        blockedData={effectiveBlockedData}
        isTamper={!!tamperBlocked}
        repairedIteration={repairedIteration}
        onDismiss={() => (tamperBlocked ? setTamperBlocked(null) : setDismissedBlockedRun(blockedData?.runId ?? null))}
        onOpenProvenance={setSelectedClauseId}
      />

      {showReviewer && (
        <ReviewerPanel
          executionId={executionId}
          mode={mode}
          reviewData={reviewData}
          onDeployTrigger={() => {
            setIsReviewOpen(false);
            setIsDeployOpen(true);
          }}
          onDismiss={() => setIsReviewOpen(false)}
          onOpenProvenance={setSelectedClauseId}
          isDark={isDark}
        />
      )}

      <DeployPanel
        executionId={executionId}
        mode={mode}
        canDeploy={overallStatus === 'approved' && mode === 'live'}
        pcStage={pcStage}
        pcDetail={pcDetail}
        pcExportData={pcExportData}
        elapsedRestartSeconds={elapsedRestartSeconds}
        isOpen={isDeployOpen}
        onClose={() => setIsDeployOpen(false)}
      />

      <ProvenanceDrawer clauseId={selectedClauseId} executionId={executionId} onClose={() => setSelectedClauseId(null)} />

      <MetricsPanel isOpen={isMetricsOpen} onClose={() => setIsMetricsOpen(false)} timeToVerifiedMs={timeToVerifiedMs} />
    </div>
  );
}
