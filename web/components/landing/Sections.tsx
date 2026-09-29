'use client';

import React, { useRef } from 'react';
import { motion, MotionValue, useScroll, useTransform } from 'motion/react';
import { BookOpen, Lock } from 'lucide-react';
import { EvalMetrics, RuleDefinition } from '@/lib/contracts';
import { RULE_LAYERS } from '@/lib/rules-catalog';
import { Reveal, SpotlightCard, Ticker, WordReveal } from '@/components/ui/primitives';

/** The 23 rules as they are in rules/rules/*.yaml, used only when the backend is not reachable. */
export const RULES_FALLBACK: Pick<RuleDefinition, 'ruleCode' | 'name' | 'layer'>[] = [
  { ruleCode: 'CYB-TYPE-001', name: 'Type field validation', layer: 'TYPE' },
  { ruleCode: 'CYB-TYPE-002', name: 'Owning entity type validation', layer: 'TYPE' },
  { ruleCode: 'CYB-TYPE-003', name: 'Existence and category validation', layer: 'TYPE' },
  { ruleCode: 'CYB-RNG-001', name: 'Aggregate limit range 5L to 5Cr', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-002', name: 'Extortion sublimit <= 50% of aggregate', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-003', name: 'Deductible 1-10% of limit', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-004', name: 'BI waiting period 8-72 hours', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-005', name: 'Turnover within the MSME medium-enterprise limit (500Cr)', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-006', name: 'Rating factors 0.5-3.0', layer: 'RANGE' },
  { ruleCode: 'CYB-RNG-007', name: 'Minimum premium floor', layer: 'RANGE' },
  { ruleCode: 'CYB-CON-001', name: 'Sum of first-party sublimits <= aggregate', layer: 'CONSISTENCY' },
  { ruleCode: 'CYB-CON-002', name: 'Deductible < limit for each coverage', layer: 'CONSISTENCY' },
  { ruleCode: 'CYB-CON-003', name: 'No exclusion nullifies a Required coverage', layer: 'CONSISTENCY' },
  { ruleCode: 'CYB-CON-004', name: 'No duplicate pattern codes', layer: 'CONSISTENCY' },
  { ruleCode: 'CYB-RM-001', name: 'Mandatory coverages present', layer: 'RULE_MATCH' },
  { ruleCode: 'CYB-RM-002', name: 'Mandatory exclusions present', layer: 'RULE_MATCH' },
  { ruleCode: 'CYB-RM-003', name: 'Ransom cover carries law-enforcement-notification condition', layer: 'RULE_MATCH' },
  { ruleCode: 'CYB-RM-004', name: 'Fines coverage has insurability condition', layer: 'RULE_MATCH' },
  { ruleCode: 'CYB-RM-005', name: 'CERT-In 6-hour notification condition present', layer: 'RULE_MATCH' },
  { ruleCode: 'CYB-SRC-001', name: 'Every clause has >=1 citation', layer: 'SOURCE' },
  { ruleCode: 'CYB-SRC-002', name: 'Citation source exists, snippet matches, active on date, jurisdiction IN', layer: 'SOURCE' },
  { ruleCode: 'CYB-SRC-003', name: 'Source active on proposal target effective date', layer: 'SOURCE' },
  { ruleCode: 'CYB-GRD-001', name: 'Every number in proseSummary matches a verified value', layer: 'GROUNDING' },
];

function ScrollWord({ word, range, progress }: { word: string; range: [number, number]; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  return (
    <motion.span style={{ opacity }} className="mr-[0.25em] inline-block">
      {word}
    </motion.span>
  );
}

/** A paragraph that lights up word by word as it scrolls through the viewport. */
export function ProblemStatement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 45%'] });
  const text =
    'Language models draft insurance products in seconds. They are fluent, confident and sometimes wrong: a sublimit above the regulated cap, a citation paraphrased into something the regulator never wrote. In a regulated product, sometimes is too often.';
  const words = text.split(' ');
  return (
    <section className="mx-auto max-w-5xl px-6 py-40">
      <p className="mb-10 font-mono text-xs uppercase tracking-[0.2em] text-muted">The problem</p>
      <p ref={ref} className="text-3xl font-medium leading-[1.25] tracking-tight md:text-5xl">
        {words.map((w, i) => (
          <ScrollWord key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
        ))}
      </p>
    </section>
  );
}

export function RuleMarquee({ rules }: { rules: Pick<RuleDefinition, 'ruleCode' | 'name'>[] }) {
  const row = [...rules, ...rules];
  return (
    <div className="mask-fade-x relative overflow-hidden border-y border-line py-5">
      <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {row.map((r, i) => (
          <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm text-muted">
            <span className="font-mono text-[11px] text-accent">{r.ruleCode}</span>
            {r.name}
            <span className="ml-7 h-1 w-1 rounded-full bg-faint" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Layers({ rules }: { rules: Pick<RuleDefinition, 'ruleCode' | 'name' | 'layer'>[] }) {
  return (
    <section id="layers" className="mx-auto max-w-6xl px-6 py-32">
      <div className="mb-16 max-w-2xl">
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-muted">The gate</p>
        <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
          <WordReveal text="Six layers. No opinions." italicWords={['opinions']} />
        </h2>
        <Reveal delay={0.2}>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            The gate is code, not a model. The same proposal always gets the same verdict and the same hash, so any decision can be replayed and
            audited later.
          </p>
        </Reveal>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RULE_LAYERS.map((l, i) => {
          const inLayer = rules.filter(r => r.layer === l.layer);
          return (
            <Reveal key={l.layer} delay={i * 0.06}>
              <SpotlightCard className="h-full p-6">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-faint">0{i + 1}</span>
                  <span className="font-mono text-xs text-accent">{inLayer.length} rules</span>
                </div>
                <h3 className="mt-6 text-xl font-medium">{l.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{l.description}</p>
                <ul className="mt-5 space-y-1.5 border-t border-line pt-4">
                  {inLayer.slice(0, 4).map(r => (
                    <li key={r.ruleCode} className="flex gap-2 text-xs text-muted">
                      <span className="shrink-0 font-mono text-faint">{r.ruleCode.replace('CYB-', '')}</span>
                      <span className="truncate">{r.name}</span>
                    </li>
                  ))}
                  {inLayer.length > 4 && <li className="text-xs text-faint">+{inLayer.length - 4} more</li>}
                </ul>
              </SpotlightCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/** The tamper demo, told visually: one word of a regulation changes and the SOURCE layer notices. */
export function TamperStory() {
  return (
    <section className="relative overflow-hidden py-32">
      <div className="absolute inset-0 bg-grid mask-radial opacity-40" />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-2">
        <div>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-muted">Try to break it</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
            <WordReveal text="Change one word. Get caught." italicWords={['caught.', 'caught']} />
          </h2>
          <Reveal delay={0.2}>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Models paraphrase. Regulators don&apos;t. Every citation is checked against the official text, byte for byte. Mission Control has a
              tamper test that edits one word of the real CERT-In direction and sends it to the real gate. It is blocked at the source layer, with
              nothing stored and nothing deployed.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className="rounded-3xl border border-line bg-surface/80 p-7 backdrop-blur">
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
              <BookOpen className="h-3.5 w-3.5 text-accent" /> CERT-In Directions, 28 Apr 2022 · Direction (ii)
            </div>
            <p className="mt-4 font-serif text-xl leading-snug text-fg">
              “Any service provider, intermediary, data centre, body corporate and Government organisation{' '}
              <span className="relative inline-block">
                <motion.span
                  initial={{ opacity: 1 }}
                  whileInView={{ opacity: 0.35 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.9 }}
                  className="relative"
                >
                  shall
                  <motion.span
                    className="absolute left-0 top-1/2 h-[2px] w-full origin-left bg-fail"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                  />
                </motion.span>
                <motion.span
                  className="absolute -top-7 left-0 font-sans text-base italic text-fail"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.1 }}
                >
                  may
                </motion.span>
              </span>{' '}
              mandatorily report cyber incidents as mentioned in Annexure I to CERT-In within 6 hours of noticing such incidents…”
            </p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 1.6 }}
              className="mt-7 flex items-center gap-3 rounded-xl border border-fail/30 bg-fail/[0.07] px-4 py-3"
            >
              <Lock className="h-4 w-4 text-fail" />
              <div className="text-sm">
                <span className="font-mono text-xs text-fail">CYB-SRC-002 · FAILED</span>
                <div className="text-muted">Snippet does not match the stored source text.</div>
              </div>
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Proof({ metrics, ruleCount, online }: { metrics: EvalMetrics | null; ruleCount: number | null; online: boolean | null }) {
  const cells = [
    { label: 'False passes on the labelled corpus', value: metrics?.falsePassCount, of: metrics?.falsePassDenominator, good: true },
    { label: 'False blocks on the labelled corpus', value: metrics?.falseBlockCount, of: metrics?.falseBlockDenominator },
    { label: 'Deterministic rules in the graph', value: ruleCount },
    { label: 'Approved clauses with a matching citation', value: metrics ? metrics.provenanceCompleteness * 100 : null, suffix: '%' },
  ];
  return (
    <section id="proof" className="mx-auto max-w-6xl px-6 py-32">
      <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-muted">Proof, not promises</p>
          <h2 className="max-w-xl text-4xl font-medium tracking-tight md:text-5xl">
            <WordReveal text="Measured by the gate itself." italicWords={['itself.']} />
          </h2>
        </div>
        <p className="max-w-sm text-sm text-muted">
          {online === false
            ? 'The backend is offline, so these numbers are not shown. They are never hard-coded.'
            : 'Read live from the backend’s eval run (GET /api/v1/metrics) with the denominators shown.'}
        </p>
      </div>
      <div className="grid grid-cols-2 border-l border-t border-line lg:grid-cols-4">
        {cells.map((c, i) => (
          <Reveal key={c.label} delay={i * 0.07} className="border-b border-r border-line p-7">
            <div className={`text-5xl font-medium tracking-tight md:text-6xl ${c.good && c.value === 0 ? 'text-pass' : ''}`}>
              <Ticker value={c.value ?? null} decimals={c.suffix ? 0 : 0} suffix={c.suffix || ''} />
              {c.of != null && <span className="text-2xl text-faint"> / {c.of}</span>}
            </div>
            <p className="mt-4 text-sm text-muted">{c.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
