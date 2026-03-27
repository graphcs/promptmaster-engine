'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { downloadFile } from '@/lib/utils';
import { MODE_DISPLAY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EvalCard } from '@/components/evaluation/eval-card';
import { MarkdownOutput } from '@/components/shared/markdown-output';

function SmallSpinner() {
  return (
    <div
      className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground"
      role="status"
      aria-label="Loading"
    />
  );
}
import { IterationHistory } from '@/components/evaluation/iteration-history';
import { IterationComparison } from '@/components/evaluation/iteration-comparison';
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

  const modeLabel = MODE_DISPLAY[mode]?.display_name ?? mode;
  const finalAlignment = currentEval?.alignment.score ?? '—';

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
      setConstraints(savedLessons);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to carry lessons forward.');
    } finally {
      setHardResetLoading(false);
    }
  }

  // Build a simple copyable summary
  const copyableSummary = [
    `PromptMaster Session Summary`,
    ``,
    `Objective: ${objective}`,
    `Mode: ${modeLabel}`,
    `Iterations: ${iterations.length}`,
    `Final Alignment: ${finalAlignment}`,
    ``,
    `Final Output:`,
    currentOutput ?? '(no output)',
  ].join('\n');

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-foreground">Step 5: Session Summary</h2>

      {/* Final evaluation card */}
      {currentEval && <EvalCard evaluation={currentEval} />}

      <Separator />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Mode</p>
          <p className="text-sm font-semibold text-foreground">{modeLabel}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Iterations</p>
          <p className="text-sm font-semibold text-foreground">{iterations.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Alignment</p>
          <p className="text-sm font-semibold text-foreground">{finalAlignment}</p>
        </div>
      </div>

      <Separator />

      {/* Final output */}
      {currentOutput && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Final Output:
            </p>
            <div className="rounded-lg border border-border bg-card p-4">
              <MarkdownOutput content={currentOutput} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Export section */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadSummary}
            disabled={summaryLoading}
            className="w-full"
          >
            {summaryLoading ? <SmallSpinner /> : 'Download Summary (.txt)'}
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadJson}
            disabled={exportLoading}
            className="w-full"
          >
            {exportLoading ? <SmallSpinner /> : 'Download Session (.json)'}
          </Button>
        </div>

        {/* Copyable session summary */}
        <details className="rounded-lg border border-border overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-foreground hover:bg-muted/30 transition-colors select-none list-none">
            Copyable Session Summary
          </summary>
          <div className="border-t border-border">
            <pre className="p-4 text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/10 overflow-x-auto">
              {copyableSummary}
            </pre>
          </div>
        </details>
      </div>

      <Separator />

      {/* Iteration history + comparison */}
      {iterations.length >= 2 && (
        <>
          <IterationHistory iterations={iterations} />

          <details className="rounded-lg border border-border overflow-hidden">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-foreground hover:bg-muted/30 transition-colors select-none list-none">
              Compare Iterations
            </summary>
            <div className="border-t border-border p-4">
              <IterationComparison iterations={iterations} />
            </div>
          </details>

          <Separator />
        </>
      )}

      {/* Self-audit section */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Self-Audit (Cold Critic on your prompting strategy)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Runs a separate Cold Critic pass on your entire session to surface weaknesses in your prompting approach — without filtering for politeness.
          </p>
        </div>

        {selfAudit ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <MarkdownOutput content={selfAudit} />
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={handleRunSelfAudit}
            disabled={auditLoading}
            className="w-full"
          >
            {auditLoading ? (
              <span className="flex items-center gap-2">
                <SmallSpinner /> Running self-audit…
              </span>
            ) : (
              'Run Self-Audit'
            )}
          </Button>
        )}
      </div>

      <Separator />

      {/* Bottom actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={resetSession}
          className="w-full"
        >
          Start New Session
        </Button>
        <Button
          variant="outline"
          onClick={handleHardReset}
          disabled={hardResetLoading}
          className="w-full"
        >
          {hardResetLoading ? (
            <span className="flex items-center gap-2">
              <SmallSpinner /> Carrying lessons…
            </span>
          ) : (
            'Hard Reset (carry lessons forward)'
          )}
        </Button>
      </div>
    </div>
  );
}
