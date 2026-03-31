'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { MarkdownOutput } from '@/components/shared/markdown-output';
import { api } from '@/lib/api/client';
import { downloadFile } from '@/lib/utils';
import { MODE_DISPLAY } from '@/lib/constants';
import { CustomSelect } from '@/components/shared/custom-select';
import type { PMInput } from '@/types';

export function SummaryPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const iterations = useSessionStore((s) => s.iterations);
  const currentOutput = useSessionStore((s) => s.currentOutput);
  const currentEval = useSessionStore((s) => s.currentEval);
  const selfAudit = useSessionStore((s) => s.selfAudit);

  const setSelfAudit = useSessionStore((s) => s.setSelfAudit);
  const resetSession = useSessionStore((s) => s.resetSession);
  const setObjective = useSessionStore((s) => s.setObjective);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setError = useSessionStore((s) => s.setError);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [hardResetLoading, setHardResetLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Iteration comparison state
  const [leftIdx, setLeftIdx] = useState(Math.max(0, iterations.length - 1));
  const [rightIdx, setRightIdx] = useState(0);

  const modeLabel = MODE_DISPLAY[mode]?.display_name ?? mode;
  const alignmentScore = currentEval?.alignment.score;

  const inputs: PMInput = {
    objective,
    audience,
    constraints,
    output_format: outputFormat,
    mode,
  };

  async function handleDownloadSummary() {
    setSummaryLoading(true);
    try {
      const result = await api.formatSummary({ inputs, iterations });
      downloadFile(result.summary, 'promptmaster_session.txt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary.');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleDownloadJson() {
    setExportLoading(true);
    try {
      const result = await api.exportSession({ inputs, iterations, model });
      downloadFile(result.json, 'promptmaster_session.json', 'application/json');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export session.');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleRunSelfAudit() {
    setAuditLoading(true);
    try {
      const result = await api.runSelfAudit({ inputs, iterations, model });
      setSelfAudit(result.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run self-audit.');
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleHardReset() {
    setHardResetLoading(true);
    try {
      const result = await api.hardResetLessons({ inputs, iterations, model });
      const savedObjective = objective;
      const savedLessons = result.lessons;
      resetSession();
      setObjective(savedObjective);
      setConstraints(`Lessons from previous session:\n${savedLessons}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to carry lessons forward.');
    } finally {
      setHardResetLoading(false);
    }
  }

  function handleCopy() {
    if (currentOutput) {
      navigator.clipboard.writeText(currentOutput).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="space-y-12">
      {/* 1. Header */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <span className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--pm-primary)] mb-1">
              Session Complete
            </span>
            <h2
              className="font-semibold leading-tight tracking-[-0.04em] text-[var(--on-surface)]"
              style={{ fontSize: '2.75rem' }}
            >
              Evaluation Summary
            </h2>
          </div>
          <div className="text-right">
            <div
              className="font-extrabold text-[var(--pm-primary)] leading-none tracking-tighter"
              style={{ fontSize: '3rem' }}
            >
              {iterations.length}
            </div>
            <div className="text-[10px] uppercase font-bold text-[var(--outline)]">
              {iterations.length === 1 ? 'Iteration' : 'Iterations'}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Metric Cards */}
      <section className="grid grid-cols-3 gap-4">
        <div className="p-6 bg-white rounded-xl shadow-ambient transition-all hover:scale-[1.01]">
          <span className="material-symbols-outlined text-[var(--pm-primary)] mb-3 block text-[20px]">
            architecture
          </span>
          <div className="text-sm font-medium text-[var(--outline-variant)] mb-1">Engine Mode</div>
          <div className="text-xl font-semibold text-[var(--on-surface)]">{modeLabel}</div>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-ambient transition-all hover:scale-[1.01]">
          <span className="material-symbols-outlined text-[var(--pm-primary)] mb-3 block text-[20px]">
            refresh
          </span>
          <div className="text-sm font-medium text-[var(--outline-variant)] mb-1">Iterations</div>
          <div className="text-xl font-semibold text-[var(--on-surface)]">
            {iterations.length} {iterations.length === 1 ? 'Cycle' : 'Cycles'}
          </div>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-ambient transition-all hover:scale-[1.01]">
          <span className="material-symbols-outlined text-[var(--pm-primary)] mb-3 block text-[20px]">
            verified
          </span>
          <div className="text-sm font-medium text-[var(--outline-variant)] mb-1">Final Alignment</div>
          <div className="text-xl font-semibold text-[var(--on-surface)]">{alignmentScore ?? 'N/A'}</div>
        </div>
      </section>

      {/* 3. Final Output */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight text-[var(--on-surface)]">
            Final Prompt Output
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 rounded-lg bg-[var(--surface-container-high)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-container-highest)]"
            >
              <span className="material-symbols-outlined text-sm">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-ambient border border-[var(--outline-variant)] border-opacity-10">
          {currentOutput ? (
            <MarkdownOutput content={currentOutput} />
          ) : (
            <p className="text-sm text-[var(--outline)]">No output yet.</p>
          )}
        </div>

        {/* Download buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleDownloadSummary}
            disabled={summaryLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[var(--surface-container-high)] text-[var(--on-surface)] font-semibold rounded-xl hover:bg-[var(--surface-container-highest)] transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined">description</span>
            {summaryLoading ? 'Generating…' : 'Download Summary .txt'}
          </button>
          <button
            onClick={handleDownloadJson}
            disabled={exportLoading}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[var(--surface-container-high)] text-[var(--on-surface)] font-semibold rounded-xl hover:bg-[var(--surface-container-highest)] transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined">data_object</span>
            {exportLoading ? 'Exporting…' : 'Download Session .json'}
          </button>
        </div>
      </section>

      {/* 4. Iteration Comparison */}
      {iterations.length >= 2 && (
        <section className="rounded-xl overflow-hidden bg-[var(--surface-container-low)]">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[var(--outline)]">
                  compare_arrows
                </span>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--on-surface)]">
                  Iteration Comparison
                </h3>
              </div>
              <span className="material-symbols-outlined transition-transform group-open:rotate-180">
                expand_more
              </span>
            </summary>

            <div className="p-6 pt-0 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Left column */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase font-bold text-[var(--outline)]">
                    Primary Version
                  </label>
                  <CustomSelect
                    value={String(leftIdx)}
                    onChange={(v) => setLeftIdx(Number(v))}
                    options={iterations.map((_, i) => ({
                      value: String(i),
                      label: `Iteration ${i + 1}${i === iterations.length - 1 ? ' (Latest)' : ''}`,
                    }))}
                  />
                  <div className="h-40 overflow-y-auto rounded-lg border border-[var(--outline-variant)] border-opacity-10 bg-white p-4 text-xs leading-relaxed text-[var(--on-surface-variant)]">
                    {iterations[leftIdx]?.output ?? '—'}
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase font-bold text-[var(--outline)]">
                    Compare With
                  </label>
                  <CustomSelect
                    value={String(rightIdx)}
                    onChange={(v) => setRightIdx(Number(v))}
                    options={iterations.map((_, i) => ({
                      value: String(i),
                      label: `Iteration ${i + 1}${i === 0 ? ' (First)' : ''}`,
                    }))}
                  />
                  <div className="h-40 overflow-y-auto rounded-lg border border-[var(--outline-variant)] border-opacity-10 bg-white p-4 text-xs leading-relaxed text-[var(--on-surface-variant)]">
                    {iterations[rightIdx]?.output ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          </details>
        </section>
      )}

      {/* 5. Cold Critic Analysis */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-900 p-8 text-white">
        <div className="relative z-10 flex items-center justify-between">
          {selfAudit ? (
            <div className="w-full space-y-4">
              <h3 className="text-xl font-bold tracking-tight">Cold Critic Analysis</h3>
              <div className="[&_.prose_*]:text-white [&_.prose_a]:text-blue-300 [&_.prose_code]:bg-white/10 [&_.prose_code]:text-blue-200 [&_.prose_pre]:bg-white/10">
                <MarkdownOutput content={selfAudit} />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight">Cold Critic Analysis</h3>
                <p className="max-w-md text-sm leading-relaxed text-slate-400">
                  Run an adversarial self-audit to identify logical gaps, bias, or potential
                  prompt-injection vulnerabilities in your final output.
                </p>
              </div>
              <button
                onClick={handleRunSelfAudit}
                disabled={auditLoading}
                className="flex items-center gap-2 rounded-xl bg-[var(--pm-primary)] px-6 py-3 text-sm font-bold text-white shadow-xl transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">troubleshoot</span>
                {auditLoading ? 'Running…' : 'Run Full Audit'}
              </button>
            </>
          )}
        </div>
        {/* Decorative glow */}
        <div className="absolute -bottom-10 -right-10 h-40 w-40 blur-[80px] bg-[var(--pm-primary)] opacity-20" />
      </section>

      {/* 6. Footer actions */}
      <footer className="flex items-center justify-between border-t border-[var(--outline-variant)] border-opacity-20 pt-12">
        <div className="flex flex-col items-start">
          <button
            onClick={handleHardReset}
            disabled={hardResetLoading}
            className="flex items-center gap-2 text-sm font-semibold text-[var(--outline)] transition-colors hover:text-[var(--pm-primary)] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">auto_fix_high</span>
            {hardResetLoading ? 'Carrying lessons forward…' : 'Carry Lessons Forward'}
          </button>
          <p className="text-xs text-[var(--outline)] mt-1">
            Summarize lessons from this session and start fresh with them as context.
          </p>
        </div>

        <button
          onClick={() => resetSession()}
          className="rounded-xl bg-[var(--pm-primary)] px-10 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Start New Session
        </button>
      </footer>
    </div>
  );
}
