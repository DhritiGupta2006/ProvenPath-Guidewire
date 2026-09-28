'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, TrendingUp, Sparkles, Award, Sliders, X, Move } from 'lucide-react';
import { EvalMetrics } from '@/lib/contracts';
import { api, ApiError } from '@/lib/api';

interface MetricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Measured on the current live run: run.started → review.requested. */
  timeToVerifiedMs: number | null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Numbers from GET /api/v1/metrics (eval/metrics.json written by the Gosu eval harness). Nothing hard-coded. */
export function MetricsPanel({ isOpen, onClose, timeToVerifiedMs }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ startX: 0, startY: 0, initX: 0, initY: 0 });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .metrics()
      .then(m => {
        if (cancelled) return;
        setMetrics(m);
        setError(null);
      })
      .catch(e => !cancelled && setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e)));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget.closest('[data-modal-card="true"]') as HTMLElement;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos ? pos.x : rect.left, initY: pos ? pos.y : rect.top };
    const move = (m: MouseEvent) =>
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 350, dragRef.current.initX + m.clientX - dragRef.current.startX)),
        y: Math.max(10, Math.min(window.innerHeight - 150, dragRef.current.initY + m.clientY - dragRef.current.startY)),
      });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const card = 'p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between font-mono';

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div
        data-modal-card="true"
        onClick={e => e.stopPropagation()}
        style={pos ? { position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`, margin: 0 } : undefined}
        className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-3xl w-full p-6 shadow-[0_0_60px_rgba(0,0,0,0.9)] text-white relative"
      >
        <div onMouseDown={handleMouseDown} className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-5 cursor-grab select-none">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 border border-white/20">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono tracking-wide">VERIFICATION METRICS</h2>
              <p className="text-xs text-neutral-400">
                Labelled eval corpus run through the real gate ({metrics ? `${metrics.total} items` : '…'}). Denominators shown.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Move className="w-3.5 h-3.5 text-neutral-500" />
            <button aria-label="Close metrics" onClick={onClose} className="text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-400 text-xs font-mono">{error}</div>}

        {metrics && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className={card}>
                <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                  <span>FALSE-PASS</span>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="my-2">
                  <div className={`text-3xl font-black tracking-tight ${metrics.falsePassCount === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {metrics.falsePassCount} / {metrics.falsePassDenominator}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{pct(metrics.falsePassRate)} · target 0</div>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight font-sans">Non-compliant items that wrongly passed the gate.</p>
              </div>
              <div className={card}>
                <div className="flex items-center justify-between text-xs text-neutral-400 font-semibold">
                  <span>FALSE-BLOCK</span>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold">
                    {metrics.falseBlockCount} / {metrics.falseBlockDenominator}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{pct(metrics.falseBlockRate)}</div>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight font-sans">Compliant items wrongly blocked (reported even when non-zero).</p>
              </div>
              <div className={card}>
                <div className="flex items-center justify-between text-xs text-neutral-400 font-semibold">
                  <span>ACCURACY · PROVENANCE</span>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold">{pct(metrics.accuracy)}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">provenance completeness {pct(metrics.provenanceCompleteness)}</div>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight font-sans">Share of approved clauses with a matching citation.</p>
              </div>
            </div>

            {metrics.perLayer && (
              <div className="mb-5 grid grid-cols-6 gap-2 text-[10px] font-mono">
                {Object.entries(metrics.perLayer).map(([layer, v]) => (
                  <div key={layer} className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-center">
                    <div className="text-neutral-400">{layer}</div>
                    <div className="text-white">
                      {v.passed} ok · <span className={v.failed ? 'text-rose-400' : ''}>{v.failed} fail</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-neutral-200">
            <Sliders className="w-4 h-4" /> BEFORE / AFTER
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
              <div className="text-rose-400 font-bold uppercase text-[10px]">Manual product configuration</div>
              <div className="text-xl font-bold">~3 weeks</div>
              <p className="text-[10px] text-neutral-400 font-sans">Baseline estimate from our PRD, not a measurement.</p>
            </div>
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1">
              <div className="text-emerald-400 font-bold uppercase text-[10px]">This run: request → verified, awaiting review</div>
              <div className="text-xl font-bold text-emerald-400">
                {timeToVerifiedMs != null ? `${(timeToVerifiedMs / 1000).toFixed(1)} s` : '—'}
              </div>
              <p className="text-[10px] text-neutral-400 font-sans">
                {timeToVerifiedMs != null
                  ? 'Measured from this run’s event timestamps (the reviewer’s time and the PolicyCenter restart come on top).'
                  : 'Start a run to measure it.'}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-neutral-500 font-mono">
          Determinism is covered by the backend test suite (50 identical verdict hashes) and by the Re-verify button on each run.
        </p>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-mono font-bold cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
