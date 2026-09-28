'use client';

import React, { useEffect, useState } from 'react';
import { Clause, ReviewRequestedPayload, UserRow } from '@/lib/contracts';
import { api, ApiError, inr, shortHash } from '@/lib/api';
import { StreamMode } from '@/lib/useExecutionStream';
import { UserCheck, ShieldCheck, CheckCircle2, XCircle, ChevronRight, X, AlertTriangle } from 'lucide-react';

interface ReviewerPanelProps {
  executionId: string | null;
  mode: StreamMode;
  reviewData: ReviewRequestedPayload | null;
  onDeployTrigger?: () => void;
  onDismiss?: () => void;
  onOpenProvenance?: (clauseId: string) => void;
  isDark?: boolean;
}

/**
 * The named Compliance Reviewer checkpoint. Everything shown comes from the backend: the reviewers
 * (GET /users), the verified proposal (GET /executions/{id}) and the decision (POST /reviews). The
 * backend enforces that only the latest PASSED run can be approved and that a rejection has a reason.
 */
export function ReviewerPanel({
  executionId,
  mode,
  reviewData,
  onDeployTrigger,
  onDismiss,
  onOpenProvenance,
  isDark = true,
}: ReviewerPanelProps) {
  const [reviewers, setReviewers] = useState<UserRow[]>([]);
  const [reviewerId, setReviewerId] = useState<string>('');
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [decision, setDecision] = useState<'idle' | 'approved' | 'rejected'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = React.useRef({ startX: 0, startY: 0, initX: 0, initY: 0 });

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

  const submit = async (d: 'approve' | 'reject') => {
    if (!executionId || !reviewData?.runId || !reviewerId) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await api.review({ executionId, runId: reviewData.runId, reviewerId, decision: d, comment: d === 'reject' ? rejectComment : undefined });
      setDecision(d === 'approve' ? 'approved' : 'rejected');
      setRejectModalOpen(false);
    } catch (e) {
      // Show the backend's reason verbatim (stale_run, comment_required, not_reviewable, ...). Never pretend success.
      setSubmitError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!reviewData) return null;
  const reviewerName = reviewers.find(r => r.id === reviewerId)?.full_name || '';
  const muted = isDark ? 'text-neutral-400' : 'text-neutral-500';
  const box = isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200';

  return (
    <div onClick={onDismiss} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div
        data-modal-card="true"
        onClick={e => e.stopPropagation()}
        style={pos ? { position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`, margin: 0 } : undefined}
        className={`border rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative ${
          isDark ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
        }`}
      >
        <div
          onMouseDown={handleMouseDown}
          className={`flex items-center justify-between border-b pb-4 mb-4 cursor-grab active:cursor-grabbing select-none ${
            isDark ? 'border-neutral-800' : 'border-neutral-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/10 border-white/20' : 'bg-neutral-100 border-neutral-300'}`}>
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">COMPLIANCE REVIEWER SIGN-OFF</h2>
              <p className={`text-xs font-mono ${muted}`}>Required before anything can be packaged for PolicyCenter</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5 font-bold ${isDark ? 'bg-white/10 border-white/20' : 'bg-neutral-100 border-neutral-300'}`}>
              <ShieldCheck className="w-3.5 h-3.5" /> Gate: PASSED (iteration {reviewData.iteration})
            </span>
            <button aria-label="Close reviewer panel" onClick={onDismiss} className={`p-1.5 rounded-lg border cursor-pointer ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-neutral-200 hover:bg-neutral-100'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isRecorded && (
          <div className="mb-4 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-500 text-xs font-mono flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Recorded demo: this is a replay, so there is no live execution to sign. Start a live run to review for real.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4 text-[11px] font-mono">
          <div className={`p-2.5 rounded-lg border ${box}`}>
            <div className={`${muted} mb-0.5`}>VERDICT HASH (run {shortHash(reviewData.runId, 8)})</div>
            <div className="font-bold truncate" title={reviewData.verdictHash}>{reviewData.verdictHash}</div>
          </div>
          <div className={`p-2.5 rounded-lg border ${box}`}>
            <div className={`${muted} mb-0.5`}>NAMED REVIEWER</div>
            <select
              value={reviewerId}
              disabled={isRecorded || decision !== 'idle'}
              onChange={e => setReviewerId(e.target.value)}
              className={`w-full font-medium rounded border p-1 text-xs outline-none ${isDark ? 'bg-neutral-950 border-neutral-700' : 'bg-white border-neutral-300'}`}
            >
              {isRecorded && reviewData.reviewers.map(n => <option key={n}>{n}</option>)}
              {reviewers.map(r => (
                <option key={r.id} value={r.id}>{r.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-5">
          <div className={`flex items-center justify-between text-xs font-mono mb-2 ${muted}`}>
            <span>VERIFIED CLAUSES (click for provenance)</span>
            <span>{clauses.length} clauses</span>
          </div>
          {loadError && <div className="text-xs text-rose-500 font-mono mb-2">Could not load the proposal: {loadError}</div>}
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {clauses.map(c => (
              <button
                key={c.clauseId}
                onClick={() => onOpenProvenance?.(c.clauseId)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-mono text-left cursor-pointer ${
                  isDark ? 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]' : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name || c.patternCode}</div>
                    <div className={`text-[10px] ${muted}`}>
                      {c.kind} · {c.existence}
                      {c.limitMaxInr != null && ` · Limit ${inr(c.limitMaxInr)}`}
                      {c.deductibleInr != null && ` · Deductible ${inr(c.deductibleInr)}`}
                      {c.waitingHours != null && ` · Wait ${c.waitingHours}h`}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[10px] font-bold shrink-0 pl-2">{c.citations?.[0]?.sourceCode || 'no citation'}</div>
              </button>
            ))}
            {!isRecorded && !loadError && clauses.length === 0 && <div className={`text-xs font-mono ${muted}`}>Loading the verified proposal…</div>}
          </div>
        </div>

        {submitError && <div className="mb-3 p-2.5 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-500 text-xs font-mono">{submitError}</div>}

        {decision === 'idle' ? (
          <div className={`flex items-center justify-between pt-3 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
            <button
              onClick={() => setRejectModalOpen(true)}
              disabled={isSubmitting || isRecorded || !reviewerId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/30 text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" /> Reject (reason required)
            </button>
            <button
              onClick={() => submit('approve')}
              disabled={isSubmitting || isRecorded || !reviewerId}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark ? 'bg-white hover:bg-neutral-200 text-black' : 'bg-black hover:bg-neutral-800 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Submitting…' : 'Approve for PolicyCenter'}
            </button>
          </div>
        ) : decision === 'approved' ? (
          <div className={`p-4 rounded-xl border text-center space-y-2 ${isDark ? 'bg-neutral-900 border-white/20' : 'bg-neutral-100 border-neutral-300'}`}>
            <div className="flex items-center justify-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" /> Approved by {reviewerName} (logged against {shortHash(executionId, 13)})
            </div>
            <p className={`text-xs ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
              The run&apos;s gate token and this approval are now both required to build the PolicyCenter package.
            </p>
            {onDeployTrigger && (
              <button
                onClick={onDeployTrigger}
                className={`mt-2 inline-flex items-center gap-1.5 px-5 py-2 rounded-lg font-semibold text-xs cursor-pointer ${
                  isDark ? 'bg-white hover:bg-neutral-200 text-black' : 'bg-black hover:bg-neutral-800 text-white'
                }`}
              >
                Continue to deployment <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500 text-center text-xs text-rose-500">
            Rejected by {reviewerName}. The run ends here and nothing can be deployed.
          </div>
        )}

        {rejectModalOpen && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md rounded-2xl flex items-center justify-center p-6 z-50">
            <div className={`border rounded-xl p-5 max-w-md w-full text-xs space-y-3 ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300'}`}>
              <div className="font-bold flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" /> Reject compliance sign-off
              </div>
              <p className={muted}>A rejection must state the compliance reason (the backend refuses an empty one):</p>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                rows={3}
                className={`w-full border rounded-lg p-2.5 outline-none font-sans ${isDark ? 'bg-neutral-950 border-neutral-700' : 'bg-neutral-50 border-neutral-300'}`}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setRejectModalOpen(false)} className={`px-3 py-1.5 rounded border ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-neutral-100 border-neutral-300'}`}>
                  Cancel
                </button>
                <button
                  onClick={() => submit('reject')}
                  disabled={!rejectComment.trim() || isSubmitting}
                  className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  Confirm rejection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
