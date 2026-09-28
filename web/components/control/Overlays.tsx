'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, X } from 'lucide-react';
import { EvalMetrics, ProvenanceResponse } from '@/lib/contracts';
import { api, ApiError, inr } from '@/lib/api';
import { LAYER_LABEL } from '@/lib/rules-catalog';
import { Ticker } from '@/components/ui/primitives';
import { StatusIcon } from './Verdicts';

/** Clause → the rules that checked it → the regulation it cites, straight from GET /provenance. */
export function ProvenanceSheet({ clauseId, executionId, onClose }: { clauseId: string | null; executionId: string | null; onClose: () => void }) {
  const [data, setData] = useState<ProvenanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!clauseId) return;
    let cancelled = false;
    api
      .provenance(clauseId, executionId || undefined)
      .then(d => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoadedFor(clauseId);
      })
      .catch(e => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
        setLoadedFor(clauseId);
      });
    return () => {
      cancelled = true;
    };
  }, [clauseId, executionId]);

  const loading = loadedFor !== clauseId;
  const c = data?.clause;

  return (
    <AnimatePresence>
      {clauseId && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            key="sheet"
            className="fixed inset-y-2 right-2 z-50 flex w-[min(520px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black"
            initial={{ x: '105%' }}
            animate={{ x: 0 }}
            exit={{ x: '105%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <BookOpen className="h-4 w-4 text-accent" /> Provenance · <span className="font-mono text-fg">{clauseId}</span>
              </div>
              <button aria-label="Close provenance" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              {loading && (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
                  ))}
                </div>
              )}
              {!loading && error && <p className="rounded-xl border border-fail/30 bg-fail/[0.07] p-3 font-mono text-xs text-fail">{error}</p>}

              {!loading && data && c && (
                <>
                  <div>
                    <h3 className="font-serif text-3xl italic leading-tight">{c.name || c.patternCode}</h3>
                    <div className="mt-2 font-mono text-[11px] text-muted">
                      {c.patternCode} · {c.kind} · {c.existence} · {c.owningEntityType}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        ['Limit', c.limitMaxInr != null ? inr(c.limitMaxInr) : '—'],
                        ['Deductible', c.deductibleInr != null ? inr(c.deductibleInr) : '—'],
                        ['Waiting', c.waitingHours != null ? `${c.waitingHours} h` : '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-surface-2 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-faint">{k}</div>
                          <div className="mt-1 text-sm text-fg">{v}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-faint">
                      Proposal {data.proposalId}, iteration {data.iteration}
                      {!executionId && ' (latest stored proposal with this clause)'}
                    </p>
                  </div>

                  <div>
                    <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-faint">
                      Checked by {data.checks.length} rules · run {data.runId?.slice(0, 8)} {data.runStatus}
                    </div>
                    <div className="space-y-1">
                      {data.checks.map((ch, i) => (
                        <motion.div
                          key={`${ch.rule_code}-${ch.position}`}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.03 }}
                          className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                        >
                          <StatusIcon status={ch.result} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0 flex-1 text-xs">
                            <div className="flex justify-between gap-2">
                              <span className="truncate text-fg">{ch.ruleName || ch.rule_code}</span>
                              <span className="shrink-0 font-mono text-[10px] text-faint">{ch.rule_code.replace('CYB-', '')}</span>
                            </div>
                            <div className="text-[11px] text-faint">
                              {LAYER_LABEL[ch.layer] || ch.layer}
                              {(ch.expected || ch.actual) && ` · got ${ch.actual || '—'}, rule ${ch.expected || '—'}`}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-faint">Cited regulation</div>
                    <div className="space-y-3">
                      {data.citations.map((ci, i) => (
                        <div key={`${ci.sourceCode}-${i}`} className="rounded-2xl border border-line bg-surface-2/60 p-5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[11px] text-accent">{ci.sourceCode}</span>
                            <span
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                                ci.found && ci.snippetMatchesSource ? 'bg-pass/10 text-pass' : 'bg-fail/10 text-fail'
                              }`}
                            >
                              {ci.found && ci.snippetMatchesSource && <Check className="h-3 w-3" />}
                              {!ci.found ? 'source not found' : ci.snippetMatchesSource ? 'matches the source byte for byte' : 'does not match the source'}
                            </span>
                          </div>
                          {ci.title && <div className="mt-2 text-sm text-fg">{ci.title}</div>}
                          <div className="mt-1 text-[11px] text-faint">
                            §{ci.section} · {ci.jurisdiction || '—'} · effective {ci.effectiveDate || '—'}
                          </div>
                          <blockquote className="mt-4 border-l-2 border-accent/40 pl-4 font-serif text-lg leading-snug text-fg/90">“{ci.textSnippet}”</blockquote>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-faint">Curated, illustrative IRDAI-style source set. A rule-graph check, not a legal opinion.</p>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const pct = (x: number) => x * 100;

/** Eval numbers from GET /metrics plus this run's measured time to a verified proposal. Nothing hard-coded. */
export function MetricsDialog({ open, onClose, timeToVerifiedMs }: { open: boolean; onClose: () => void; timeToVerifiedMs: number | null }) {
  const [m, setM] = useState<EvalMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .metrics()
      .then(x => {
        if (cancelled) return;
        setM(x);
        setError(null);
      })
      .catch(e => !cancelled && setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e)));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full max-w-3xl overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-2xl shadow-black"
          >
            <div className="flex items-start justify-between p-7 pb-0">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Evaluation</div>
                <h2 className="mt-1 font-serif text-4xl italic">How good is the gate?</h2>
                <p className="mt-2 text-sm text-muted">{m ? `${m.total} labelled proposals` : 'The labelled corpus'} run through the real gate. Denominators shown.</p>
              </div>
              <button aria-label="Close metrics" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && <p className="mx-7 mt-5 rounded-xl border border-fail/30 bg-fail/[0.07] p-3 font-mono text-xs text-fail">{error}</p>}

            <div className="mt-7 grid grid-cols-2 border-t border-line md:grid-cols-4">
              {[
                { k: 'False passes', v: m?.falsePassCount, of: m?.falsePassDenominator, good: m?.falsePassCount === 0, note: 'non-compliant, wrongly passed' },
                { k: 'False blocks', v: m?.falseBlockCount, of: m?.falseBlockDenominator, note: 'compliant, wrongly blocked' },
                { k: 'Accuracy', v: m ? pct(m.accuracy) : null, suffix: '%', decimals: 1, note: 'correct verdicts' },
                { k: 'Provenance', v: m ? pct(m.provenanceCompleteness) : null, suffix: '%', decimals: 1, note: 'clauses with a matching citation' },
              ].map((c, i) => (
                <div key={c.k} className={`p-6 ${i ? 'border-l border-line' : ''}`}>
                  <div className="text-[10px] uppercase tracking-wider text-faint">{c.k}</div>
                  <div className={`mt-2 text-4xl font-medium tracking-tight ${c.good ? 'text-pass' : ''}`}>
                    <Ticker value={c.v ?? null} suffix={c.suffix} decimals={c.decimals} />
                    {c.of != null && <span className="text-lg text-faint"> / {c.of}</span>}
                  </div>
                  <div className="mt-2 text-[11px] text-muted">{c.note}</div>
                </div>
              ))}
            </div>

            {m?.perLayer && (
              <div className="border-t border-line p-7">
                <div className="mb-4 text-[10px] uppercase tracking-[0.16em] text-faint">Per layer across the corpus</div>
                <div className="space-y-2.5">
                  {Object.entries(m.perLayer).map(([layer, v], i) => {
                    const total = v.passed + v.failed || 1;
                    return (
                      <div key={layer} className="flex items-center gap-4 text-xs">
                        <span className="w-28 shrink-0 text-muted">{LAYER_LABEL[layer] || layer}</span>
                        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-line">
                          <motion.div className="h-full bg-pass/70" initial={{ width: 0 }} animate={{ width: `${(v.passed / total) * 100}%` }} transition={{ delay: 0.2 + i * 0.06, duration: 0.7 }} />
                          <motion.div className="h-full bg-fail/80" initial={{ width: 0 }} animate={{ width: `${(v.failed / total) * 100}%` }} transition={{ delay: 0.3 + i * 0.06, duration: 0.7 }} />
                        </div>
                        <span className="w-24 shrink-0 text-right font-mono text-[11px] text-faint">
                          {v.passed} ok · {v.failed} fail
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 border-t border-line">
              <div className="p-7">
                <div className="text-[10px] uppercase tracking-wider text-faint">Manual configuration</div>
                <div className="mt-2 text-3xl font-medium">~3 weeks</div>
                <p className="mt-1 text-[11px] text-muted">Baseline estimate from our PRD, not a measurement.</p>
              </div>
              <div className="border-l border-line p-7">
                <div className="text-[10px] uppercase tracking-wider text-faint">This run: prompt → verified</div>
                <div className="mt-2 text-3xl font-medium text-pass">
                  {timeToVerifiedMs != null ? <Ticker value={timeToVerifiedMs / 1000} decimals={1} suffix=" s" /> : '—'}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {timeToVerifiedMs != null ? 'Measured from this run’s event timestamps. Review and restart time come on top.' : 'Start a run to measure it.'}
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
