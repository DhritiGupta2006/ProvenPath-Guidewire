'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NodeStatus, RuleDefinition } from '@/lib/contracts';
import { RULE_LAYERS } from '@/lib/rules-catalog';
import { RuleNodeState } from '@/lib/useExecutionStream';

interface GateGraphProps {
  rules: RuleDefinition[];
  nodesMap: Record<string, RuleNodeState>;
  /** changes on every verify.started: replays the scan sweep */
  runKey: string | null;
  selected: string | null;
  onSelect: (ruleCode: string) => void;
  /** last gate verdict event, used for the stamp */
  stamp: { seq: number; kind: 'blocked' | 'passed' } | null;
}

const TONE: Record<NodeStatus, { box: string; dot: string; edge: string }> = {
  PENDING: { box: 'border-line bg-surface/80 text-muted', dot: 'bg-faint', edge: 'rgba(255,255,255,0.07)' },
  PASSED: { box: 'border-pass/35 bg-pass/[0.08] text-fg', dot: 'bg-pass shadow-[0_0_10px_var(--color-pass)]', edge: 'rgba(63,220,151,0.45)' },
  FAILED: { box: 'border-fail/60 bg-fail/[0.12] text-fg animate-pulse-ring', dot: 'bg-fail shadow-[0_0_10px_var(--color-fail)]', edge: 'rgba(255,95,95,0.75)' },
  SKIPPED: { box: 'border-dashed border-line-strong bg-transparent text-faint', dot: 'bg-faint', edge: 'rgba(255,255,255,0.1)' },
  NEEDS_REVIEW: { box: 'border-warn/50 bg-warn/[0.1] text-fg', dot: 'bg-warn shadow-[0_0_10px_var(--color-warn)]', edge: 'rgba(255,181,71,0.6)' },
};

const VARIANTS = {
  PENDING: { scale: 1, x: 0 },
  PASSED: { scale: [1, 1.07, 1], x: 0, transition: { duration: 0.35 } },
  FAILED: { scale: 1, x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.5 } },
  SKIPPED: { scale: 1, x: 0 },
  NEEDS_REVIEW: { scale: [1, 1.05, 1], x: 0 },
};

const COLS = RULE_LAYERS.length;
const HALF_W = (100 / COLS) * 0.41;

/**
 * The rule graph, laid out as six layer columns. Nodes light up as verify.node events stream in; edges
 * carry the result of the rule they lead into. Everything comes from GET /rules and the event stream.
 */
