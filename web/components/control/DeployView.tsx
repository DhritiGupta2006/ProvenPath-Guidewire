'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, Download, ExternalLink, Rocket } from 'lucide-react';
import { DeploymentSummary, PcExportPayload } from '@/lib/contracts';
import { api, ApiError, PC_URL, shortHash } from '@/lib/api';
import { PcStage, StreamMode } from '@/lib/useExecutionStream';

const STEPS: { id: PcStage; label: string; desc: string }[] = [
  { id: 'export', label: 'Package signed', desc: 'Built only with a valid gate token and approval' },
  { id: 'queued', label: 'Queued', desc: 'Waiting for the agent next to PolicyCenter' },
  { id: 'pulled', label: 'Pulled', desc: 'The agent re-verifies the signature' },
  { id: 'write', label: 'Written', desc: 'Overlay copied into modules/configuration' },
  { id: 'restart', label: 'Restarting', desc: 'gwb runServer, about four minutes' },
  { id: 'ready', label: 'Ready', desc: 'PolicyCenter answering on its port' },
  { id: 'verified', label: 'Confirmed', desc: 'ProductModelAPI returns the SMCyber patterns' },
];

interface DeployViewProps {
  executionId: string | null;
  mode: StreamMode;
  canDeploy: boolean;
  pcStage: PcStage;
  pcDetail: string;
  pcExportData: PcExportPayload | null;
  elapsedRestartSeconds: number;
}

/** Deployment to the real PolicyCenter. Steps after "Queued" are reported by the VM agent; nothing here is simulated. */
export function DeployView({ executionId, mode, canDeploy, pcStage, pcDetail, pcExportData, elapsedRestartSeconds }: DeployViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deployment, setDeployment] = useState<DeploymentSummary | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const deploymentId = pcExportData?.deploymentId || null;

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

  const deploy = async () => {
    if (!executionId) return;
    setBusy(true);
    setError(null);
    try {
      await api.deploy(executionId);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'exporter_unavailable') {
        setError('The PolicyCenter package builder (:pcexport) is not wired into the backend yet, so no package was built and nothing was sent.');
      } else setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  const current = STEPS.findIndex(s => s.id === pcStage);
  const done = pcStage === 'verified';
  const failed = pcStage === 'failed';
  const mmss = `${String(Math.floor(elapsedRestartSeconds / 60)).padStart(2, '0')}:${String(elapsedRestartSeconds % 60).padStart(2, '0')}`;
  const manifest = deployment?.manifest;

  return (
    <div className="space-y-5">
      <div>
        <div className={`font-mono text-[10px] uppercase tracking-[0.2em] ${done ? 'text-pass' : failed ? 'text-fail' : 'text-accent'}`}>
          {done ? 'Live' : failed ? 'Failed' : 'Deployment'}
        </div>
        <h3 className="mt-1 font-serif text-4xl italic">{done ? 'In PolicyCenter' : 'Ship to PolicyCenter'}</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {pcDetail ||
            (mode === 'recorded'
              ? 'Recorded run: deployment is only possible from a live run.'
              : canDeploy
              ? 'Approved. The signed package is ready to build.'
              : 'Waiting for the compliance approval.')}
        </p>
      </div>

      <div className="relative space-y-0.5 pl-1">
        <div className="absolute bottom-4 left-[14px] top-4 w-px bg-line" />
        <motion.div
          className="absolute left-[14px] top-4 w-px bg-pass"
          animate={{ height: current < 0 ? 0 : `calc((100% - 32px) * ${done ? 1 : current / (STEPS.length - 1)})` }}
          transition={{ duration: 0.6 }}
        />
        {STEPS.map((s, i) => {
          const passed = done || (current > i && !failed) || (failed && current > i);
          const active = !done && current === i;
          return (
            <div key={s.id} className="relative flex items-start gap-3 py-2">
              <span
                className={`relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors ${
                  passed
                    ? 'border-pass/50 bg-[#10251c] text-pass'
                    : active
                    ? failed
                      ? 'border-fail bg-[#2a1215] text-fail'
                      : 'border-accent bg-[#1a1a33] text-accent'
                    : 'border-line bg-surface text-faint'
                }`}
              >
                {passed ? <Check className="h-3.5 w-3.5" /> : i + 1}
                {active && !failed && <span className="absolute inset-0 animate-ping rounded-full border border-accent/60" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className={`text-[13px] ${passed ? 'text-fg' : active ? 'text-fg' : 'text-muted'}`}>
                  {s.label}
                  {s.id === 'restart' && active && <span className="ml-2 font-mono text-xs text-accent">{mmss}</span>}
                </div>
                <div className="text-[11px] text-faint">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-xs text-warn">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {pcStage === 'idle' && mode === 'live' && (
          <button
            onClick={() => void deploy()}
            disabled={!canDeploy || busy}
            className="beam-border flex flex-1 items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-medium text-bg hover:bg-white disabled:opacity-40"
          >
            <Rocket className="h-4 w-4" /> {busy ? 'Building the package…' : 'Deploy to PolicyCenter'}
          </button>
        )}
        {deploymentId && mode === 'live' && (
          <a href={api.packageUrl(deploymentId)} className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-muted hover:text-fg">
            <Download className="h-4 w-4" /> Package
          </a>
        )}
        <a
          href={PC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${done ? 'flex-1 justify-center bg-pass font-medium text-bg' : 'border border-line text-muted hover:text-fg'}`}
        >
          Open PolicyCenter <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {manifest && (
        <div className="rounded-xl border border-line">
          <button onClick={() => setShowFiles(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-xs text-muted hover:text-fg">
            <span>
              Signed manifest · {manifest.files.length} files · {shortHash(pcExportData?.manifestSha256, 10)}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showFiles ? 'rotate-180' : ''}`} />
          </button>
          {showFiles && (
            <div className="max-h-64 space-y-1 overflow-y-auto border-t border-line p-3 font-mono text-[10px]">
              {manifest.files.map(f => (
                <div key={f.path} className="flex justify-between gap-3">
                  <span className="truncate text-fg">{f.path}</span>
                  <span className="shrink-0 text-faint">{f.sha256.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
