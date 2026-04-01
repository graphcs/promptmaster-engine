'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { needsRealignment, downloadFile } from '@/lib/utils';
import { EvalSection } from '@/components/shared/eval-section';
import { SuggestionsList } from '@/components/shared/suggestions-list';
import { MODE_DISPLAY } from '@/lib/constants';
import type { ModeType, ScoreLevel } from '@/types';
import { MarkdownOutput } from '@/components/shared/markdown-output';
import { CustomSelect } from '@/components/shared/custom-select';

function scoreBadgeClass(dim: string, score: ScoreLevel): string {
  const isDrift = dim === 'drift';
  const isGood = isDrift ? score === 'Low' : score === 'High';
  const isBad = isDrift ? score === 'High' : score === 'Low';
  if (isGood) return 'bg-emerald-100 text-emerald-800';
  if (isBad) return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

export function OutputPhase() {
  const iterations = useSessionStore((s) => s.iterations);
  const currentOutput = useSessionStore((s) => s.currentOutput);
  const currentEval = useSessionStore((s) => s.currentEval);
  const suggestions = useSessionStore((s) => s.suggestions);
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);

  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);
  const setMode = useSessionStore((s) => s.setMode);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const finalize = useSessionStore((s) => s.finalize);

  const [realignLoading, setRealignLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({});

  const shouldRealign = currentEval ? needsRealignment(currentEval) : false;

  async function handleGenerateRealignment() {
    if (!currentEval) return;
    setError(null);
    setRealignLoading(true);

    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
        ...(mode === 'custom' ? {
          custom_name: customName,
          custom_preamble: customPreamble,
          custom_tone: customTone,
        } : {}),
      };

      const result = await api.buildRealignment({ inputs, evaluation: currentEval, model });
      setRealignmentPrompt(result.realignment_prompt);
      setPhase('realign');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build realignment prompt.');
    } finally {
      setRealignLoading(false);
    }
  }

  async function handleRefinePrompt() {
    setError(null);
    setRefineLoading(true);

    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
        ...(mode === 'custom' ? {
          custom_name: customName,
          custom_preamble: customPreamble,
          custom_tone: customTone,
        } : {}),
      };

      const result = await api.buildPrompt(inputs);
      setMode(mode);
      setAssembled(result);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild prompt.');
    } finally {
      setRefineLoading(false);
    }
  }

  async function handleCopy() {
    if (!currentOutput) return;
    try {
      await navigator.clipboard.writeText(currentOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  function toggleIteration(num: number) {
    setExpandedIterations((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  const anyLoading = realignLoading || refineLoading;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-display">Output &amp; Evaluation</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Assess the generated response and verify alignment with your initial parameters.
        </p>
      </div>

      {/* AI Output card */}
      <div className="bg-white rounded-xl shadow-ambient p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            Generated Output
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              title="Copy to clipboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        {currentOutput ? (
          <MarkdownOutput content={currentOutput} />
        ) : (
          <p className="text-sm text-[var(--on-surface-variant)] italic">No output available.</p>
        )}
      </div>

      {/* Mode switch for next iteration */}
      <div className="bg-white rounded-xl shadow-ambient p-6">
        <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
          Mode for next iteration:
        </label>
        <CustomSelect
          value={mode}
          onChange={(v) => setMode(v as ModeType)}
          options={(Object.entries(MODE_DISPLAY) as Array<[ModeType, { display_name: string; tagline: string }]>).map(
            ([key, info]) => ({
              value: key,
              label: `${info.display_name} — ${info.tagline}`,
            })
          )}
        />
      </div>

      {/* Evaluation section */}
      {currentEval && <EvalSection evaluation={currentEval} />}

      {/* Suggestions */}
      {suggestions.length > 0 && <SuggestionsList suggestions={suggestions} />}

      {/* Evaluator callout caption */}
      <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-3">
        These scores come from a separate evaluator — a second AI call that independently checks the output against
        your original objective, not the AI grading itself.
      </p>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleRefinePrompt}
          disabled={anyLoading}
          className="flex items-center gap-2 px-6 py-3 border border-[var(--outline-variant)] bg-white text-sm font-semibold text-[var(--on-surface)] rounded-xl hover:bg-[var(--surface-container-low)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refineLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
              Rebuilding…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">tune</span>
              Refine Prompt
            </>
          )}
        </button>

        {/* Download current output */}
        <button
          type="button"
          onClick={() =>
            downloadFile(
              currentOutput || '',
              `promptmaster_iteration_${iterations.length}.txt`
            )
          }
          className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--outline-variant)]/30 hover:bg-[var(--surface-container-low)] transition-all"
          title="Download output"
        >
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]">download</span>
        </button>

        {shouldRealign ? (
          <button
            type="button"
            onClick={handleGenerateRealignment}
            disabled={anyLoading}
            className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {realignLoading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                Generate Realignment
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={finalize}
            disabled={anyLoading}
            className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Finalize Session
          </button>
        )}
      </div>

      {/* Iteration history (2+ iterations) */}
      {iterations.length >= 2 && (
        <details className="bg-white rounded-xl shadow-ambient overflow-hidden">
          <summary className="cursor-pointer px-8 py-5 text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] select-none hover:bg-[var(--surface-container-low)] transition-colors">
            Iteration History ({iterations.length} iterations)
          </summary>
          <div className="divide-y divide-[var(--outline-variant)]/20">
            {iterations.map((iter) => {
              const modeLabel = MODE_DISPLAY[iter.mode]?.display_name ?? iter.mode;
              const isExpanded = !!expandedIterations[iter.iteration_number];
              return (
                <div key={iter.iteration_number} className="px-8 py-5">
                  {/* Iteration header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[var(--on-surface)]">
                      Iteration {iter.iteration_number} ({modeLabel})
                    </span>
                    {iter.evaluation && (
                      <div className="flex items-center gap-2">
                        {(['alignment', 'drift', 'clarity'] as const).map((dim) => {
                          const score = iter.evaluation![dim].score;
                          return (
                            <span
                              key={dim}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${scoreBadgeClass(dim, score)}`}
                            >
                              {dim}: {score}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expandable output */}
                  <button
                    type="button"
                    onClick={() => toggleIteration(iter.iteration_number)}
                    className="flex items-center gap-1.5 text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors mb-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                    {isExpanded ? 'Hide output' : 'Show output'}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 p-4 bg-[var(--surface-container-low)] rounded-lg">
                      <MarkdownOutput content={iter.output} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
