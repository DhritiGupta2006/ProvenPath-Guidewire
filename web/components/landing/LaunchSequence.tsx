'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { api, ApiError, shortHash } from '@/lib/api';
import { Logo } from '@/components/ui/primitives';

type Origin = { x: number; y: number };
type Launch = (origin: Origin, target?: 'live' | 'recorded') => void;

const LaunchCtx = createContext<Launch>(() => {});
export const useLaunch = () => useContext(LaunchCtx);

interface Step {
  label: string;
  state: 'wait' | 'run' | 'ok' | 'fail';
  detail?: string;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The "launch" moment: the screen is swallowed by a circle growing out of the button that was clicked,
 * then Mission Control boots by actually calling the backend (health, rule graph, reviewers). If the backend
 * is down it says so and offers the recorded run instead of pretending.
 */
export function LaunchProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [target, setTarget] = useState<'live' | 'recorded'>('live');
  const [steps, setSteps] = useState<Step[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    router.prefetch('/control');
  }, [router]);

  const set = (i: number, patch: Partial<Step>) => setSteps(s => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  const boot = useCallback(
    async (mode: 'live' | 'recorded') => {
      const go = () => router.push(mode === 'recorded' ? '/control?mode=recorded' : '/control');
      if (mode === 'recorded') {
        setSteps([{ label: 'Loading the recorded run', state: 'run' }]);
        await wait(700);
        setSteps([{ label: 'Loading the recorded run', state: 'ok', detail: 'fixtures/events_demo_run.jsonl' }]);
        await wait(350);
        go();
        return;
      }
      setSteps([
        { label: 'Reaching the gate backend', state: 'run' },
        { label: 'Loading the rule graph', state: 'wait' },
        { label: 'Finding compliance reviewers', state: 'wait' },
      ]);
      try {
        const [h] = await Promise.all([api.health(), wait(550)]);
        set(0, { state: 'ok', detail: `planner ${h.llmMode === 'fixture' ? 'fixture (offline)' : h.planner}` });
        set(1, { state: 'run' });
        const [r] = await Promise.all([api.rules(), wait(500)]);
        const layers = new Set(r.rules.map(x => x.layer)).size;
        set(1, { state: 'ok', detail: `${r.count} rules · ${layers} layers · ${shortHash(r.rulesetHash, 8)}` });
        set(2, { state: 'run' });
        const [u] = await Promise.all([api.users(), wait(450)]);
        const n = u.filter(x => x.role === 'reviewer').length;
        set(2, { state: 'ok', detail: `${n} named reviewer${n === 1 ? '' : 's'}` });
        await wait(450);
        go();
      } catch (e) {
        setSteps(s => {
          const i = s.findIndex(x => x.state === 'run');
          return s.map((st, j) => (j === i ? { ...st, state: 'fail', detail: e instanceof ApiError ? e.message : String(e) } : st));
        });
        setFailed(true);
      }
    },
    [router]
  );

  const launch: Launch = useCallback(
    (o, t = 'live') => {
      setOrigin(o);
      setTarget(t);
      setFailed(false);
      setSteps([]);
      setTimeout(() => void boot(t), 650);
    },
    [boot]
  );

  const close = () => {
    setOrigin(null);
    setSteps([]);
    setFailed(false);
  };

  return (
    <LaunchCtx.Provider value={launch}>
      {children}
      <AnimatePresence>
        {origin && (
          <motion.div
            key="launch"
            className="fixed inset-0 z-[100] bg-bg"
            initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }}
            animate={{ clipPath: `circle(150% at ${origin.x}px ${origin.y}px)` }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.7, 0, 0.2, 1] }}
          >
            <div className="absolute inset-0 bg-grid mask-radial opacity-60" />
            <motion.div
              className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: 'radial-gradient(circle, rgb(123 121 255 / 0.18), transparent 65%)' }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, duration: 1.2 }}
            />
            <div className="relative flex h-full flex-col items-center justify-center px-6">
              <motion.div
                initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ delay: 0.45, type: 'spring', stiffness: 180, damping: 16 }}
              >
                <Logo className="h-14 w-14 text-fg" />
              </motion.div>
              <motion.p
                className="mt-6 font-serif text-3xl italic text-fg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                {target === 'recorded' ? 'Replaying a real run' : 'Starting Mission Control'}
              </motion.p>

              <div className="mt-10 w-full max-w-md space-y-2.5">
                <AnimatePresence>
                  {steps.map(s => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: s.state === 'wait' ? 0.35 : 1, x: 0 }}
                      className="flex items-center gap-3 font-mono text-[12px]"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {s.state === 'run' && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />}
                        {s.state === 'ok' && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full bg-pass/15 p-0.5 text-pass">
                            <Check className="h-3.5 w-3.5" />
                          </motion.span>
                        )}
                        {s.state === 'fail' && (
                          <span className="rounded-full bg-fail/15 p-0.5 text-fail">
                            <X className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {s.state === 'wait' && <span className="h-1.5 w-1.5 rounded-full bg-faint" />}
                      </span>
                      <span className="text-fg">{s.label}</span>
                      <span className={`ml-auto truncate text-right ${s.state === 'fail' ? 'text-fail' : 'text-muted'}`}>{s.detail}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {failed && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 flex flex-col items-center gap-4 text-center">
                  <p className="max-w-md text-sm text-muted">
                    The gate backend is not running, so a live run is not possible. Start it with <span className="font-mono text-fg">scripts/run-local</span>, or
                    watch a recorded real run.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={close} className="rounded-full border border-line-strong px-5 py-2 text-sm text-muted hover:text-fg">
                      Back
                    </button>
                    <button onClick={() => void boot(target)} className="rounded-full border border-line-strong px-5 py-2 text-sm hover:bg-surface-2">
                      Retry
                    </button>
                    <button onClick={() => void boot('recorded')} className="rounded-full bg-fg px-5 py-2 text-sm font-medium text-bg hover:bg-white">
                      Watch the recorded run
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </LaunchCtx.Provider>
  );
}

/** Any element can launch: the circle grows from where it was clicked. */
export function LaunchButton({ children, className = '', target = 'live' }: { children: React.ReactNode; className?: string; target?: 'live' | 'recorded' }) {
  const launch = useLaunch();
  return (
    <button
      className={className}
      onClick={e => {
        const r = e.currentTarget.getBoundingClientRect();
        launch({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, target);
      }}
    >
      {children}
    </button>
  );
}
