'use client';

import React, { useState } from 'react';
import { RotateCcw, Bug, CheckCircle2, XCircle, Play, Zap } from 'lucide-react';
import { GateBlockedPayload, Proposal } from '@/lib/contracts';
import { api, ApiError, shortHash } from '@/lib/api';
import { StreamMode } from '@/lib/useExecutionStream';

interface ReplayTamperControlsProps {
  mode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  executionId: string | null;
  speed: number;
  setSpeed: (speed: number) => void;
  onStart: () => void;
  onReset: () => void;
  isStreaming: boolean;
  onTamperResult?: (data: GateBlockedPayload) => void;
  onError?: (message: string) => void;
  isDark?: boolean;
}

export function ReplayTamperControls({
  mode,
  onModeChange,
  executionId,
  speed,
  setSpeed,
  onStart,
  onReset,
  isStreaming,
  onTamperResult,
  onError,
  isDark = true,
}: ReplayTamperControlsProps) {
  const [reverify, setReverify] = useState<{ match: boolean; line: string; detail: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isTampering, setIsTampering] = useState(false);

  /** Re-runs the deterministic gate on the stored proposal of this execution's latest run. */
  const handleReverify = async () => {
    if (!executionId) return;
    setIsVerifying(true);
    try {
      const r = await api.replay(executionId);
      setReverify({
        match: r.match,
        line: r.match ? 'Verdict hash identical ✔' : 'Verdict hash DIFFERS',
        detail: `${shortHash(r.originalHash, 10)} vs ${shortHash(r.verdictHash, 10)}${r.rulesetChanged ? ' · rules changed since' : ''}`,
      });
    } catch (e) {
      setReverify({ match: false, line: 'Re-verify failed', detail: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setIsVerifying(false);
      setTimeout(() => setReverify(null), 6000);
    }
  };

  /**
   * Tamper demo: take the real, compliant demo proposal, change ONE word of a cited regulatory snippet
   * (what a hallucinating LLM does), and send it to the real gate. The BLOCKED verdict comes from the backend.
   */
  const handleTamper = async () => {
    setIsTampering(true);
    try {
      const res = await fetch('/api/fixtures/proposal_demo_fixed.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('fixture proposal not found');
      const proposal = (await res.json()) as Proposal;
      const cite = proposal.clauses?.[0]?.citations?.[0];
      if (!cite) throw new Error('fixture has no citation to tamper with');
      cite.textSnippet = cite.textSnippet.replace(/\bshall\b/, 'may') + ' (paraphrased by the model)';
      const verdict = await api.verify(proposal);
      const failures = verdict.nodes.filter(n => n.result === 'FAILED' || n.result === 'NEEDS_REVIEW');
      onTamperResult?.({
        runId: verdict.runId,
        iteration: proposal.iteration,
        verdictHash: verdict.verdictHash,
        failedRules: Array.from(new Set(failures.filter(f => f.result === 'FAILED').map(f => f.ruleCode))),
        skippedRules: Array.from(new Set(verdict.nodes.filter(n => n.result === 'SKIPPED').map(n => n.ruleCode))),
        needsReviewClauses: [],
        failures,
        writtenToPolicyCenter: 0,
      });
      if (verdict.status === 'PASSED') onError?.('Unexpected: the tampered proposal PASSED. Check the SOURCE rules.');
    } catch (e) {
      onError?.(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setIsTampering(false);
    }
  };

  const seg = (active: boolean) =>
    `px-2 py-0.5 rounded transition-colors cursor-pointer font-medium ${
      active ? (isDark ? 'bg-white text-black font-bold' : 'bg-black text-white font-bold') : isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-black'
    }`;
  const shell = `flex items-center rounded-lg p-0.5 text-[11px] font-mono border ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-300'}`;

  return (
    <div className="flex items-center gap-2">
      {/* Live = real backend run; Recorded = replay of a recorded real run (clearly labelled) */}
      <div className={shell} title="Live: real Gosu backend. Recorded: replay of a recorded run.">
        <button disabled={isStreaming} onClick={() => onModeChange('live')} className={seg(mode === 'live')}>
          Live
        </button>
        <button disabled={isStreaming} onClick={() => onModeChange('recorded')} className={seg(mode === 'recorded')}>
          Recorded
        </button>
      </div>

      {mode === 'recorded' && (
        <div className={shell}>
          {[1, 3, 10].map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={seg(speed === s)}>
              {s}×
            </button>
          ))}
        </div>
      )}

      {isStreaming ? (
        <button
          onClick={onReset}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border cursor-pointer ${
            isDark ? 'bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      ) : (
        <button
          onClick={onStart}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer ${
            isDark ? 'bg-white hover:bg-neutral-200 text-black' : 'bg-black hover:bg-neutral-800 text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" /> {mode === 'live' ? 'Run' : 'Play recording'}
        </button>
      )}

      <div className="relative">
        <button
          onClick={handleReverify}
          disabled={isVerifying || !executionId || mode !== 'live'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isDark ? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-400 border-emerald-700/60' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
          }`}
          title={executionId ? 'Re-run the deterministic gate on this run’s stored proposal' : 'Needs a live run'}
        >
          <Zap className="w-3.5 h-3.5" /> Re-verify
        </button>
        {reverify && (
          <div
            className={`absolute right-0 top-full mt-2 w-72 p-2.5 rounded-lg border shadow-2xl z-50 text-[11px] font-mono flex items-center gap-2 ${
              reverify.match ? 'border-emerald-500' : 'border-rose-500'
            } ${isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900'}`}
          >
            {reverify.match ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <div className="min-w-0">
              <div className="font-bold">{reverify.line}</div>
              <div className={`text-[10px] truncate ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>{reverify.detail}</div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleTamper}
        disabled={isTampering}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border cursor-pointer disabled:opacity-50 ${
          isDark ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border-rose-600/80' : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
        }`}
        title="Change one word of a cited regulation in the compliant proposal and send it to the real gate"
      >
        <Bug className="w-3.5 h-3.5" /> {isTampering ? 'Verifying…' : 'Tamper test'}
      </button>
    </div>
  );
}
