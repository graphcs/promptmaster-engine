'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import type { PromptStack } from '@/lib/constants';
import { HeroZone } from '@/components/input/hero-zone';
import { TemplatesRow } from '@/components/input/templates-row';
import { SetupSummaryBar } from '@/components/input/setup-summary-bar';
import { AdvancedSection } from '@/components/input/advanced-section';

export function InputPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);
  const formatPresets = useSessionStore((s) => s.formatPresets);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const model = useSessionStore((s) => s.model);

  const setupSuggestion = useSessionStore((s) => s.setupSuggestion);
  const setupLoading = useSessionStore((s) => s.setupLoading);
  const setupError = useSessionStore((s) => s.setupError);

  const setObjective = useSessionStore((s) => s.setObjective);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setActiveStack = useSessionStore((s) => s.setActiveStack);
  const setSetupLoading = useSessionStore((s) => s.setSetupLoading);
  const setSetupError = useSessionStore((s) => s.setSetupError);
  const applySetupSuggestion = useSessionStore((s) => s.applySetupSuggestion);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [assembling, setAssembling] = useState(false);

  async function handleGenerateSetup() {
    if (!objective.trim()) return;
    setSetupError(null);
    setSetupLoading(true);
    try {
      const { suggestion } = await api.generateSetup({ objective, model });
      applySetupSuggestion(suggestion);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not generate a setup.');
    } finally {
      setSetupLoading(false);
    }
  }

  function handleSelectStack(stack: PromptStack) {
    setMode(stack.initial.mode);
    if (!objective.trim()) {
      setObjective(stack.initial.objective_placeholder);
    }
    setConstraints(stack.initial.constraints);
    setOutputFormat(stack.initial.output_format);
    setActiveStack(stack.id);
    // Show the summary bar with empty rationales so user can see and refine the pre-fill
    applySetupSuggestion({
      mode: stack.initial.mode,
      audience,
      constraints: stack.initial.constraints,
      output_format: stack.initial.output_format,
      rationale: { mode: '', audience: '', constraints: '', output_format: '' },
    });
  }

  async function handleAssemble() {
    if (!objective.trim()) return;
    setError(null);
    setAssembling(true);
    try {
      const parts = [...constraintPresets];
      if (constraints.trim()) parts.push(constraints.trim());
      const finalConstraints = parts.join('. ');

      const fmtParts = [...formatPresets];
      if (outputFormat.trim()) fmtParts.push(outputFormat.trim());
      const finalFormat = fmtParts.join(', ');

      const inputs = {
        objective,
        audience,
        constraints: finalConstraints,
        output_format: finalFormat,
        mode,
        session_facts: sessionFacts,
        ...(mode === 'custom' ? {
          custom_name: customName,
          custom_preamble: customPreamble,
          custom_tone: customTone,
        } : {}),
      };
      const assembled = await api.buildPrompt(inputs);
      setAssembled(assembled);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build prompt.');
    } finally {
      setAssembling(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero zone — primary entry */}
      <HeroZone
        objective={objective}
        onObjectiveChange={setObjective}
        onGenerateSetup={handleGenerateSetup}
        loading={setupLoading}
      />

      {/* Error banner if Generate Setup failed */}
      {setupError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          {setupError} Open Advanced below to set it up manually.
        </div>
      )}

      {/* Setup summary bar — appears after Generate Setup runs */}
      {setupSuggestion && <SetupSummaryBar suggestion={setupSuggestion} />}

      {/* Templates — secondary entry */}
      <TemplatesRow onSelectStack={handleSelectStack} />

      {/* Advanced controls — collapsed by default */}
      <AdvancedSection />

      {/* Continue to Review */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleAssemble}
          disabled={assembling || !objective.trim()}
          className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {assembling ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Building…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              Continue to Review
            </>
          )}
        </button>
      </div>
    </div>
  );
}
