'use client';

import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { Check, FileCode2, Server, Sparkles, UserCheck, ShieldCheck } from 'lucide-react';

const STEPS = [
  {
    icon: Sparkles,
    kicker: '01 · Propose',
    title: 'The AI drafts the product.',
    body: 'Describe a product in plain words. The planner turns it into PolicyCenter coverage patterns, limits, deductibles and exclusions, each clause citing the regulation it relies on.',
  },
  {
    icon: ShieldCheck,
    kicker: '02 · Verify',
    title: 'Twenty-three rules decide.',
    body: 'A deterministic Gosu rule graph checks every clause across six layers. One failure blocks the whole proposal, names the rule and the regulation, and sends it back to the planner to repair.',
  },
  {
    icon: UserCheck,
    kicker: '03 · Review',
    title: 'A named person signs off.',
    body: 'Only a proposal that passed every rule reaches a Compliance Reviewer. They see each clause with its provenance and approve or reject it. The decision is logged against the verdict hash.',
  },
  {
    icon: Server,
    kicker: '04 · Deploy',
    title: 'Then, and only then, it ships.',
    body: 'The approved package is signed with the gate token and pulled by an agent next to PolicyCenter, which re-checks the signature, writes the product and confirms it through ProductModelAPI.',
  },
];

const CLAUSES = ['Data breach', 'Privacy liability', 'Extortion', 'Business interruption', 'Regulatory fines', 'War excl.', 'Prior known excl.', 'Intentional acts excl.', 'Infra failure excl.', 'Base rating'];
const LAYER_COUNTS = [3, 7, 4, 5, 3, 1];
const DEPLOY = ['Signed package built', 'Queued for the VM agent', 'Pulled, signature re-verified', 'Written to modules/configuration', 'PolicyCenter restarted (~4 min)', 'SMCyber confirmed by ProductModelAPI'];

function ProposeVisual() {
  const prompt = 'Cyber insurance for Indian startups, up to ₹50L coverage';
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface-2 p-4 font-mono text-[13px]">
        <span className="text-faint">› </span>
        {prompt.split('').map((ch, i) => (
          <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.018 }}>
            {ch}
          </motion.span>
        ))}
        <motion.span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-accent" animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {CLAUSES.map((c, i) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 1.1 + i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
            className={`rounded-full border px-3 py-1 text-xs ${c.includes('excl') ? 'border-line text-muted' : 'border-accent/30 bg-accent/10 text-fg'}`}
          >
            {c}
          </motion.span>
        ))}
      </div>
      <p className="text-xs text-faint">10 clauses, each with a regulatory citation.</p>
    </div>
  );
}