export function GateGraph({ rules, nodesMap, runKey, selected, onSelect, stamp }: GateGraphProps) {
  const { pos, maxRows, columns } = useMemo(() => {
    const columns = RULE_LAYERS.map(l => rules.filter(r => r.layer === l.layer).sort((a, b) => a.ruleCode.localeCompare(b.ruleCode)));
    const maxRows = Math.max(1, ...columns.map(c => c.length));
    const pos: Record<string, { x: number; y: number; col: number }> = {};
    columns.forEach((col, ci) =>
      col.forEach((r, ri) => {
        pos[r.ruleCode] = { x: ((ci + 0.5) / COLS) * 100, y: ((ri + 0.5 + (maxRows - col.length) / 2) / maxRows) * 100, col: ci };
      })
    );
    return { pos, maxRows, columns };
  }, [rules]);

  const edges = useMemo(() => {
    const out: { id: string; d: string; target: string }[] = [];
    for (const r of rules) {
      for (const dep of r.dependsOn || []) {
        const s = pos[dep];
        const t = pos[r.ruleCode];
        if (!s || !t) continue;
        let d: string;
        if (s.col === t.col) {
          const x = s.x - HALF_W;
          d = `M ${x} ${s.y} C ${x - 2.6} ${s.y}, ${x - 2.6} ${t.y}, ${x} ${t.y}`;
        } else {
          const sx = s.x + HALF_W;
          const tx = t.x - HALF_W;
          const mx = (sx + tx) / 2;
          d = `M ${sx} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${tx} ${t.y}`;
        }
        out.push({ id: `${dep}->${r.ruleCode}`, d, target: r.ruleCode });
      }
    }
    return out;
  }, [rules, pos]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* layer headers */}
      <div className="grid shrink-0 pb-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {RULE_LAYERS.map((l, i) => {
          const col = columns[i] || [];
          const done = col.filter(r => nodesMap[r.ruleCode]).length;
          const failed = col.some(r => nodesMap[r.ruleCode]?.result === 'FAILED');
          return (
            <div key={l.layer} className="px-2 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">0{i + 1}</div>
              <div className={`mt-0.5 truncate text-xs ${failed ? 'text-fail' : done && done === col.length ? 'text-fg' : 'text-muted'}`}>{l.short}</div>
              <div className="mx-auto mt-2 h-0.5 w-10 overflow-hidden rounded-full bg-line">
                <motion.div
                  className={`h-full ${failed ? 'bg-fail' : 'bg-pass'}`}
                  animate={{ width: col.length ? `${(done / col.length) * 100}%` : 0 }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1" style={{ minHeight: maxRows * 52 }}>
        {/* column guides */}
        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {RULE_LAYERS.map(l => (
            <div key={l.layer} className="border-l border-line/60 first:border-l-0" />
          ))}
        </div>

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {edges.map(e => {
            const st = nodesMap[e.target]?.result || 'PENDING';
            return (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={TONE[st].edge}
                strokeWidth={st === 'FAILED' ? 1.6 : 1.1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={st === 'SKIPPED' ? '3 4' : undefined}
                className={st === 'PASSED' || st === 'FAILED' ? 'edge-flow' : undefined}
                style={{ transition: 'stroke 0.4s ease' }}
              />
            );
          })}
        </svg>

        {/* scan sweep on each verification run */}
        <AnimatePresence>
          {runKey && (
            <motion.div
              key={runKey}
              className="pointer-events-none absolute inset-y-0 z-10 w-24"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(157 156 255 / 0.22), transparent)' }}
              initial={{ left: '-8%', opacity: 1 }}
              animate={{ left: '104%', opacity: [1, 1, 0] }}
              transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
            />
          )}
        </AnimatePresence>

        {rules.map(r => {
          const p = pos[r.ruleCode];
          if (!p) return null;
          const n = nodesMap[r.ruleCode];
          const st: NodeStatus = n?.result || 'PENDING';
          const tone = TONE[st];
          const multi = n && n.clauseResults.length > 1;
          return (
            <div key={r.ruleCode} className="absolute z-20" style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${HALF_W * 2}%`, transform: 'translate(-50%, -50%)' }}>
              <motion.button
                variants={VARIANTS}
                animate={st}
                onClick={() => onSelect(r.ruleCode)}
                title={`${r.ruleCode} · ${r.name}`}
                className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-300 hover:border-line-strong hover:bg-surface-2 ${tone.box} ${
                  selected === r.ruleCode ? 'ring-1 ring-accent ring-offset-2 ring-offset-bg' : ''
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300 ${tone.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px] leading-tight text-muted">
                    {r.ruleCode.replace('CYB-', '')}
                    {multi && <span className="text-faint"> ×{n.clauseResults.length}</span>}
                  </span>
                  <span className="block truncate text-[11px] leading-snug">{r.name}</span>
                </span>
              </motion.button>
            </div>
          );
        })}

        {/* verdict stamp */}
        <AnimatePresence>
          {stamp && (
            <motion.div
              key={stamp.seq}
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4, times: [0, 0.12, 0.75, 1] }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    stamp.kind === 'blocked'
                      ? 'radial-gradient(ellipse at center, rgb(255 95 95 / 0.16), transparent 70%)'
                      : 'radial-gradient(ellipse at center, rgb(63 220 151 / 0.14), transparent 70%)',
                }}
              />
              <motion.div
                initial={{ scale: 1.6, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: -4, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className={`relative rounded-2xl border-2 bg-bg/80 px-10 py-5 text-center backdrop-blur ${
                  stamp.kind === 'blocked' ? 'border-fail text-fail' : 'border-pass text-pass'
                }`}
              >
                <div className="font-serif text-6xl italic leading-none">{stamp.kind === 'blocked' ? 'Blocked' : 'Passed'}</div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                  {stamp.kind === 'blocked' ? 'zero files written to PolicyCenter' : 'every rule passed · sent for sign-off'}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
