'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, Server, Activity, Award, Sparkles, Sun, Moon, XCircle } from 'lucide-react';
import { ReplayTamperControls } from '@/components/controls/ReplayTamperControls';
import { GateBlockedPayload, HealthResponse } from '@/lib/contracts';
import { API_URL } from '@/lib/api';
import { OverallStatus, StreamMode } from '@/lib/useExecutionStream';

interface NavbarProps {
  overallStatus: OverallStatus;
  mode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  executionId: string | null;
  health: HealthResponse | null;
  healthError: string | null;
  isStreaming: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  onStart: () => void;
  onReset: () => void;
  onOpenMetrics: () => void;
  onOpenDeploy: () => void;
  onOpenReview?: () => void;
  onTamperResult: (data: GateBlockedPayload) => void;
  onError: (message: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Navbar({
  overallStatus,
  mode,
  onModeChange,
  executionId,
  health,
  healthError,
  isStreaming,
  speed,
  setSpeed,
  onStart,
  onReset,
  onOpenMetrics,
  onOpenDeploy,
  onOpenReview,
  onTamperResult,
  onError,
  isDark,
  onToggleTheme,
}: NavbarProps) {
  const getStatusBadge = () => {
    switch (overallStatus) {
      case 'starting':
      case 'running':
        return (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-medium border animate-pulse ${
              isDark
                ? 'bg-white/10 border-white/30 text-white'
                : 'bg-black/5 border-black/20 text-black'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> STREAMING VERDICT
          </span>
        );
      case 'blocked':
        return (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border ${
              isDark
                ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                : 'bg-black text-white border-black shadow-[0_0_15px_rgba(0,0,0,0.2)]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> BLOCKED · NOTHING WRITTEN TO POLICYCENTER
          </span>
        );
      case 'repairing':
        return (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-semibold border ${
              isDark
                ? 'bg-white/10 border-white/30 text-white'
                : 'bg-black/5 border-black/20 text-black'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 animate-spin" /> PLANNER REPAIRING PROPOSAL
          </span>
        );
      case 'review_pending':
        return (
          <button
            onClick={onOpenReview}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
              isDark
                ? 'bg-white/15 border-white/40 text-white hover:bg-white/25 shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                : 'bg-black/10 border-black/30 text-black hover:bg-black/15'
            }`}
            title="Click to review and approve Guidewire PolicyCenter export"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> PASSED · AWAITING REVIEWER
          </button>
        );
      case 'passed':
        return (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border ${
              isDark
                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> GATE PASSED
          </span>
        );
      case 'rejected':
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border border-rose-500/60 text-rose-500 bg-rose-500/10">
            <XCircle className="w-3.5 h-3.5" /> {overallStatus === 'rejected' ? 'REJECTED BY REVIEWER' : 'ERROR'}
          </span>
        );
      case 'approved':
      case 'deploying':
        return (
          <button
            onClick={onOpenDeploy}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
              isDark
                ? 'bg-white/15 border-white/40 text-white hover:bg-white/25'
                : 'bg-black/10 border-black/30 text-black hover:bg-black/15'
            }`}
          >
            <Server className="w-3.5 h-3.5" /> {overallStatus === 'approved' ? 'APPROVED · DEPLOY' : 'DEPLOYING TO POLICYCENTER'}
          </button>
        );
      case 'deployed':
        return (
          <button
            onClick={onOpenDeploy}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] font-bold border transition-colors cursor-pointer shadow-sm ${
              isDark
                ? 'bg-white text-black border-white hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                : 'bg-black text-white border-black hover:bg-neutral-800 shadow-[0_0_20px_rgba(0,0,0,0.25)]'
            }`}
            title="Click to view Guidewire PolicyCenter deployment manifest & files"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> CONFIRMED IN POLICYCENTER
          </button>
        );
      default:
        return (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] border ${
              isDark
                ? 'bg-white/[0.04] border-white/10 text-neutral-400'
                : 'bg-black/[0.03] border-black/10 text-neutral-500'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isDark ? 'bg-neutral-500' : 'bg-neutral-400'
              }`}
            />{' '}
            STANDBY · READY
          </span>
        );
    }
  };

  return (
    <header
      className={`border-b px-4 py-2.5 backdrop-blur-md sticky top-0 z-30 transition-colors ${
        isDark
          ? 'bg-[#050507]/90 border-white/10 text-white'
          : 'bg-white/95 border-neutral-200 text-neutral-900 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Logo & Product Name (Monochrome Minimalist) */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm border transition-colors ${
              isDark
                ? 'bg-black border-white/30 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                : 'bg-black border-black text-white shadow-sm'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-black font-mono tracking-wider uppercase">
              PROVENPATH
            </span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {mode === 'recorded' && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-black tracking-widest border border-amber-500/70 text-amber-500 bg-amber-500/10" title="Replaying a recorded real run, not a live execution">
              RECORDED
            </span>
          )}
          {getStatusBadge()}
          <span
            className={`flex items-center gap-1 text-[10px] font-mono ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}
            title={healthError ? `Backend ${API_URL}: ${healthError}` : health ? `Backend ${API_URL} · ruleset ${health.rulesetHash.slice(0, 12)}… · planner ${health.planner}` : 'Checking backend…'}
          >
            <span className={`w-2 h-2 rounded-full ${healthError ? 'bg-rose-500' : health ? 'bg-emerald-500' : 'bg-neutral-500'}`} />
            {healthError ? 'backend offline' : health ? 'backend' : '…'}
          </span>
        </div>

        {/* Action Controls, Modals & Theme Toggle */}
        <div className="flex items-center gap-2">
          {/* Light / Dark Mode Toggle */}
          <button
            onClick={onToggleTheme}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
              isDark
                ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            }`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-neutral-300" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-neutral-700" />
                <span>Dark</span>
              </>
            )}
          </button>

          {/* Metrics Trigger (vector charts inside modal preserved) */}
          <button
            onClick={onOpenMetrics}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
              isDark
                ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" /> Metrics
          </button>

          <div
            className={`h-5 w-px mx-1 ${
              isDark ? 'bg-neutral-800' : 'bg-neutral-300'
            }`}
          />

          {/* Replay & Tamper Controls (Re-verify & Tamper retain colors) */}
          <ReplayTamperControls
            mode={mode}
            onModeChange={onModeChange}
            executionId={executionId}
            speed={speed}
            setSpeed={setSpeed}
            onStart={onStart}
            onReset={onReset}
            isStreaming={isStreaming}
            onTamperResult={onTamperResult}
            onError={onError}
            isDark={isDark}
          />
        </div>
      </div>
    </header>
  );
}
