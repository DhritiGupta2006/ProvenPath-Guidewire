'use client';

import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, MinusCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import { GateBlockedPayload, NodeResult, NodeStatus, RuleDefinition } from '@/lib/contracts';
import { RuleNodeState } from '@/lib/useExecutionStream';
import { LAYER_LABEL } from '@/lib/rules-catalog';

const looksMoney = (s: string) => /^\d+(\.\d+)?$/.test(s) && Number(s) >= 1000;
const fmt = (s?: string) => {
  if (!s) return '—';
  if (looksMoney(s)) return '₹' + Number(s).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return s;
};

export function StatusIcon({ status, className = 'h-4 w-4' }: { status: NodeStatus; className?: string }) {
  if (status === 'PASSED') return <CheckCircle2 className={`${className} text-pass`} />;
  if (status === 'FAILED') return <XCircle className={`${className} text-fail`} />;
  if (status === 'NEEDS_REVIEW') return <AlertTriangle className={`${className} text-warn`} />;
  return <MinusCircle className={`${className} text-faint`} />;
}

function FailureCard({ f, i, onOpenProvenance }: { f: NodeResult; i: number; onOpenProvenance?: (clauseId: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + i * 0.08 }}
      className="rounded-xl border border-line bg-surface-2/70 p-4"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={f.result} />
        <span className="font-mono text-xs text-fg">{f.ruleCode}</span>
        <span className="text-xs text-faint">{LAYER_LABEL[f.layer] || f.layer}</span>
        {f.clauseId && <span className="ml-auto font-mono text-[10px] text-faint">{f.clauseId}</span>}
      </div>
      {(f.actual || f.expected) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-fail/[0.08] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-faint">Proposed</div>
            <div className="mt-0.5 break-all font-mono text-sm text-fail">{fmt(f.actual)}</div>
          </div>
          <div className="rounded-lg bg-pass/[0.07] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-faint">Allowed</div>
            <div className="mt-0.5 break-all font-mono text-sm text-pass">{fmt(f.expected)}</div>
          </div>
        </div>
      )}
      {f.reason && <p className="mt-3 text-xs leading-relaxed text-muted">{f.reason}</p>}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <BookOpen className="h-3.5 w-3.5 text-accent" /> {f.sourceCode || 'no source'}
        </span>
        {f.clauseId && onOpenProvenance && (
          <button onClick={() => onOpenProvenance(f.clauseId!)} className="flex items-center gap-1 text-accent hover:underline">
            Provenance <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function BlockedView({
  data,
  isTamper,
  repairedIteration,
  onOpenProvenance,
  onDismiss,
}: {
  data: GateBlockedPayload;
  isTamper: boolean;
  repairedIteration: number | null;
  onOpenProvenance?: (clauseId: string) => void;
  onDismiss?: () => void;
}) {
  const failures = data.failures || [];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-fail/30 bg-fail/[0.06] p-5">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fail/20 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fail">{isTamper ? 'Tamper test' : `Iteration ${data.iteration}`}</div>
            <div className="mt-1 font-serif text-4xl italic text-fail">Blocked</div>
          </div>
          {onDismiss && (
            <button aria-label="Dismiss" onClick={onDismiss} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="relative mt-4 flex items-end justify-between">
          <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
            {failures.length} blocking result{failures.length === 1 ? '' : 's'}. A blocked proposal never becomes a package.
          </p>
          <div className="text-right">
            <div className="text-3xl font-medium tabular-nums text-fg">{data.writtenToPolicyCenter ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-faint">files written</div>
          </div>
        </div>
      </div>

      {failures.map((f, i) => (
        <FailureCard key={`${f.ruleCode}-${f.clauseId}-${i}`} f={f} i={i} onOpenProvenance={isTamper ? undefined : onOpenProvenance} />
      ))}

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="px-1 text-xs leading-relaxed text-muted">
        {repairedIteration ? (
          <>
            <span className="text-warn">Repairing.</span> The planner received these named failures and re-proposed. Iteration {repairedIteration} is being
            verified now.
          </>
        ) : isTamper ? (
          'Stateless check (POST /verify): one changed word in a cited regulation is caught at the source layer. Nothing stored, nothing deployed.'
        ) : (
          'The planner receives these named failures and may re-propose.'
        )}
      </motion.p>
    </div>
  );
}

export function RuleView({
  rule,
  state,
  onBack,
  onOpenProvenance,
}: {
  rule: RuleDefinition;
  state?: RuleNodeState;
  onBack: () => void;
  onOpenProvenance: (clauseId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <div>
        <div className="flex items-center gap-2 font-mono text-xs text-accent">
          {rule.ruleCode}
          {state && <StatusIcon status={state.result} className="h-3.5 w-3.5" />}
        </div>
        <h3 className="mt-2 text-xl font-medium leading-snug">{rule.name}</h3>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{LAYER_LABEL[rule.layer] || rule.layer}</span>
          {rule.appliesTo && <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">applies to {rule.appliesTo}</span>}
          {rule.sourceCode && (
            <span className="flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-muted">
              <BookOpen className="h-3 w-3" /> {rule.sourceCode}
            </span>
          )}
        </div>
        {rule.dependsOn?.length > 0 && <p className="mt-3 text-xs text-faint">Runs after {rule.dependsOn.join(', ')}</p>}
        {rule.pcMapping && <p className="mt-1 text-xs text-faint">PolicyCenter: {rule.pcMapping}</p>}
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-faint">Results in this run</div>
        {!state && <p className="text-sm text-muted">Not evaluated yet.</p>}
        <div className="space-y-1.5">
          {state?.clauseResults.map((c, i) => (
            <button
              key={`${c.clauseId}-${i}`}
              disabled={!c.clauseId}
              onClick={() => c.clauseId && onOpenProvenance(c.clauseId)}
              className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 p-3 text-left enabled:hover:border-line-strong"
            >
              <StatusIcon status={c.result} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-fg">{c.clauseId || 'whole proposal'}</span>
                  <span className="text-faint">{c.result}</span>
                </div>
                {(c.expected || c.actual) && (
                  <div className="mt-1 text-muted">
                    got <span className="text-fg">{fmt(c.actual)}</span> · rule <span className="text-fg">{fmt(c.expected)}</span>
                  </div>
                )}
                {c.reason && <div className="mt-1 text-faint">{c.reason}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
