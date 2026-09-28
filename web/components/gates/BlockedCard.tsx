'use client';

import React, { useState, useRef } from 'react';
import { GateBlockedPayload } from '@/lib/contracts';
import { ShieldAlert, BookOpen, AlertOctagon, X, Move } from 'lucide-react';

interface BlockedCardProps {
  blockedData: GateBlockedPayload | null;
  /** true when the verdict comes from the stateless tamper test (POST /verify), not from the running execution */
  isTamper?: boolean;
  /** set when the planner has already repaired this blocked run: the card stays, labelled */
  repairedIteration?: number | null;
  onDismiss?: () => void;
  onOpenProvenance?: (clauseId: string) => void;
}

export function BlockedCard({
  blockedData,
  isTamper = false,
  repairedIteration = null,
  onDismiss,
  onOpenProvenance,
}: BlockedCardProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  if (!blockedData) return null;

  const failures = blockedData.failures || [];
  const shown = failures.slice(0, 3);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Determine initial box coordinates
    const card = e.currentTarget.parentElement;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pos ? pos.x : rect.left,
      initY: pos ? pos.y : rect.top,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, dragRef.current.initX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, dragRef.current.initY + dy));
      setPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, bottom: 'auto', right: 'auto' } : undefined}
      className="fixed bottom-6 right-6 max-w-xl w-full bg-neutral-950 border-2 border-neutral-700 text-white rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.9)] p-5 z-50 animate-in fade-in duration-200"
    >
      {/* Top Draggable Banner */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between bg-neutral-900 border border-neutral-700 px-3.5 py-2 rounded-lg mb-3 cursor-grab active:cursor-grabbing select-none"
        title="Click and drag to move this card"
      >
        <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-xs uppercase tracking-wider">
          <AlertOctagon className="w-4 h-4 text-rose-500 animate-pulse" />
          <span>BLOCKED — ZERO FILES WRITTEN TO POLICYCENTER</span>
        </div>
        <div className="flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-neutral-500" />
          {onDismiss && (
            <button
              aria-label="Dismiss blocked card"
              onClick={e => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-neutral-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>
            {isTamper ? 'Tamper test' : `Run ${blockedData.runId?.slice(0, 8)}… iteration ${blockedData.iteration}`} ·{' '}
            {failures.length} blocking result{failures.length === 1 ? '' : 's'}
          </span>
          <span>
            Written to PolicyCenter: <strong className="text-emerald-400">{blockedData.writtenToPolicyCenter ?? 0}</strong>
          </span>
        </div>

        {shown.map((failure, i) => (
          <div key={`${failure.ruleCode}-${failure.clauseId}-${i}`} className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-neutral-950 text-sky-400 border border-neutral-700 font-bold">{failure.ruleCode}</span>
              <span className="px-2 py-0.5 rounded bg-neutral-950 text-sky-400 border border-neutral-700">{failure.layer}</span>
              <span className="text-neutral-400">{failure.result}</span>
              {failure.clauseId && <span className="text-neutral-500">clause {failure.clauseId}</span>}
            </div>
            {failure.actual && (
              <div className="flex justify-between gap-3">
                <span className="text-sky-400">Actual</span>
                <span className="text-rose-400 font-bold text-right break-all">{failure.actual}</span>
              </div>
            )}
            {failure.expected && (
              <div className="flex justify-between gap-3">
                <span className="text-sky-400">Expected</span>
                <span className="text-emerald-400 font-bold text-right break-all">{failure.expected}</span>
              </div>
            )}
            {failure.reason && <div className="pt-1 text-neutral-300 border-t border-neutral-800 font-sans">{failure.reason}</div>}
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1 text-neutral-400">
                <BookOpen className="w-3.5 h-3.5 text-sky-400" /> {failure.sourceCode || 'no source'}
              </span>
              {failure.clauseId && onOpenProvenance && !isTamper && (
                <button onClick={() => onOpenProvenance(failure.clauseId!)} className="text-sky-400 hover:text-sky-300 underline cursor-pointer">
                  Provenance →
                </button>
              )}
            </div>
          </div>
        ))}
        {failures.length > shown.length && (
          <div className="text-[11px] font-mono text-neutral-500">+{failures.length - shown.length} more (see the rule graph)</div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-mono">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          {repairedIteration
            ? `The planner received these named failures and re-proposed: iteration ${repairedIteration} is being verified (see the graph). This blocked iteration produced no package.`
            : isTamper
            ? 'Stateless check (POST /verify): a changed regulatory citation is caught at the SOURCE layer. Nothing stored, nothing deployed.'
            : 'The planner receives these named failures and may re-propose. No package exists for a BLOCKED run.'}
        </div>
      </div>
    </div>
  );
}
