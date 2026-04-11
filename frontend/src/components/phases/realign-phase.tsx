'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { recordUsage } from '@/lib/supabase/usage';
import type { PMInput } from '@/types';

export function RealignPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const systemPrompt = useSessionStore((s) => s.systemPrompt);
  const iterations = useSessionStore((s) => s.iterations);
  const realignmentPrompt = useSessionStore((s) => s.realignmentPrompt);

  const setPhase = useSessionStore((s) => s.setPhase);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const appendIteration = useSessionStore((s) => s.appendIteration);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(realignmentPrompt ?? '');

  async function handleExecute() {
    setError(null);
    setLoading(true);

    try {
      const inputs: PMInput = {
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

      const result = await api.runIteration({
        inputs,
        prompt_text: localPrompt,
        system_text: systemPrompt,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        source: 'realignment',
        model,
      });

      appendIteration(result.iteration, result.suggestions);
      recordUsage('realignment').catch(() => {});
      setRealignmentPrompt(null);
      setPhase('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute realignment.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setRealignmentPrompt(localPrompt);
    setPhase('output');
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <section className="mb-12">
        <h2
          className="text-on-surface mb-2 font-semibold leading-tight"
          style={{ fontSize: '2.75rem', letterSpacing: '-0.04em' }}
        >
          Realignment
        </h2>
        <p className="text-sm leading-[1.6] text-[var(--on-surface-variant)]">
          Fine-tune the trajectory of the AI&apos;s logic to eliminate semantic drift and ensure output fidelity.
        </p>
      </section>

      {/* Info Banner */}
      <div className="mb-10 flex items-start gap-4 rounded-xl bg-[var(--surface-container-low)] p-6">
        <div className="rounded-lg bg-blue-100 p-2">
          <span className="material-symbols-outlined text-[var(--pm-primary)]">info</span>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--on-surface)]">
            Why Realignment is Needed
          </h3>
          <p className="text-sm leading-[1.6] text-[var(--on-surface-variant)]">
            The current output shows signs of semantic drift. Realignment allows you to correct
            clarity, adjust tone, or refocus the AI on the original constraints if it has begun to
            prioritize creative variance over technical accuracy.
          </p>
        </div>
      </div>

      {/* Corrective Prompt Workspace */}
      <div className="rounded-xl bg-white p-8 shadow-ambient">
        {/* Header row */}
        <div className="mb-6 flex items-center justify-between">
          <label className="text-sm font-medium tracking-[-0.01em] text-[var(--on-surface)]">
            Corrective Prompt
          </label>
          <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-container)] px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-[var(--pm-primary)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
              Active Pivot
            </span>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          disabled={loading}
          placeholder="Type your corrective instructions here..."
          className="w-full min-h-[320px] p-6 bg-[var(--surface-container-low)] border-none rounded-xl text-sm leading-[1.6] text-[var(--on-surface)] placeholder:text-[var(--outline)] focus:outline-none focus:ring-0 resize-y transition-all focus:bg-white"
        />
      </div>

      {/* Actions Row */}
      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[var(--outline-variant)] border-opacity-30 px-6 py-2.5 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)] disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Output
        </button>

        <button
          onClick={handleExecute}
          disabled={loading || !localPrompt.trim()}
          className="flex items-center gap-2 rounded-lg bg-[var(--pm-primary)] px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Executing…' : 'Execute Realignment'}
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
        </button>
      </div>
    </div>
  );
}
