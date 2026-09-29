'use client';

import React, { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'motion/react';
import { ArrowRight, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { EvalMetrics, HealthResponse, RuleDefinition } from '@/lib/contracts';
import { Magnetic, Reveal, WordReveal, Wordmark } from '@/components/ui/primitives';
import { GateCanvas } from '@/components/landing/GateCanvas';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LaunchButton, LaunchProvider } from '@/components/landing/LaunchSequence';
import { Layers, ProblemStatement, Proof, RULES_FALLBACK, RuleMarquee, TamperStory } from '@/components/landing/Sections';

function PrimaryLaunch({ label = 'Launch Mission Control' }: { label?: string }) {
  return (
    <Magnetic>
      <LaunchButton className="beam-border group flex items-center gap-2.5 rounded-full bg-fg px-7 py-3.5 text-[15px] font-medium text-bg shadow-[0_0_40px_rgb(157_156_255/0.25)] transition-colors hover:bg-white">
        {label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </LaunchButton>
    </Magnetic>
  );
}

export default function Landing() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [rules, setRules] = useState<RuleDefinition[] | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.1 });
    return () => lenis.destroy();
  }, []);

  useEffect(() => {
    api
      .health()
      .then(h => {
        setHealth(h);
        setOnline(true);
      })
      .catch(() => setOnline(false));
    api.rules().then(r => setRules(r.rules)).catch(() => {});
    api.metrics().then(setMetrics).catch(() => {});
  }, []);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', v => setScrolled(v > 24));
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(heroProgress, [0, 1], [0, 140]);
  const heroOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(heroProgress, [0, 1], [1, 0.94]);

  const shownRules = rules ?? RULES_FALLBACK;

  return (
    <LaunchProvider>
      <main
        className="relative overflow-x-clip"
        onPointerMove={e => {
          document.documentElement.style.setProperty('--cx', `${e.clientX}px`);
          document.documentElement.style.setProperty('--cy', `${e.clientY}px`);
        }}
      >
        {/* cursor light */}
        <div
          className="pointer-events-none fixed inset-0 z-30 hidden md:block"
          style={{ background: 'radial-gradient(600px circle at var(--cx, 50%) var(--cy, 30%), rgb(157 156 255 / 0.045), transparent 70%)' }}
        />

        <header
          className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${scrolled ? 'border-b border-line bg-bg/70 backdrop-blur-xl' : 'border-b border-transparent'}`}
        >
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Wordmark />
            <div className="hidden items-center gap-8 text-sm text-muted md:flex">
              <a href="#how" className="transition-colors hover:text-fg">How it works</a>
              <a href="#layers" className="transition-colors hover:text-fg">The gate</a>
              <a href="#proof" className="transition-colors hover:text-fg">Proof</a>
            </div>
            <LaunchButton className="rounded-full border border-line-strong px-4 py-1.5 text-sm transition-colors hover:bg-surface-2">
              Launch
            </LaunchButton>
          </nav>
        </header>

        {/* Hero */}
        <section ref={heroRef} className="relative h-dvh min-h-[680px] overflow-hidden">
          <div className="absolute inset-0 bg-grid mask-radial" />
          <motion.div className="absolute inset-0" style={{ opacity: heroOpacity }}>
            <GateCanvas className="opacity-80" />
          </motion.div>
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-bg" />

          <motion.div style={{ y: heroY, opacity: heroOpacity, scale: heroScale }} className="relative mx-auto flex h-full max-w-6xl flex-col justify-center px-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 flex w-fit items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pl-1.5 pr-3.5 text-xs text-muted backdrop-blur"
            >
              <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">PolicyCenter 10</span>
              A compliance gate for AI-built insurance products
            </motion.div>

            <h1 className="max-w-4xl text-[clamp(2.75rem,7vw,6rem)] font-medium leading-[0.98] tracking-[-0.035em]">
              <WordReveal text="AI proposes." delay={0.1} />
              <br />
              <WordReveal text="Rules decide." delay={0.3} italicWords={['decide']} />
              <br />
              <span className="text-muted">
                <WordReveal text="People approve." delay={0.5} />
              </span>
            </h1>

            <Reveal delay={0.9}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
                ProvenPath sits between a language model and Guidewire PolicyCenter. Nothing the model writes reaches production until 23 deterministic
                rules pass it and a named compliance reviewer signs it.
              </p>
            </Reveal>

            <Reveal delay={1.05}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <PrimaryLaunch />
                <LaunchButton target="recorded" className="flex items-center gap-2 rounded-full px-5 py-3.5 text-[15px] text-muted transition-colors hover:text-fg">
                  <Play className="h-4 w-4 fill-current" /> Watch a recorded run
                </LaunchButton>
              </div>
            </Reveal>

            <Reveal delay={1.2}>
              <div className="mt-14 flex items-center gap-2 font-mono text-[11px] text-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-pass shadow-[0_0_8px_var(--color-pass)]' : online === false ? 'bg-fail' : 'bg-faint'}`} />
                {online === null && 'checking the gate backend…'}
                {online === false && 'gate backend offline · the recorded run still works'}
                {online && health && `gate backend online · ruleset ${health.rulesetHash.slice(0, 8)} · planner ${health.llmMode}`}
              </div>
            </Reveal>
          </motion.div>
        </section>

        <RuleMarquee rules={shownRules} />
        <ProblemStatement />
        <HowItWorks />
        <Layers rules={shownRules} />
        <TamperStory />
        <Proof metrics={metrics} ruleCount={rules ? rules.length : null} online={online} />

        {/* Final call */}
        <section className="relative overflow-hidden px-6 py-40 text-center">
          <div
            className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgb(123 121 255 / 0.16), transparent 65%)' }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-5xl font-medium tracking-tight md:text-7xl">
              <WordReveal text="Ship products you can prove." italicWords={['prove.']} />
            </h2>
            <Reveal delay={0.3}>
              <p className="mx-auto mt-6 max-w-md text-muted">Describe a cyber product and watch it go from a prompt to a verified, approved PolicyCenter package.</p>
            </Reveal>
            <Reveal delay={0.45}>
              <div className="mt-10 flex justify-center">
                <PrimaryLaunch />
              </div>
            </Reveal>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-faint md:flex-row">
            <Wordmark />
            <span>Rules cite official texts (IRDAI, CERT-In, MeitY, MSME Ministry) and our labelled underwriting guideline. A rule-graph check, not legal advice.</span>
          </div>
        </footer>
      </main>
    </LaunchProvider>
  );
}
