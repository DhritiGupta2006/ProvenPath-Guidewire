'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, BarChart3, Bug, MoreHorizontal, Play, RotateCcw, Zap } from 'lucide-react';
import { HealthResponse } from '@/lib/contracts';
import { OverallStatus, StreamMode } from '@/lib/useExecutionStream';
import { Logo, Kbd } from '@/components/ui/primitives';

export const STAGES = ['Propose', 'Verify', 'Review', 'Deploy'] as const;

/** Where a run is in the four-stage story, and whether that stage is in trouble. */
export function stageOf(status: OverallStatus, hasRun: boolean): { index: number; tone: 'active' | 'fail' | 'done' } {
  switch (status) {
    case 'idle':
      return { index: -1, tone: 'active' };
    case 'starting':
      return { index: 0, tone: 'active' };
    case 'running':
      return { index: hasRun ? 1 : 0, tone: 'active' };
    case 'blocked':
      return { index: 1, tone: 'fail' };
    case 'repairing':
      return { index: 1, tone: 'active' };
    case 'passed':
    case 'review_pending':
      return { index: 2, tone: 'active' };
    case 'rejected':
      return { index: 2, tone: 'fail' };
    case 'approved':
      return { index: 3, tone: 'active' };
    case 'deploying':
      return { index: 3, tone: 'active' };
    case 'deployed':
      return { index: 3, tone: 'done' };
    case 'error':
      return { index: 1, tone: 'fail' };
  }
}

