'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomRuleNode, RuleNodeData } from './CustomRuleNode';
import { RULE_LAYERS } from '@/lib/rules-catalog';
import { NodeStatus, RuleDefinition } from '@/lib/contracts';
import { RuleNodeState } from '@/lib/useExecutionStream';
import { ShieldCheck, BookOpen, X, Info } from 'lucide-react';

interface RuleDagProps {
  rules: RuleDefinition[];
  rulesError?: string | null;
  nodesMap: Record<string, RuleNodeState>;
  onSelectClauseId?: (clauseId: string) => void;
  isDark?: boolean;
}

const nodeTypes = {
  customRule: CustomRuleNode,
};

export function RuleDag({ rules, rulesError, nodesMap, onSelectClauseId, isDark = true }: RuleDagProps) {
  const [selectedRule, setSelectedRule] = useState<RuleDefinition | null>(null);
  const rulesMap = useMemo(() => Object.fromEntries(rules.map(r => [r.ruleCode, r])), [rules]);

  const handleNodeClick = useCallback(
    (ruleCode: string) => {
      const rule = rulesMap[ruleCode];
      if (rule) {
        setSelectedRule(rule);
      }
    },
    [rulesMap]
  );

  // Compute stable initial layout coordinates once
  const { initialNodes, initialEdges } = useMemo(() => {
    const layerIndices: Record<string, number> = {
      TYPE: 0,
      RANGE: 1,
      CONSISTENCY: 2,
      RULE_MATCH: 3,
      SOURCE: 4,
      GROUNDING: 5,
    };

    const layerCounters: Record<string, number> = {
      TYPE: 0,
      RANGE: 0,
      CONSISTENCY: 0,
      RULE_MATCH: 0,
      SOURCE: 0,
      GROUNDING: 0,
    };

    const nodes: Node<RuleNodeData>[] = [];
    const edges: Edge[] = [];

    rules.forEach(rule => {
      const colIdx = layerIndices[rule.layer] ?? 0;
      const rowIdx = layerCounters[rule.layer]++;

      const x = 40 + colIdx * 260;
      const y = 80 + rowIdx * 115;

      nodes.push({
        id: rule.ruleCode,
        type: 'customRule',
        position: { x, y },
        data: {
          ruleCode: rule.ruleCode,
          name: rule.name,
          layer: rule.layer,
          sourceCode: rule.sourceCode,
          status: 'PENDING',
          onClickNode: handleNodeClick,
          isDark,
        },
      });

      (rule.dependsOn || []).filter(dep => rulesMap[dep]).forEach(depRuleCode => {
        edges.push({
          id: `e-${depRuleCode}-${rule.ruleCode}`,
          source: depRuleCode,
          target: rule.ruleCode,
          animated: false,
          style: {
            stroke: isDark ? '#334155' : '#cbd5e1',
            strokeWidth: 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isDark ? '#334155' : '#cbd5e1',
            width: 14,
            height: 14,
          },
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [rules, rulesMap, handleNodeClick, isDark]);

  // Use persistent React Flow node and edge state so nodes never disappear or reset
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Rebuild the graph when the rule set arrives from the backend (or changes).
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Dynamically update node status and edge illumination without resetting positions or viewport
  useEffect(() => {
    setNodes(nds =>
      nds.map(node => {
        const liveResult = nodesMap[node.id];
        const status: NodeStatus = liveResult ? liveResult.result : 'PENDING';
        return {
          ...node,
          data: {
            ...node.data,
            status,
            expected: liveResult?.expected,
            actual: liveResult?.actual,
            reason: liveResult?.reason,
            onClickNode: handleNodeClick,
            isDark,
          },
        };
      })
    );

    setEdges(eds =>
      eds.map(edge => {
        const targetRule = edge.target;
        const liveResult = nodesMap[targetRule];
        const status: NodeStatus = liveResult ? liveResult.result : 'PENDING';
        const isFailed = status === 'FAILED';
        const isPassed = status === 'PASSED';
        const isEvaluating = status !== 'PENDING' && status !== 'SKIPPED';
        const strokeColor = isFailed
          ? '#f43f5e'
          : isPassed || isEvaluating
          ? '#38bdf8'
          : isDark
          ? '#334155'
          : '#cbd5e1';

        return {
          ...edge,
          animated: isEvaluating,
          style: {
            stroke: strokeColor,
            strokeWidth: isFailed ? 2.5 : (isPassed || isEvaluating) ? 2 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
            width: 13,
            height: 13,
          },
        };
      })
    );
  }, [nodesMap, handleNodeClick, isDark, setNodes, setEdges, initialNodes]);

  const activeResult = selectedRule ? nodesMap[selectedRule.ruleCode] : null;

  return (
    <div
      className={`relative w-full h-full flex flex-col rounded-xl overflow-hidden shadow-sm border transition-colors ${
        isDark
          ? 'bg-[#050507] border-white/10 text-white'
          : 'bg-white border-neutral-200 text-neutral-900'
      }`}
    >
      {/* Top Layer Header Strip (Monochrome) */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b text-xs backdrop-blur-md z-10 transition-colors ${
          isDark
            ? 'bg-neutral-950/80 border-white/10'
            : 'bg-neutral-50/90 border-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2 font-mono font-semibold tracking-wide">
          <ShieldCheck className="w-4 h-4" />
          <span>DETERMINISTIC GOSU VERIFICATION GRAPH ({rules.length} RULES)</span>
        </div>
        <div
          className={`flex items-center gap-4 text-[11px] font-mono ${
            isDark ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />{' '}
            Passed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />{' '}
            Failed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isDark ? 'bg-neutral-700' : 'bg-neutral-300'
              }`}
            />{' '}
            Pending
          </span>
        </div>
      </div>

      {/* Layer column names pinned at top */}
      <div
        className={`grid grid-cols-6 gap-2 px-6 py-2 border-b text-center text-[11px] font-mono font-medium z-10 transition-colors ${
          isDark
            ? 'bg-neutral-950/40 border-white/5 text-neutral-400'
            : 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
        }`}
      >
        {RULE_LAYERS.map(l => (
          <div
            key={l.layer}
            className={`px-2 py-1 rounded border truncate ${
              isDark
                ? 'bg-white/5 border-white/10 text-neutral-300'
                : 'bg-white border-neutral-200 text-neutral-700 shadow-sm'
            }`}
          >
            {l.label}
          </div>
        ))}
      </div>

      {/* React Flow Canvas (Persistent Node Graph - NEVER DISAPPEARS) */}
      <div className="relative flex-1 w-full min-h-0">
        {rules.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
            <div className={`max-w-sm text-xs font-mono ${rulesError ? 'text-rose-500' : isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {rulesError
                ? `Rule graph unavailable: ${rulesError}`
                : 'Loading the rule graph from the Gosu backend…'}
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="w-full h-full"
        >
          <Background
            color={isDark ? '#222225' : '#cbd5e1'}
            gap={20}
            size={1}
          />
          <Controls
            className={`!rounded-lg overflow-hidden border ${
              isDark
                ? '!bg-neutral-900 !border-neutral-800 !text-white'
                : '!bg-white !border-neutral-300 !text-black shadow-sm'
            }`}
          />
          <MiniMap
            nodeStrokeColor={isDark ? '#555555' : '#aaaaaa'}
            nodeColor={isDark ? '#1a1a1a' : '#eeeeee'}
            maskColor={isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)'}
            className={`!rounded-lg overflow-hidden border ${
              isDark ? '!bg-neutral-950 !border-neutral-800' : '!bg-white !border-neutral-300'
            }`}
          />
        </ReactFlow>
      </div>

      {/* Rule Detail Modal */}
      {selectedRule && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div
            className={`border rounded-xl max-w-lg w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
              isDark
                ? 'bg-neutral-950 border-neutral-700 text-white'
                : 'bg-white border-neutral-300 text-neutral-900'
            }`}
          >
            <div
              className={`flex items-center justify-between border-b pb-3 mb-4 ${
                isDark ? 'border-neutral-800' : 'border-neutral-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">
                  {selectedRule.ruleCode}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-mono ${
                    isDark
                      ? 'bg-white/10 text-white border-white/20'
                      : 'bg-neutral-100 text-neutral-800 border-neutral-300'
                  }`}
                >
                  {selectedRule.layer}
                </span>
              </div>
              <button
                onClick={() => setSelectedRule(null)}
                className={`p-1 rounded-full transition-colors cursor-pointer ${
                  isDark ? 'hover:bg-white/10 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-black'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label
                  className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                    isDark ? 'text-neutral-400' : 'text-neutral-500'
                  }`}
                >
                  STATUTORY CLAUSE NAME
                </label>
                <div className="text-sm font-semibold mt-1">
                  {selectedRule.name}
                </div>
              </div>

              <div>
                <label
                  className={`text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 font-semibold ${
                    isDark ? 'text-neutral-400' : 'text-neutral-500'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" /> IRDAI AUTHORITY CITATION
                </label>
                <div
                  className={`font-mono p-3 rounded-lg border mt-1 text-[11px] ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-neutral-200'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-800'
                  }`}
                >
                  {selectedRule.sourceCode}
                </div>
              </div>

              <div>
                <label
                  className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                    isDark ? 'text-neutral-400' : 'text-neutral-500'
                  }`}
                >
                  APPLIES TO TARGET COV PATTERN
                </label>
                <div
                  className={`font-mono p-3 rounded-lg border mt-1 text-[11px] ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-neutral-200'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-800'
                  }`}
                >
                  {selectedRule.appliesTo}
                </div>
              </div>

              {selectedRule.dependsOn.length > 0 && (
                <div>
                  <label
                    className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                      isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    DEPENDENT UPON RULES
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedRule.dependsOn.map(dep => (
                      <span
                        key={dep}
                        className={`px-2 py-0.5 rounded border font-mono text-[11px] ${
                          isDark
                            ? 'bg-white/5 border-white/10 text-white'
                            : 'bg-neutral-100 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeResult ? (
                <div
                  className={`pt-3 border-t ${
                    isDark ? 'border-neutral-800' : 'border-neutral-200'
                  }`}
                >
                  <label
                    className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                      isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    DETERMINISTIC EVALUATION
                  </label>
                  <div
                    className={`mt-1.5 p-3 rounded-lg border space-y-1.5 font-mono text-[11px] ${
                      isDark
                        ? 'bg-white/5 border-white/10'
                        : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className={isDark ? 'text-neutral-400' : 'text-neutral-500'}>
                        Result:
                      </span>
                      <span
                        className={
                          activeResult.result === 'PASSED'
                            ? 'font-bold'
                            : activeResult.result === 'FAILED'
                            ? 'text-rose-500 font-bold'
                            : ''
                        }
                      >
                        {activeResult.result}
                      </span>
                    </div>
                    {activeResult.expected && (
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-neutral-400' : 'text-neutral-500'}>
                          Expected:
                        </span>
                        <span>{activeResult.expected}</span>
                      </div>
                    )}
                    {activeResult.actual && (
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-neutral-400' : 'text-neutral-500'}>
                          Actual:
                        </span>
                        <span className="font-semibold">{activeResult.actual}</span>
                      </div>
                    )}
                    {activeResult.reason && (
                      <div
                        className={`pt-1.5 border-t text-xs italic ${
                          isDark ? 'border-white/10 text-neutral-300' : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        &quot;{activeResult.reason}&quot;
                      </div>
                    )}
                  </div>
                  {activeResult.clauseResults.length > 1 || activeResult.clauseResults[0]?.clauseId ? (
                    <div className="mt-3 space-y-1">
                      <div className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        Evaluated on {activeResult.clauseResults.length} target(s)
                      </div>
                      {activeResult.clauseResults.map((r, i) => (
                        <button
                          key={`${r.clauseId ?? 'proposal'}-${i}`}
                          disabled={!r.clauseId || !onSelectClauseId}
                          onClick={() => r.clauseId && onSelectClauseId?.(r.clauseId)}
                          className={`w-full flex justify-between items-center px-2 py-1 rounded border text-[11px] font-mono text-left ${
                            isDark ? 'border-white/10 hover:bg-white/5' : 'border-neutral-200 hover:bg-neutral-50'
                          } ${r.clauseId && onSelectClauseId ? 'cursor-pointer' : 'cursor-default'}`}
                          title={r.clauseId ? 'Open provenance for this clause' : 'Proposal-level check'}
                        >
                          <span>{r.clauseId ?? 'proposal'}</span>
                          <span className={r.result === 'FAILED' ? 'text-rose-500 font-bold' : r.result === 'PASSED' ? 'text-emerald-500' : ''}>
                            {r.result}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  className={`pt-2 italic flex items-center gap-1.5 ${
                    isDark ? 'text-neutral-400' : 'text-neutral-500'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  Node awaiting evaluation in the active docket stream.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedRule(null)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                    : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-black'
                }`}
              >
                Close Folio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
