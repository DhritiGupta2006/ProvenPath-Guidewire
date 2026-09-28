'use client';

import React, { useEffect, useState } from 'react';
import { Server, ExternalLink, FileCode, ShieldCheck, Clock, CheckCircle2, AlertCircle, Copy, Check, Download } from 'lucide-react';
import { DeploymentSummary, PcExportPayload } from '@/lib/contracts';
import { api, ApiError, PC_URL } from '@/lib/api';
import { PcStage, StreamMode } from '@/lib/useExecutionStream';

interface DeployPanelProps {
  executionId: string | null;
  mode: StreamMode;
  canDeploy: boolean;
  pcStage: PcStage;
  pcDetail: string;
  pcExportData: PcExportPayload | null;
  elapsedRestartSeconds: number;
  isOpen: boolean;
  onClose: () => void;
}

const DEPLOY_STEPS = [
  { id: 'export', label: 'Export', desc: 'Signed package built' },
  { id: 'queued', label: 'Queued', desc: 'Waiting for VM agent' },
  { id: 'pulled', label: 'Pulled', desc: 'Agent re-verifies' },
  { id: 'write', label: 'Write', desc: 'modules/configuration' },
  { id: 'restart', label: 'Restart', desc: 'gwb.bat (~4 min)' },
  { id: 'ready', label: 'Ready', desc: 'Port 8180 up' },
  { id: 'verified', label: 'Verified', desc: 'ProductModelAPI' },
];

/**
 * Deployment to the real PolicyCenter. The backend only builds a package when the gate token and the
 * reviewer's approval both check out; the steps after "Queued" are reported by the ProvenPath agent
 * running next to PolicyCenter. Nothing on this panel is simulated.
 */
export function DeployPanel({
  executionId,
  mode,
  canDeploy,
  pcStage,
  pcDetail,
  pcExportData,
  elapsedRestartSeconds,
  isOpen,
  onClose,
}: DeployPanelProps) {
  const [activeTab, setActiveTab] = useState<'stepper' | 'manifest' | 'files'>('stepper');
  const [copied, setCopied] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployment, setDeployment] = useState<DeploymentSummary | null>(null);

  const deploymentId = pcExportData?.deploymentId || null;

  // Load the real signed manifest once the backend has built the package (and refresh as the agent reports).
  useEffect(() => {
    if (!deploymentId || mode === 'recorded') return;
    let cancelled = false;
    api
      .deployment(deploymentId)
      .then(d => !cancelled && setDeployment(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deploymentId, pcStage, mode]);

  if (!isOpen) return null;

  const currentStepIndex = DEPLOY_STEPS.findIndex(s => s.id === pcStage);
  const isCompleted = pcStage === 'verified';
  const manifest = deployment?.manifest || null;
  const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const triggerDeploy = async () => {
    if (!executionId) return;
    setIsDeploying(true);
    setDeployError(null);
    try {
      await api.deploy(executionId);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'exporter_unavailable') {
        setDeployError(
          'The PolicyCenter package builder (:pcexport) is not wired into the backend yet, so no package was built and nothing was sent to PolicyCenter.'
        );
      } else {
        setDeployError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
      }
    } finally {
      setIsDeploying(false);
    }
  };

  const copyManifest = () => {
    if (!manifest) return;
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tab = (id: typeof activeTab, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`pb-2 px-3 border-b-2 transition-colors ${
        activeTab === id ? 'border-cyan-400 text-cyan-300 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/75 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-950 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-slate-200"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-600/60 text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-mono">GUIDEWIRE POLICYCENTER DEPLOYMENT</h2>
              <p className="text-xs text-slate-400">Signed, reviewer-approved package pulled by the ProvenPath agent on the PolicyCenter VM</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            Close
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-800 mb-5 text-xs font-mono">
          {tab('stepper', 'Live status')}
          {tab('manifest', 'provenpath-manifest.json')}
          {tab('files', `Package files (${manifest?.files?.length ?? pcExportData?.files ?? 0})`)}
        </div>

        {activeTab === 'stepper' && (
          <div className="space-y-6">
            <div className="grid grid-cols-7 gap-2">
              {DEPLOY_STEPS.map((step, idx) => {
                const passed = isCompleted || currentStepIndex > idx;
                const current = !isCompleted && currentStepIndex === idx;
                return (
                  <div key={step.id} className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border font-mono text-xs font-bold mb-1.5 ${
                        passed
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-400'
                          : current
                          ? 'bg-cyan-950 border-cyan-400 text-cyan-300 animate-pulse'
                          : 'bg-slate-900 border-slate-800 text-slate-600'
                      }`}
                    >
                      {passed ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div className={`text-[11px] font-mono font-medium ${passed ? 'text-emerald-300' : current ? 'text-cyan-300' : 'text-slate-600'}`}>
                      {step.label}
                    </div>
                    <div className="text-[9px] text-slate-500 truncate max-w-full">{step.desc}</div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">STATUS</span>
                {pcStage === 'restart' && (
                  <span className="flex items-center gap-1.5 text-cyan-400 animate-pulse">
                    <Clock className="w-3.5 h-3.5" /> PolicyCenter restarting: {fmt(elapsedRestartSeconds)}
                  </span>
                )}
                {isCompleted && (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <ShieldCheck className="w-4 h-4" /> Confirmed by PolicyCenter
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-200 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {pcDetail ||
                  (mode === 'recorded'
                    ? 'Recorded demo: deployment is only possible from a live run.'
                    : canDeploy
                    ? 'Approved. Ready to build the signed package.'
                    : 'Waiting for the Compliance Reviewer approval.')}
              </p>
              {deployError && (
                <p className="text-xs font-mono p-2.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-400 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {deployError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              {pcStage === 'idle' && mode === 'live' && (
                <button
                  onClick={triggerDeploy}
                  disabled={!canDeploy || isDeploying}
                  className="px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canDeploy ? 'Build and queue the signed package' : 'Needs an approved run'}
                >
                  {isDeploying ? 'Building package…' : 'Deploy to PolicyCenter'}
                </button>
              )}
              <div className="ml-auto flex items-center gap-3">
                {deploymentId && mode === 'live' && (
                  <a
                    href={api.packageUrl(deploymentId)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700"
                  >
                    <Download className="w-4 h-4" /> Package .zip
                  </a>
                )}
                <a
                  href={PC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-xs ${
                    isCompleted ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  Open PolicyCenter <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manifest' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">Manifest as stored by the backend (signed with the run&apos;s gate token)</span>
              <button
                onClick={copyManifest}
                disabled={!manifest}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-mono disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300 max-h-72 overflow-y-auto whitespace-pre-wrap">
              {manifest ? JSON.stringify(manifest, null, 2) : 'No package has been built for this run yet.'}
            </pre>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {manifest?.files?.length ? (
              manifest.files.map(file => (
                <div key={file.path} className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 font-mono text-xs space-y-1">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold truncate">
                    <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">{file.path}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">SHA-256 {file.sha256}</div>
                </div>
              ))
            ) : (
              <div className="text-xs font-mono text-slate-500">No package has been built for this run yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
