'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { needsRealignment } from '@/lib/utils';
import { EvalSection } from '@/components/shared/eval-section';
import { SuggestionsList } from '@/components/shared/suggestions-list';
import ReactMarkdown from 'react-markdown';

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

  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);
  const setMode = useSessionStore((s) => s.setMode);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const finalize = useSessionStore((s) => s.finalize);

  const [realignLoading, setRealignLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
          <div className="prose prose-sm max-w-none text-[var(--on-surface)] leading-relaxed">
            <ReactMarkdown>{currentOutput}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-[var(--on-surface-variant)] italic">No output available.</p>
        )}
      </div>

      {/* Evaluation section */}
      {currentEval && <EvalSection evaluation={currentEval} />}

      {/* Suggestions */}
      {suggestions.length > 0 && <SuggestionsList suggestions={suggestions} />}

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
    </div>
  );
}
