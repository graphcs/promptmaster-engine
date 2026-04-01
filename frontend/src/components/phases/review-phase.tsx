'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { recordUsage } from '@/lib/supabase/usage';

export function ReviewPhase() {
  const assembled = useSessionStore((s) => s.assembled);
  const promptEdited = useSessionStore((s) => s.promptEdited);
  const systemPrompt = useSessionStore((s) => s.systemPrompt);
  const showScaffolding = useSessionStore((s) => s.showScaffolding);
  const iterations = useSessionStore((s) => s.iterations);
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);

  const setPromptEdited = useSessionStore((s) => s.setPromptEdited);
  const setShowScaffolding = useSessionStore((s) => s.setShowScaffolding);
  const appendIteration = useSessionStore((s) => s.appendIteration);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);

  async function handleExecute() {
    setError(null);
    setLoading(true);

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

      const result = await api.runIteration({
        inputs,
        prompt_text: promptEdited,
        system_text: systemPrompt,
        iteration_number: iterations.length + 1,
        model,
      });

      appendIteration(result.iteration, result.suggestions);
      recordUsage('iteration').catch(() => {});
      setPhase('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run iteration.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-display">Review Phase</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Fine-tune the generated instructions and system parameters before executing the final request.
        </p>
      </div>

      {/* System Prompt — collapsible card */}
      <details className="bg-white rounded-xl shadow-ambient overflow-hidden group">
        <summary className="flex items-center justify-between px-6 py-5 cursor-pointer select-none list-none">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              lock
            </span>
            <span className="text-sm font-semibold text-[var(--on-surface)]">System Prompt</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[var(--surface-container-low)] text-[var(--on-surface-variant)]">
              READ-ONLY
            </span>
          </div>
          <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] transition-transform group-open:rotate-180">
            expand_more
          </span>
        </summary>
        <div className="px-6 pb-6">
          <div className="bg-[var(--surface-container-low)] rounded-lg p-4 font-mono text-[13px] text-[var(--on-surface-variant)] whitespace-pre-wrap leading-relaxed">
            {systemPrompt}
          </div>
        </div>
      </details>

      {/* User Prompt editor */}
      <div className="bg-white rounded-xl shadow-ambient p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label
            htmlFor="user-prompt"
            className="text-sm font-semibold text-[var(--on-surface)]"
          >
            Assembled User Prompt
          </label>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700">
            Manual Edit Mode
          </span>
        </div>
        <textarea
          id="user-prompt"
          value={promptEdited}
          onChange={(e) => setPromptEdited(e.target.value)}
          className="w-full min-h-[320px] resize-none bg-[var(--surface-container-low)] rounded-lg p-4 font-mono text-[13px] text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
        />
      </div>

      {/* Scaffolding toggle */}
      {assembled?.scaffolding_notes && (
        <div className="bg-white rounded-xl shadow-ambient p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-[var(--on-surface)]">
                Internal Scaffolding
              </div>
              <div className="text-xs text-[var(--on-surface-variant)]">
                Backend-only instructions guiding AI behavior
              </div>
            </div>
            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={showScaffolding}
              onClick={() => setShowScaffolding(!showScaffolding)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] ${
                showScaffolding ? 'bg-[var(--pm-primary)]' : 'bg-[var(--outline-variant)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  showScaffolding ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {showScaffolding && (
            <div className="bg-[var(--surface-container-low)] rounded-lg p-4 font-mono text-[13px] text-[var(--on-surface-variant)] whitespace-pre-wrap leading-relaxed">
              {assembled.scaffolding_notes}
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={() => setPhase('input')}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 border border-[var(--outline-variant)] bg-white text-sm font-semibold text-[var(--on-surface)] rounded-xl hover:bg-[var(--surface-container-low)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Input
        </button>
        <button
          type="button"
          onClick={handleExecute}
          disabled={loading || !promptEdited.trim()}
          className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Executing…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">electric_bolt</span>
              Execute
            </>
          )}
        </button>
      </div>
    </div>
  );
}
