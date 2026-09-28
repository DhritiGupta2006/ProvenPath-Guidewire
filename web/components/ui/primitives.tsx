'use client';

import React, { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

/** The ProvenPath mark: a path that passes through a gate. */
export function Logo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M11 6v20M21 6v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 20c5 0 7-8 12-8s7 8 12 8" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 font-medium tracking-tight">
      <Logo className="w-7 h-7 text-fg" />
      <span className="text-[15px]">ProvenPath</span>
    </span>
  );
}

/** Button that leans toward the cursor. */
export function Magnetic({ children, strength = 0.28, className = '' }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className={`inline-block ${className}`}
      onPointerMove={e => {
        if (reduced || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to `value` once visible (or whenever `value` changes). */
export function Ticker({ value, decimals = 0, suffix = '', className = '' }: { value: number | null | undefined; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const from = useRef(0);
  useEffect(() => {
    if (!ref.current || value == null || !inView) return;
    const node = ref.current;
    const controls = animate(from.current, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => {
        node.textContent = v.toFixed(decimals) + suffix;
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, decimals, suffix]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value == null ? '—' : (0).toFixed(decimals) + suffix}
    </span>
  );
}

/** Headline that reveals word by word, out of a blur. */
export function WordReveal({ text, className = '', delay = 0, italicWords = [] }: { text: string; className?: string; delay?: number; italicWords?: string[] }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className={`inline-block mr-[0.22em] ${italicWords.includes(w.replace(/[.,]/g, '')) ? 'font-serif italic font-normal text-accent' : ''}`}
          initial={{ opacity: 0, y: '0.35em', filter: 'blur(10px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: delay + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

/** Fade-up on scroll into view. */
export function Reveal({ children, delay = 0, className = '', y = 24 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Card with a soft light that follows the cursor. */
export function SpotlightCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={e => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-surface/60 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--mx) var(--my), rgb(157 156 255 / 0.12), transparent 60%)' }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
