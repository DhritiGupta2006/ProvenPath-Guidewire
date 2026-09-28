'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Clause, ReviewDecidedPayload, ReviewRequestedPayload, UserRow } from '@/lib/contracts';
import { api, ApiError, inr, shortHash } from '@/lib/api';
import { StreamMode } from '@/lib/useExecutionStream';

interface ReviewViewProps {
  executionId: string | null;
  mode: StreamMode;
  reviewData: ReviewRequestedPayload;
  /** review.decided from the stream, if the decision already happened */
  decided: ReviewDecidedPayload | null;
  onDeploy: () => void;
  onOpenProvenance: (clauseId: string) => void;
}

function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="absolute h-20 w-20 rounded-full border border-pass"
          initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.3, delay: i * 0.18, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/**
 * The named Compliance Reviewer checkpoint. Reviewers come from GET /users, the clauses from the verified
 * proposal (GET /executions/{id}) and the decision goes to POST /reviews, which only accepts the latest
 * PASSED run and refuses a rejection without a reason.
 */
export function ReviewView({ executionId, mode, reviewData, decided, onDeploy, onOpenProvenance }: ReviewViewProps) {
  const [reviewers, setReviewers] = useState<UserRow[]>([]);
  const [reviewerId, setReviewerId] = useState('');
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [local, setLocal] = useState<'approved' | 'rejected' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRecorded = mode === 'recorded' || !executionId;

  useEffect(() => {
    if (isRecorded) return;
    let cancelled = false;
    Promise.all([api.users(), api.execution(executionId!)])
      .then(([users, exec]) => {
        if (cancelled) return;
        const r = users.filter(u => u.role === 'reviewer');
        setReviewers(r);
        setReviewerId(prev => prev || r[0]?.id || '');
        setClauses(exec.latestProposal?.clauses || []);
      })
      .catch(e => !cancelled && setLoadError(e instanceof ApiError ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [executionId, isRecorded]);

  const submit = async (d: 'approve' | 'reject') => {
    if (!executionId || !reviewerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.review({ executionId, runId: reviewData.runId, reviewerId, decision: d, comment: d === 'reject' ? comment : undefined });
      setLocal(d === 'approve' ? 'approved' : 'rejected');
      setRejecting(false);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const decision = local || decided?.decision || null;
  const reviewerName = decided?.reviewer || reviewers.find(r => r.id === reviewerId)?.full_name || reviewData.reviewers[0] || '';

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-warn">Sign-off required</div>
        <h3 className="mt-1 font-serif text-4xl italic">Compliance review</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Iteration {reviewData.iteration} passed every rule. Nothing can be packaged for PolicyCenter until a named reviewer approves it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-line bg-surface-2/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Verdict hash</div>
          <div className="mt-1 truncate font-mono text-fg" title={reviewData.verdictHash}>
            {shortHash(reviewData.verdictHash, 14)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Reviewer</div>
          {isRecorded ? (
            <div className="mt-1 truncate text-fg">{reviewerName}</div>
          ) : (
            <select
              value={reviewerId}
              disabled={!!decision}
              onChange={e => setReviewerId(e.target.value)}
              className="mt-0.5 w-full truncate bg-transparent text-fg outline-none"
            >
              {reviewers.map(r => (
                <option key={r.id} value={r.id} className="bg-surface">
                  {r.full_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isRecorded && (
        <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-xs text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Recorded run: the decision below is the one recorded. Start a live run to sign for real.
        </div>
      )}

      {!isRecorded && (
        <div>
          <div className="mb-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-faint">
            <span>Verified clauses</span>
            <span>{clauses.length}</span>
          </div>
          {loadError && <p className="text-xs text-fail">Could not load the proposal: {loadError}</p>}
          <div className="space-y-1">
            {clauses.map((c, i) => (
              <motion.button
                key={c.clauseId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onOpenProvenance(c.clauseId)}
                className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-surface-2"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-pass" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{c.name || c.patternCode}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {c.kind.toLowerCase()} · {c.existence}
                    {c.limitMaxInr != null && ` · ${inr(c.limitMaxInr)}`}
                    {c.waitingHours != null && ` · ${c.waitingHours}h wait`}
                  </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.button>
            ))}
            {!loadError && clauses.length === 0 && <p className="text-xs text-muted">Loading the verified proposal…</p>}
          </div>
        </div>
      )}

      {submitError && <p className="rounded-lg border border-fail/30 bg-fail/[0.07] p-3 font-mono text-xs text-fail">{submitError}</p>}

      <div className="sticky -bottom-5 -mx-5 -mb-5 border-t border-line bg-surface/95 p-5 backdrop-blur">
      <AnimatePresence mode="wait">
        {!decision ? (
          <motion.div key="actions" exit={{ opacity: 0, y: -6 }} className="space-y-2">
            <AnimatePresence>
              {rejecting && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <textarea
                    autoFocus
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    placeholder="The compliance reason (required)"
                    className="w-full rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none placeholder:text-faint focus:border-fail/50"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex gap-2">
              <button
                onClick={() => (rejecting ? void submit('reject') : setRejecting(true))}
                disabled={submitting || isRecorded || !reviewerId || (rejecting && !comment.trim())}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-3 text-sm text-muted transition-colors hover:border-fail/40 hover:text-fail disabled:opacity-40"
              >
                <XCircle className="h-4 w-4" /> {rejecting ? 'Confirm rejection' : 'Reject'}
              </button>
              {rejecting ? (
                <button onClick={() => setRejecting(false)} className="flex-1 rounded-xl px-4 py-3 text-sm text-muted hover:text-fg">
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => void submit('approve')}
                  disabled={submitting || isRecorded || !reviewerId}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-medium text-bg transition-colors hover:bg-white disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" /> {submitting ? 'Signing…' : 'Approve for PolicyCenter'}
                </button>
              )}
            </div>
          </motion.div>
        ) : decision === 'approved' ? (
          <motion.div
            key="approved"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-2xl border border-pass/30 bg-pass/[0.06] p-5 text-center"
          >
            <Burst />
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}>
              <CheckCircle2 className="mx-auto h-9 w-9 text-pass" />
            </motion.div>
            <div className="mt-3 text-sm text-fg">Approved by {reviewerName}</div>
            <p className="mt-1 text-xs text-muted">The gate token and this approval are now both required to build the package.</p>
            {!isRecorded && (
              <button
                onClick={onDeploy}
                className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg hover:bg-white"
              >
                Continue to deployment <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="rejected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-fail/30 bg-fail/[0.06] p-5 text-center text-sm">
            <XCircle className="mx-auto h-8 w-8 text-fail" />
            <div className="mt-2 text-fg">Rejected by {reviewerName}</div>
            <p className="mt-1 text-xs text-muted">The run ends here. Nothing can be deployed.</p>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
