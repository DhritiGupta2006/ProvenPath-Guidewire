'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, X, FileText, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { ProvenanceResponse } from '@/lib/contracts';
import { api, ApiError, inr } from '@/lib/api';

interface ProvenanceDrawerProps {
  clauseId: string | null;
  executionId: string | null;
  onClose: () => void;
}

/** Clause → the rules that checked it → the regulatory text it cites, straight from GET /provenance. */
export function ProvenanceDrawer({ clauseId, executionId, onClose }: ProvenanceDrawerProps) {
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

  if (!clauseId) return null;
  const loading = loadedFor !== clauseId;
  const c = data?.clause;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-950/95 border-l border-slate-800 backdrop-blur-xl p-6 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h3 className="font-mono text-sm font-bold text-slate-100">PROVENANCE: {clauseId}</h3>
        </div>
        <button aria-label="Close provenance" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-900">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
        {loading && <div className="p-8 text-center text-slate-500 font-mono">Loading provenance from the backend…</div>}
        {!loading && error && <div className="p-3 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-400 font-mono">{error}</div>}

        {!loading && data && c && (
          <>
            <div>
              <div className="text-sm font-semibold text-slate-100">{c.name || c.patternCode}</div>
              <div className="text-[11px] font-mono text-cyan-300">
                {c.patternCode} · {c.kind} · {c.existence} · {c.owningEntityType}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                {c.limitMaxInr != null && <>Limit {inr(c.limitMaxInr)} · </>}
                {c.deductibleInr != null && <>Deductible {inr(c.deductibleInr)} · </>}
                {c.waitingHours != null && <>Waiting {c.waitingHours}h · </>}
                proposal {data.proposalId} iteration {data.iteration}
              </div>
              {!executionId && (
                <div className="text-[10px] font-mono text-amber-400 mt-1">Showing the latest stored proposal containing this clause.</div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Rule checks on this clause (run {data.runId?.slice(0, 8)}… {data.runStatus})
              </div>
              {data.checks.length === 0 && <div className="text-slate-500 font-mono">No clause-level checks recorded.</div>}
              {data.checks.map(ch => (
                <div key={`${ch.rule_code}-${ch.position}`} className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-200">
                      {ch.result === 'PASSED' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : ch.result === 'FAILED' ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      {ch.rule_code}
                    </span>
                    <span className="text-slate-500">{ch.layer}</span>
                  </div>
                  {ch.ruleName && <div className="text-slate-400 mt-0.5">{ch.ruleName}</div>}
                  {(ch.expected || ch.actual) && (
                    <div className="text-slate-500 mt-0.5">
                      expected {ch.expected || '—'} · actual {ch.actual || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Citations ({data.cited ? 'every snippet matches the stored source text' : 'NOT all snippets match the stored source text'})
              </div>
              {data.citations.map((ci, i) => (
                <div key={`${ci.sourceCode}-${i}`} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-slate-200 font-semibold">{ci.sourceCode}</span>
                    <span className={ci.snippetMatchesSource ? 'text-emerald-400' : 'text-rose-400'}>
                      {!ci.found ? 'source not found' : ci.snippetMatchesSource ? 'snippet matches' : 'snippet does NOT match'}
                    </span>
                  </div>
                  {ci.title && <div className="text-slate-300">{ci.title}</div>}
                  <div className="text-[10px] font-mono text-slate-500">
                    §{ci.section} · {ci.jurisdiction || '—'} · effective {ci.effectiveDate || '—'}
                  </div>
                  <div className="flex gap-1.5 items-start">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="font-serif italic text-slate-300 leading-relaxed">&quot;{ci.textSnippet}&quot;</div>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-500">
                Curated, illustrative IRDAI-style source set for this demo. This is a rule-graph check, not a legal opinion.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800">
        <button onClick={onClose} className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs">
          Close
        </button>
      </div>
    </div>
  );
}
