'use client';

import React, { useState } from 'react';
import { ToolCallItem } from '@/lib/useExecutionStream';
import { Wrench, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface ToolsPanelProps {
  toolCalls: ToolCallItem[];
  isDark?: boolean;
}

export function ToolsPanel({ toolCalls, isDark = true }: ToolsPanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleExpand = (idx: number) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  const copyJson = (data: unknown, idx: number) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
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
          <Wrench className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-wider font-mono uppercase">
            TOOLS INSPECTOR
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              isDark
                ? 'bg-white/5 text-neutral-300 border-white/10'
                : 'bg-neutral-100 text-neutral-700 border-neutral-200'
            }`}
          >
            {toolCalls.length}
          </span>
        </div>
      </div>

      {/* Tool Call List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 font-mono text-xs">
        {toolCalls.length === 0 ? (
          <div
            className={`h-full flex flex-col items-center justify-center text-center p-6 space-y-2 ${
              isDark ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            <Wrench className="w-8 h-8 animate-pulse" />
            <div className="text-xs">No tool calls recorded yet</div>
            <div className="text-[10px]">Planner tool invocations will appear here</div>
          </div>
        ) : (
          toolCalls.map((item, idx) => {
            const isExpanded = expandedIndex === idx;

            return (
              <div
                key={`${item.seq}-${item.tool}`}
                className={`rounded-lg border overflow-hidden transition-all ${
                  isDark
                    ? 'border-white/[0.08] bg-white/[0.02]'
                    : 'border-neutral-200 bg-neutral-50'
                }`}
              >
                <div
                  onClick={() => toggleExpand(idx)}
                  className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-white/[0.05]' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                    <span className="font-semibold font-mono text-xs">
                      {item.tool}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                        item.result
                          ? isDark
                            ? 'bg-white/10 text-white border-white/20'
                            : 'bg-black text-white border-black font-bold'
                          : isDark
                          ? 'bg-white/5 text-neutral-400 border-white/10'
                          : 'bg-neutral-200 text-neutral-700 border-neutral-300'
                      }`}
                    >
                      {item.result ? 'COMPLETED' : 'CALLED'}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        copyJson(
                          { tool: item.tool, args: item.args, result: item.result },
                          idx
                        );
                      }}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        isDark
                          ? 'text-neutral-400 hover:text-white hover:bg-white/10'
                          : 'text-neutral-500 hover:text-black hover:bg-neutral-200'
                      }`}
                      title="Copy JSON"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    className={`p-2.5 pt-0 border-t space-y-2 ${
                      isDark
                        ? 'border-white/5 bg-black/50'
                        : 'border-neutral-200 bg-white'
                    }`}
                  >
                    {item.args && (
                      <div>
                        <div
                          className={`text-[10px] font-semibold mb-1 ${
                            isDark ? 'text-neutral-400' : 'text-neutral-500'
                          }`}
                        >
                          ARGUMENTS
                        </div>
                        <pre
                          className={`p-2 rounded border text-[10px] overflow-x-auto ${
                            isDark
                              ? 'bg-black border-white/10 text-neutral-300'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-800'
                          }`}
                        >
                          {JSON.stringify(item.args, null, 2)}
                        </pre>
                      </div>
                    )}

                    {item.result && (
                      <div>
                        <div
                          className={`text-[10px] font-semibold mb-1 ${
                            isDark ? 'text-neutral-300' : 'text-neutral-700'
                          }`}
                        >
                          RESULT
                        </div>
                        <pre
                          className={`p-2 rounded border text-[10px] overflow-x-auto ${
                            isDark
                              ? 'bg-black border-white/10 text-white'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-900 font-medium'
                          }`}
                        >
                          {JSON.stringify(item.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