function VerifyVisual() {
  let k = 0;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-5">
        {LAYER_COUNTS.map((n, col) => (
          <div key={col} className="flex flex-col gap-2.5">
            {Array.from({ length: n }).map((_, row) => {
              const fail = col === 1 && row === 1;
              const delay = 0.15 + k++ * 0.05;
              return (
                <motion.span
                  key={row}
                  className="block h-3.5 w-3.5 rounded-full"
                  initial={{ backgroundColor: 'rgba(255,255,255,0.08)', scale: 0.6 }}
                  animate={{ backgroundColor: fail ? '#ff5f5f' : '#3fdc97', scale: fail ? [0.6, 1.5, 1] : 1, boxShadow: fail ? '0 0 18px #ff5f5f' : '0 0 0px transparent' }}
                  transition={{ delay: fail ? 1.5 : delay, duration: 0.45 }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8 }}
        className="rounded-xl border border-fail/30 bg-fail/[0.07] p-3.5 text-[13px]"
      >
        <div className="font-mono text-xs text-fail">CYB-RNG-002 · FAILED</div>
        <div className="mt-1 text-fg">Extortion sublimit ₹40,00,000 exceeds 50% of the ₹50L aggregate.</div>
        <div className="mt-1 text-xs text-muted">Blocked. Zero files written. The planner repairs it to ₹20L and iteration 2 passes.</div>
      </motion.div>
    </div>
  );
}

function ReviewVisual() {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 font-serif text-lg italic text-accent">A</div>
        <div>
          <div className="text-sm">A. Mehta</div>
          <div className="text-xs text-muted">Compliance Reviewer</div>
        </div>
        <span className="ml-auto rounded-full border border-pass/30 bg-pass/10 px-2.5 py-0.5 font-mono text-[11px] text-pass">gate passed</span>
      </div>
      <div className="mt-4 space-y-1.5">
        {['Data breach response · ₹20L', 'Cyber extortion · ₹20L', 'Business interruption · ₹10L · 12h wait'].map((c, i) => (
          <motion.div
            key={c}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12 }}
            className="flex items-center gap-2 rounded-lg bg-surface-3/60 px-3 py-2 text-xs"
          >
            <Check className="h-3.5 w-3.5 text-pass" /> {c}
            <span className="ml-auto font-mono text-[10px] text-faint">IRDAI</span>
          </motion.div>
        ))}
      </div>
      <motion.div
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-fg py-2.5 text-sm font-medium text-bg"
        initial={{ scale: 1 }}
        animate={{ scale: [1, 0.96, 1] }}
        transition={{ delay: 1.2, duration: 0.35 }}
      >
        <Check className="h-4 w-4" /> Approve for PolicyCenter
      </motion.div>
      <div className="mt-2 text-center font-mono text-[10px] text-faint">logged against verdict bd62e7b4…</div>
    </div>
  );
}

function DeployVisual() {
  return (
    <div className="relative space-y-3 pl-6">
      <div className="absolute bottom-2 left-[9px] top-2 w-px bg-line" />
      <motion.div
        className="absolute left-[9px] top-2 w-px origin-top bg-pass"
        initial={{ height: 0 }}
        animate={{ height: 'calc(100% - 16px)' }}
        transition={{ duration: DEPLOY.length * 0.3, ease: 'linear' }}
      />
      {DEPLOY.map((d, i) => (
        <motion.div key={d} className="relative flex items-center gap-3 text-[13px]" initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.3 }}>
          <motion.span
            className="absolute -left-6 flex h-[19px] w-[19px] items-center justify-center rounded-full border"
            initial={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: '#15151b' }}
            animate={{ borderColor: '#3fdc97', backgroundColor: 'rgba(63,220,151,0.15)' }}
            transition={{ delay: i * 0.3 }}
          >
            <Check className="h-3 w-3 text-pass" />
          </motion.span>
          <span className={i === DEPLOY.length - 1 ? 'text-pass' : 'text-fg'}>{d}</span>
        </motion.div>
      ))}
      <div className="flex items-center gap-2 pt-2 font-mono text-[11px] text-faint">
        <FileCode2 className="h-3.5 w-3.5" /> PolicyCenter 10 · product SMCyber
      </div>
    </div>
  );
}

const VISUALS = [ProposeVisual, VerifyVisual, ReviewVisual, DeployVisual];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', v => setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length))));
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const Visual = VISUALS[active];

  return (
    <section id="how" ref={ref} className="relative" style={{ height: `${STEPS.length * 90 + 40}vh` }}>
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col justify-center">
            <p className="mb-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">How it works</p>
            <div className="relative space-y-7 pl-6">
              <div className="absolute bottom-0 left-0 top-0 w-px bg-line" />
              <motion.div className="absolute left-0 top-0 w-px bg-accent" style={{ height: bar }} />
              {STEPS.map((s, i) => (
                <motion.div key={s.kicker} animate={{ opacity: i === active ? 1 : 0.3 }} transition={{ duration: 0.4 }}>
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                    <s.icon className="h-3.5 w-3.5" />
                    {s.kicker}
                  </div>
                  <h3 className="mt-2 text-2xl font-medium tracking-tight md:text-[28px]">{s.title}</h3>
                  <AnimatePresence initial={false}>
                    {i === active && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden text-[15px] leading-relaxed text-muted"
                      >
                        <span className="block pt-2">{s.body}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center">
            <div className="absolute -inset-10 rounded-full bg-accent/[0.06] blur-3xl" />
            <div className="relative w-full overflow-hidden rounded-3xl border border-line bg-surface/80 p-7 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-faint">from a recorded run</span>
              </div>
              <div className="min-h-[300px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Visual />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
