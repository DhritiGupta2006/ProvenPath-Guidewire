import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CheckCircle2, XCircle, AlertCircle, MinusCircle, Clock } from 'lucide-react';
import { NodeStatus, Layer } from '@/lib/contracts';

export interface RuleNodeData extends Record<string, unknown> {
  ruleCode: string;
  name: string;
  layer: Layer;
  sourceCode: string;
  status: NodeStatus;
  expected?: string;
  actual?: string;
  reason?: string;
  onClickNode?: (ruleCode: string) => void;
  isDark?: boolean;
}

export const CustomRuleNode = memo(({ data }: { data: RuleNodeData }) => {
  const isDark = data.isDark !== false;

  const getStatusColor = (status: NodeStatus) => {
    switch (status) {
      case 'PASSED':
        return {
          bg: isDark
            ? 'bg-neutral-950/80 hover:bg-neutral-900'
            : 'bg-white hover:bg-neutral-50',
          border: isDark
            ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.18)]'
            : 'border-emerald-600/60 shadow-sm',
          badge: isDark
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold'
            : 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
        };
      case 'FAILED':
        return {
          bg: isDark
            ? 'bg-rose-950/40 hover:bg-rose-950/60'
            : 'bg-rose-50 hover:bg-rose-100/60',
          border: 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse',
          badge: isDark
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
            : 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
          icon: <XCircle className="w-3.5 h-3.5 text-rose-500" />,
        };
      case 'SKIPPED':
        return {
          bg: isDark ? 'bg-neutral-950/40' : 'bg-neutral-50/60',
          border: isDark ? 'border-neutral-800 border-dashed' : 'border-neutral-300 border-dashed',
          badge: isDark ? 'bg-neutral-900 text-neutral-500 border-neutral-800' : 'bg-neutral-100 text-neutral-500 border-neutral-200',
          icon: <MinusCircle className="w-3.5 h-3.5 text-neutral-500" />,
        };
      case 'NEEDS_REVIEW':
        return {
          bg: isDark ? 'bg-neutral-900/60' : 'bg-neutral-100/60',
          border: isDark ? 'border-white/30' : 'border-neutral-400',
          badge: isDark ? 'bg-white/10 text-neutral-300 border-white/20' : 'bg-neutral-200 text-neutral-800 border-neutral-300',
          icon: <AlertCircle className="w-3.5 h-3.5" />,
        };
      case 'PENDING':
      default:
        return {
          bg: isDark ? 'bg-neutral-950/40 hover:bg-neutral-900/40' : 'bg-white hover:bg-neutral-50',
          border: isDark ? 'border-neutral-800/80 hover:border-neutral-700' : 'border-neutral-200 hover:border-neutral-300',
          badge: isDark ? 'bg-neutral-900/60 text-neutral-500 border-neutral-800' : 'bg-neutral-100 text-neutral-400 border-neutral-200',
          icon: <Clock className="w-3.5 h-3.5 text-neutral-500" />,
        };
    }
  };

  const style = getStatusColor(data.status);

  return (
    <div
      onClick={() => data.onClickNode?.(data.ruleCode)}
      className={`px-3 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer w-[220px] backdrop-blur-sm ${style.bg} ${style.border}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-2 !h-2 !border-none ${
          isDark ? '!bg-white/60' : '!bg-black/60'
        }`}
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span
          className={`font-mono text-xs font-semibold ${
            isDark ? 'text-white' : 'text-neutral-900'
          }`}
        >
          {data.ruleCode}
        </span>
        <span
          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${style.badge}`}
        >
          {style.icon}
          {data.status}
        </span>
      </div>

      <div
        className={`text-xs font-medium truncate mb-1 ${
          isDark ? 'text-neutral-200' : 'text-neutral-800'
        }`}
        title={data.name}
      >
        {data.name}
      </div>

      <div
        className={`flex items-center justify-between text-[10px] ${
          isDark ? 'text-neutral-400' : 'text-neutral-500'
        }`}
      >
        <span className="font-mono truncate max-w-[130px]">{data.sourceCode}</span>
        <span className="uppercase text-[9px] tracking-wider px-1 rounded bg-black/5 dark:bg-white/5">
          {data.layer}
        </span>
      </div>

      {data.status === 'FAILED' && data.actual && (
        <div className="mt-1.5 pt-1.5 border-t border-rose-500/30 text-[10px] text-rose-500 font-mono">
          <div className="truncate font-semibold">Actual: {data.actual}</div>
          <div className={`truncate ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Exp: {data.expected}
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className={`!w-2 !h-2 !border-none ${
          isDark ? '!bg-white/60' : '!bg-black/60'
        }`}
      />
    </div>
  );
});

CustomRuleNode.displayName = 'CustomRuleNode';
