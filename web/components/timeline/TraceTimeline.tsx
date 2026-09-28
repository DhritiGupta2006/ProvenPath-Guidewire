'use client';

import React, { useState, useRef, useEffect } from 'react';
import { BaseEvent } from '@/lib/contracts';
import {
  Activity,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Server,
  Wrench,
  Sparkles,
  ArrowDown,
} from 'lucide-react';

interface TraceTimelineProps {
  events: BaseEvent[];
  isDark?: boolean;
}

export function TraceTimeline({ events, isDark = true }: TraceTimelineProps) {
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'planner') return e.type.startsWith('planner.');
    if (filter === 'tools') return e.type.startsWith('tool.');
    if (filter === 'verify') return e.type.startsWith('verify.');
    if (filter === 'gate') return e.type.startsWith('gate.');
    if (filter === 'review') return e.type.startsWith('review.');
    if (filter === 'pc') return e.type.startsWith('pc.');
    return true;
  });

  const getEventBadge = (type: string) => {
    if (type.startsWith('planner.')) {
      return {
        icon: <Sparkles className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/10 text-white border-white/20'
          : 'bg-neutral-100 text-black border-neutral-300',
      };
    }
    if (type.startsWith('tool.')) {
      return {
        icon: <Wrench className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/10 text-white border-white/20'
          : 'bg-neutral-100 text-black border-neutral-300',
      };
    }
    if (type === 'gate.blocked') {
      return {
        icon: <ShieldAlert className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-rose-500/20 text-rose-300 border-rose-500 font-bold'
          : 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      };
    }
    if (type === 'gate.passed') {
      return {
        icon: <ShieldCheck className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/15 text-white border-white/30 font-bold'
          : 'bg-black/10 text-black border-black/20 font-bold',
      };
    }
    if (type.startsWith('verify.')) {
      return {
        icon: <Activity className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/5 text-neutral-300 border-white/10'
          : 'bg-neutral-50 text-neutral-700 border-neutral-200',
      };
    }
    if (type.startsWith('review.')) {
      return {
        icon: <UserCheck className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/10 text-white border-white/20'
          : 'bg-neutral-100 text-black border-neutral-300',
      };
    }
    if (type.startsWith('pc.')) {
      return {
        icon: <Server className="w-3.5 h-3.5" />,
        badge: isDark
          ? 'bg-white/10 text-white border-white/20'
          : 'bg-neutral-100 text-black border-neutral-300',
      };
    }
    return {
      icon: <Terminal className="w-3.5 h-3.5" />,
      badge: isDark
        ? 'bg-white/5 text-neutral-400 border-white/10'
        : 'bg-neutral-100 text-neutral-600 border-neutral-200',
    };
  };

  const formatSummary = (event: BaseEvent) => {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'run.started':
        return `Started in [${payload.mode || 'fixture'}] mode`;
      case 'planner.step':
        return `Step ${payload.step}: ${payload.action} — ${payload.note || ''}`;
      case 'planner.repair':
        return `Repairing iteration ${payload.iteration}: rule ${payload.failedRule}`;
      case 'tool.called':
        return `Tool called: ${payload.tool}`;
      case 'tool.result':
        return `Tool returned result for ${payload.tool}`;
      case 'proposal.created':
        return `Proposal ${payload.proposalId} created (Iter ${payload.iteration}, ${payload.clauses} clauses)`;
      case 'verify.started':
        return `Verifying 23 rules across ${payload.nodeCount} node instances`;
      case 'verify.node':
        return `${payload.ruleCode} (${payload.layer}): ${payload.result} ${payload.actual ? `[${payload.actual}]` : ''}`;
      case 'gate.blocked': {
        const failed = (payload.failedRules as string[]) || [];
        return `⛔ GATE BLOCKED: Failed ${failed.join(', ')} (0 written to PolicyCenter)`;
      }
      case 'gate.passed':
        return `✅ GATE PASSED: Verdict hash ${String(payload.verdictHash || '').substring(0, 10)}...`;
      case 'review.requested':
        return `Review requested by: ${(payload.reviewers as string[])?.join(', ')}`;
      case 'review.decided':
        return `Review decision: ${payload.decision} by ${payload.reviewer}`;
      case 'pc.export':
        return `Exported ${payload.productCode} package (${payload.files} files)`;
      case 'pc.queued':
        return `Package queued for Guidewire VM agent`;
      case 'pc.pulled':
        return `Agent ${payload.agent || 'pcagent'} pulled package`;
      case 'pc.write':
        return String(payload.detail || 'Files written to configuration');
      case 'pc.restart':
        return String(payload.detail || 'PolicyCenter restarting...');
      case 'pc.ready':
        return String(payload.detail || 'PolicyCenter port 8180 ready');
      case 'pc.verified':
        return `Verified in PolicyCenter: ${String(payload.detail || 'ProductModelAPI check')}`;
      case 'run.completed':
        return `Run completed with status: ${payload.status}`;
      default:
        return JSON.stringify(payload).substring(0, 60);
    }
  };

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden shadow-sm border transition-colors ${
        isDark
          ? 'bg-[#050507] border-white/10 text-white'
          : 'bg-white border-neutral-200 text-neutral-900'
      }`}
    >
      {/* Header (Monochrome) */}
      <div
        className={`px-3.5 py-2.5 border-b flex items-center justify-between transition-colors ${
          isDark
            ? 'bg-neutral-950/80 border-white/10'
            : 'bg-neutral-50/90 border-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-wider font-mono uppercase">
            TRACE TIMELINE
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              isDark
                ? 'bg-white/5 text-neutral-300 border-white/10'
                : 'bg-neutral-100 text-neutral-700 border-neutral-200'
            }`}
          >
            {events.length}
          </span>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
            autoScroll
              ? isDark
                ? 'bg-white/15 text-white border-white/30'
                : 'bg-black text-white border-black'
              : isDark
              ? 'bg-neutral-900 text-neutral-400 border-neutral-800'
              : 'bg-neutral-100 text-neutral-500 border-neutral-200'
          }`}
        >
          <ArrowDown className="w-2.5 h-2.5" />
          {autoScroll ? 'Auto-scroll ON' : 'Paused'}
        </button>
      </div>

      {/* Filter Tabs (Monochrome) */}
      <div
        className={`flex gap-1 p-1.5 border-b overflow-x-auto text-[10px] font-mono transition-colors ${
          isDark
            ? 'bg-neutral-950/40 border-white/5'
            : 'bg-neutral-100/60 border-neutral-200'
        }`}
      >
        {[
          { key: 'all', label: 'All' },
          { key: 'planner', label: 'Planner' },
          { key: 'tools', label: 'Tools' },
          { key: 'verify', label: 'Verify' },
          { key: 'gate', label: 'Gates' },
          { key: 'review', label: 'Review' },
          { key: 'pc', label: 'PC' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap cursor-pointer ${
              filter === item.key
                ? isDark
                  ? 'bg-white text-black font-bold'
                  : 'bg-black text-white font-bold'
                : isDark
                ? 'text-neutral-400 hover:text-white'
                : 'text-neutral-500 hover:text-black'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2.5 space-y-2 font-mono text-xs">
        {filteredEvents.length === 0 ? (
          <div
            className={`h-full flex flex-col items-center justify-center text-center p-6 space-y-2 ${
              isDark ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            <Activity className="w-8 h-8 animate-pulse" />
            <div className="text-xs">Waiting for execution stream...</div>
            <div className="text-[10px]">Click &quot;Run Demo&quot; above to initiate</div>
          </div>
        ) : (
          filteredEvents.map(event => {
            const badge = getEventBadge(event.type);
            const timeStr = event.ts ? event.ts.substring(11, 23) : '';

            return (
              <div
                key={`${event.seq}-${event.type}`}
                className={`group relative flex gap-2 p-2 rounded-lg border transition-all ${
                  isDark
                    ? 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.07] hover:border-white/20'
                    : 'bg-neutral-50 hover:bg-neutral-100/80 border-neutral-200'
                }`}
              >
                <div className="flex flex-col items-center pt-0.5">
                  <div
                    className={`p-1 rounded border ${
                      isDark ? 'bg-black/60 border-white/10' : 'bg-white border-neutral-200 shadow-xs'
                    }`}
                  >
                    {badge.icon}
                  </div>
                  <span
                    className={`text-[9px] font-mono mt-1 ${
                      isDark ? 'text-neutral-500' : 'text-neutral-400'
                    }`}
                  >
                    #{event.seq}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold tracking-wider ${badge.badge}`}
                    >
                      {event.type}
                    </span>
                    <span
                      className={`text-[9px] ${
                        isDark ? 'text-neutral-500' : 'text-neutral-400'
                      }`}
                    >
                      {timeStr}
                    </span>
                  </div>

                  <p
                    className={`text-[11px] break-words leading-tight ${
                      isDark ? 'text-neutral-200' : 'text-neutral-800'
                    }`}
                  >
                    {formatSummary(event)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