export function StageRail({ status, hasRun }: { status: OverallStatus; hasRun: boolean }) {
  const { index, tone } = stageOf(status, hasRun);
  return (
    <div className="hidden items-center gap-1 md:flex">
      {STAGES.map((s, i) => {
        const done = i < index || (i === index && tone === 'done');
        const active = i === index && tone !== 'done';
        const fail = active && tone === 'fail';
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <div className="relative h-px w-8 overflow-hidden bg-line-strong">
                <motion.div className="absolute inset-y-0 left-0 bg-pass" animate={{ width: i <= index ? '100%' : '0%' }} transition={{ duration: 0.5 }} />
              </div>
            )}
            <div
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors duration-500 ${
                fail ? 'text-fail' : active ? 'text-fg' : done ? 'text-pass' : 'text-faint'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="stage-pill"
                  className={`absolute inset-0 rounded-full border ${fail ? 'border-fail/40 bg-fail/10' : 'border-line-strong bg-surface-2'}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <span className={`relative h-1.5 w-1.5 rounded-full ${fail ? 'bg-fail' : active ? 'bg-accent' : done ? 'bg-pass' : 'bg-faint'}`}>
                {active && !fail && <span className="absolute inset-0 animate-ping rounded-full bg-accent" />}
              </span>
              <span className="relative">{s}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface TopBarProps {
  status: OverallStatus;
  hasRun: boolean;
  mode: StreamMode;
  health: HealthResponse | null;
  healthError: string | null;
  canReverify: boolean;
  onReverify: () => void;
  onTamper: () => void;
  onMetrics: () => void;
  onNewRun: (() => void) | null;
}

export function TopBar({ status, hasRun, mode, health, healthError, canReverify, onReverify, onTamper, onMetrics, onNewRun }: TopBarProps) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <Logo className="h-6 w-6 text-fg" />
          <span className="hidden sm:inline">ProvenPath</span>
        </Link>
        <span className="text-faint">/</span>
        <span className="text-sm text-muted">Mission Control</span>
        {mode === 'recorded' && hasRun && (
          <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">recorded</span>
        )}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <StageRail status={status} hasRun={hasRun} />
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className="mr-2 hidden items-center gap-2 font-mono text-[11px] text-faint lg:flex"
          title={healthError || (health ? `ruleset ${health.rulesetHash}` : '')}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${health ? 'bg-pass shadow-[0_0_8px_var(--color-pass)]' : healthError ? 'bg-fail' : 'bg-faint'}`} />
          {health ? 'gate online' : healthError ? 'gate offline' : '…'}
        </span>
        {onNewRun && (
          <button onClick={onNewRun} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> New run
          </button>
        )}
        <button onClick={onMetrics} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-fg">
          <BarChart3 className="h-3.5 w-3.5" /> Metrics
        </button>
        <div ref={ref} className="relative">
          <button aria-label="More actions" onClick={() => setMenu(v => !v)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-72 origin-top-right rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl shadow-black"
              >
                <button
                  disabled={!canReverify}
                  onClick={() => {
                    setMenu(false);
                    onReverify();
                  }}
                  className="flex w-full gap-3 rounded-lg p-2.5 text-left enabled:hover:bg-surface-3 disabled:opacity-40"
                >
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    <span className="block text-sm">Re-verify this run</span>
                    <span className="block text-xs text-muted">Run the gate again on the stored proposal and compare verdict hashes.</span>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    onTamper();
                  }}
                  className="flex w-full gap-3 rounded-lg p-2.5 text-left hover:bg-surface-3"
                >
                  <Bug className="mt-0.5 h-4 w-4 shrink-0 text-fail" />
                  <span>
                    <span className="block text-sm">Tamper test</span>
                    <span className="block text-xs text-muted">Change one word of a cited regulation and send it to the real gate.</span>
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

const SUGGESTIONS = ['Cyber insurance for Indian startups, up to ₹50L coverage', 'SME cyber cover with ransomware protection, ₹1Cr aggregate', 'Cyber policy for a D2C brand, ₹25L, with business interruption'];

interface ComposerProps {
  prompt: string;
  setPrompt: (s: string) => void;
  mode: StreamMode;
  setMode: (m: StreamMode) => void;
  onRun: () => void;
  health: HealthResponse | null;
  healthError: string | null;
  ruleCount: number;
}

/** The empty state: one question, one input. */
export function Composer({ prompt, setPrompt, mode, setMode, onRun, health, healthError, ruleCount }: ComposerProps) {
  const liveDisabled = !!healthError && !health;
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <motion.h1
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center text-4xl font-medium tracking-tight md:text-5xl"
        >
          What should we <span className="font-serif italic text-accent">insure</span> today?
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-4 text-center text-muted">
          Describe a cyber product. The planner drafts it and {ruleCount || 'the'} rules decide whether it may ship.
        </motion.p>

        <motion.div
          layoutId="composer"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 28 }}
          className="beam-border mt-10 rounded-2xl bg-surface p-2 shadow-[0_0_80px_rgb(123_121_255/0.12)]"
        >
          <textarea
            value={mode === 'recorded' ? 'Cyber insurance for Indian startups, up to ₹50L coverage' : prompt}
            disabled={mode === 'recorded'}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onRun();
              }
            }}
            rows={3}
            autoFocus
            placeholder="Describe the insurance product in plain language…"
            className="w-full resize-none bg-transparent px-4 pt-3 text-[17px] leading-relaxed outline-none placeholder:text-faint disabled:text-muted"
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs">
              {(['live', 'recorded'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={m === 'live' && liveDisabled}
                  className={`relative rounded-md px-3 py-1.5 transition-colors disabled:opacity-40 ${mode === m ? 'text-fg' : 'text-muted hover:text-fg'}`}
                >
                  {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-md bg-surface-3" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                  <span className="relative">{m === 'live' ? 'Live run' : 'Recorded run'}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] text-faint sm:flex sm:items-center sm:gap-1">
                <Kbd>Enter</Kbd> to run
              </span>
              <button
                onClick={onRun}
                disabled={mode === 'live' && (!prompt.trim() || liveDisabled)}
                aria-label="Run"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-fg text-bg transition-transform hover:scale-105 disabled:opacity-40"
              >
                {mode === 'live' ? <ArrowUp className="h-4 w-4" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-5 min-h-[60px]">
          {mode === 'live' ? (
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setPrompt(s)} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-muted">Replays fixtures/events_demo_run.jsonl, a real run recorded from the backend. Nothing is synthesized.</p>
          )}
          <p className="mt-4 text-center font-mono text-[11px] text-faint">
            {healthError && !health
              ? 'gate backend offline · start it with scripts/run-local, or watch the recorded run'
              : health?.llmMode === 'fixture'
              ? 'offline planner: every prompt produces the recorded demo proposal, the verdict is still computed live'
              : health
              ? `planner ${health.planner}`
              : ''}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
