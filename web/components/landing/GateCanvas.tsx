'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  lane: number;
  fails: boolean;
  state: 'in' | 'out' | 'dead';
  life: number;
}
interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Hero background: proposals stream toward a gate of rule layers. Most pass and leave in green,
 * some are stopped and shatter in red. Pure canvas, paused off-screen, static when reduced motion.
 */
export function GateCanvas({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const LANES = 14;
    const particles: Particle[] = [];
    const shards: Shard[] = [];
    let gateFlash = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let spawnAcc = 0;

    const gateX = () => w * 0.62;
    const laneY = (lane: number) => h * 0.18 + (lane / (LANES - 1)) * h * 0.64;

    const spawn = () => {
      const lane = Math.floor(Math.random() * LANES);
      particles.push({ x: -10, y: laneY(lane), vx: 70 + Math.random() * 70, lane, fails: Math.random() < 0.24, state: 'in', life: 1 });
    };

    const drawGate = (t: number) => {
      const gx = gateX();
      // six layer columns forming the gate
      for (let i = 0; i < 6; i++) {
        const x = gx + (i - 2.5) * 7;
        const grad = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.9);
        grad.addColorStop(0, 'rgba(157,156,255,0)');
        grad.addColorStop(0.5, `rgba(157,156,255,${0.22 + 0.08 * Math.sin(t / 700 + i)})`);
        grad.addColorStop(1, 'rgba(157,156,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 0.75, h * 0.1, 1.5, h * 0.8);
      }
      if (gateFlash > 0) {
        const g = ctx.createRadialGradient(gx, h / 2, 0, gx, h / 2, h * 0.5);
        g.addColorStop(0, `rgba(255,95,95,${0.12 * gateFlash})`);
        g.addColorStop(1, 'rgba(255,95,95,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - h * 0.5, 0, h, h);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);

      // lanes
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let l = 0; l < LANES; l++) {
        ctx.beginPath();
        ctx.moveTo(0, laneY(l));
        ctx.lineTo(w, laneY(l));
        ctx.stroke();
      }

      drawGate(now);

      spawnAcc += dt;
      if (spawnAcc > 0.16) {
        spawnAcc = 0;
        if (particles.length < 70) spawn();
      }

      const gx = gateX();
      for (const p of particles) {
        if (p.state === 'dead') continue;
        p.x += p.vx * dt;
        if (p.state === 'in' && p.x >= gx - 20) {
          if (p.fails) {
            p.state = 'dead';
            gateFlash = 1;
            for (let i = 0; i < 12; i++) {
              const a = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
              const s = 40 + Math.random() * 120;
              shards.push({ x: p.x, y: p.y, vx: -Math.abs(Math.sin(a)) * s, vy: Math.cos(a) * s, life: 1 });
            }
            continue;
          }
          p.state = 'out';
          p.vx *= 1.5;
        }
        const color = p.state === 'out' ? '63,220,151' : '236,236,241';
        const tail = p.state === 'out' ? 70 : 38;
        const grad = ctx.createLinearGradient(p.x - tail, p.y, p.x, p.y);
        grad.addColorStop(0, `rgba(${color},0)`);
        grad.addColorStop(1, `rgba(${color},${p.state === 'out' ? 0.9 : 0.55})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - tail, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${color},1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (p.x > w + 80) p.state = 'dead';
      }

      for (const s of shards) {
        if (s.life <= 0) continue;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.life -= dt * 1.4;
        ctx.fillStyle = `rgba(255,95,95,${Math.max(0, s.life)})`;
        ctx.fillRect(s.x, s.y, 2, 2);
      }

      gateFlash = Math.max(0, gateFlash - dt * 2.5);
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].state === 'dead') particles.splice(i, 1);
      for (let i = shards.length - 1; i >= 0; i--) if (shards[i].life <= 0) shards.splice(i, 1);

      if (visible && !reduced) raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      for (let i = 0; i < 30; i++) {
        spawn();
        particles[particles.length - 1].x = Math.random() * w;
      }
      frame(performance.now());
    } else {
      // prime the stream so the first frame is not empty
      for (let i = 0; i < 26; i++) {
        spawn();
        particles[particles.length - 1].x = Math.random() * gateX() * 0.95;
      }
      raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver(([entry]) => {
      const wasVisible = visible;
      visible = entry.isIntersecting;
      if (visible && !wasVisible && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={`h-full w-full ${className}`} aria-hidden />;
}
