'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, CircleDot, FileCheck2, Server, ShieldAlert, ShieldCheck, Sparkles, UserCheck, Wrench, Flag, RotateCcw } from 'lucide-react';
import { BaseEvent } from '@/lib/contracts';
import { inr, shortHash } from '@/lib/api';

type Tone = 'muted' | 'accent' | 'pass' | 'fail' | 'warn';
interface Item {
  key: number;
  ts: string;
  icon: React.ElementType;
  tone: Tone;
  title: string;
  detail?: string;
  progress?: { done: number; total: number };
}

const TONE_CLS: Record<Tone, string> = {
  muted: 'text-muted bg-surface-3',
  accent: 'text-accent bg-accent/12',
  pass: 'text-pass bg-pass/12',
  fail: 'text-fail bg-fail/12',
  warn: 'text-warn bg-warn/12',
};

const argSummary = (args: Record<string, unknown> | undefined) => {
  if (!args) return '';
  return Object.entries(args)
    .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.length} items` : `${k}: ${k.endsWith('Inr') ? inr(v as number) : String(v)}`))
    .join(' · ');
};

/** Turns the raw event stream into a readable story: one row per meaningful step. */
function toItems(events: BaseEvent[]): Item[] {
  const items: Item[] = [];
  const verifyRow: Record<string, Item> = {};
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    const base = { key: e.seq, ts: e.ts };
    switch (e.type) {
      case 'run.started':
        items.push({ ...base, icon: Flag, tone: 'muted', title: 'Run started', detail: String(p.prompt || '') });
        break;
      case 'planner.step':
        items.push({ ...base, icon: Sparkles, tone: 'accent', title: String(p.note || p.action), detail: `planner · ${p.action}` });
        break;
      case 'tool.called':
        items.push({ ...base, icon: Wrench, tone: 'muted', title: `${p.tool}()`, detail: argSummary(p.args as Record<string, unknown>) });
        break;
      case 'proposal.created':
        items.push({
          ...base,
          icon: FileCheck2,
          tone: 'accent',
          title: `Proposal ${p.proposalId} · iteration ${p.iteration}`,
          detail: `${p.clauses} clauses · aggregate ${inr(p.aggregateLimitInr as number)}`,
        });
        break;
      case 'verify.started': {
        const row: Item = {
          ...base,
          icon: CircleDot,
          tone: 'muted',
          title: `Gate checking ${p.ruleCount} rules`,
          detail: `${p.nodeCount} checks · ruleset ${shortHash(p.rulesetHash as string, 8)}`,
          progress: { done: 0, total: Number(p.nodeCount) || 0 },
        };
        verifyRow[String(p.runId)] = row;
        items.push(row);
        break;
      }
      case 'verify.node': {
        const row = verifyRow[String(p.runId)];
        if (row?.progress) row.progress = { ...row.progress, done: row.progress.done + 1 };
        break;
      }
      case 'gate.blocked':
        items.push({
          ...base,
          icon: ShieldAlert,
          tone: 'fail',
          title: `Blocked by ${(p.failedRules as string[])?.join(', ') || 'the gate'}`,
          detail: `iteration ${p.iteration} · ${p.writtenToPolicyCenter ?? 0} files written`,
        });
        break;
      case 'planner.repair':
        items.push({
          ...base,
          icon: RotateCcw,
          tone: 'warn',
          title: `Repairing ${p.failedRule}`,
          detail: `got ${inr(p.actual as string)}, allowed ${inr(p.expected as string)}`,
        });
        break;
      case 'gate.passed':
        items.push({ ...base, icon: ShieldCheck, tone: 'pass', title: `Passed on iteration ${p.iteration}`, detail: `verdict ${shortHash(p.verdictHash as string, 10)}` });
        break;
      case 'review.requested':
        items.push({ ...base, icon: UserCheck, tone: 'warn', title: 'Waiting for compliance sign-off', detail: (p.reviewers as string[])?.join(', ') });
        break;
      case 'review.decided':
        items.push({
          ...base,
          icon: UserCheck,
          tone: p.decision === 'approved' ? 'pass' : 'fail',
          title: `${p.decision === 'approved' ? 'Approved' : 'Rejected'} by ${p.reviewer}`,
          detail: p.comment ? String(p.comment) : undefined,
        });
        break;
      case 'run.completed':
        items.push({ ...base, icon: Flag, tone: p.status === 'error' ? 'fail' : 'muted', title: `Run ${p.status}`, detail: p.error ? String(p.error) : undefined });
        break;
      default:
        if (e.type.startsWith('pc.')) {
          items.push({
            ...base,
            icon: Server,
            tone: e.type === 'pc.failed' ? 'fail' : e.type === 'pc.verified' ? 'pass' : 'accent',
            title: `PolicyCenter · ${e.type.slice(3)}`,
            detail: p.detail ? String(p.detail) : undefined,
          });
        }
    }
  }
  return items;
}

export function ActivityView({ events }: { events: BaseEvent[] }) {
  const items = useMemo(() => toItems(events), [events]);
  const t0 = events[0] ? new Date(events[0].ts).getTime() : 0;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length]);

  if (!items.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />
        Waiting for the first event…
      </div>
    );

  return (
    <div className="relative space-y-1 pb-4">
      <div className="absolute bottom-4 left-[15px] top-3 w-px bg-line" />
      {items.map(it => (
        <motion.div
          key={it.key}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="relative flex gap-3 rounded-lg py-2 pr-2"
        >
          <span className={`relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full ring-4 ring-surface ${TONE_CLS[it.tone]}`}>
            <it.icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline gap-2">
              <span className={`truncate text-[13px] ${it.tone === 'fail' ? 'text-fail' : it.tone === 'pass' ? 'text-pass' : 'text-fg'}`}>{it.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">+{((new Date(it.ts).getTime() - t0) / 1000).toFixed(2)}s</span>
            </div>
            {it.detail && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{it.detail}</div>}
            {it.progress && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                <motion.div className="h-full bg-accent" animate={{ width: `${it.progress.total ? (it.progress.done / it.progress.total) * 100 : 0}%` }} />
              </div>
            )}
          </div>
        </motion.div>
      ))}
      <div ref={end} />
    </div>
  );
}

/** Every raw event exactly as the backend sent it. */
export function EventLog({ events }: { events: BaseEvent[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!events.length) return <div className="p-6 text-center text-sm text-muted">No events yet.</div>;
  return (
    <div className="space-y-px font-mono text-[11px]">
      {events.map(e => (
        <div key={e.seq}>
          <button
            onClick={() => setOpen(open === e.seq ? null : e.seq)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface-2"
          >
            <ChevronRight className={`h-3 w-3 shrink-0 text-faint transition-transform ${open === e.seq ? 'rotate-90' : ''}`} />
            <span className="w-8 shrink-0 text-faint">{e.seq}</span>
            <span
              className={
                e.type.startsWith('gate.blocked') || e.type === 'pc.failed'
                  ? 'text-fail'
                  : e.type.startsWith('gate.passed') || e.type === 'pc.verified'
                  ? 'text-pass'
                  : e.type === 'verify.node'
                  ? 'text-muted'
                  : 'text-fg'
              }
            >
              {e.type}
            </span>
            {e.type === 'verify.node' && (
              <span className="truncate text-faint">
                {(e.payload as { ruleCode?: string }).ruleCode} {(e.payload as { result?: string }).result}
              </span>
            )}
          </button>
          {open === e.seq && (
            <pre className="mx-2 mb-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-[10px] text-muted">{JSON.stringify(e.payload, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
