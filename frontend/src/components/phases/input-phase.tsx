'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { CONSTRAINT_PRESETS, FORMAT_PRESETS, AUDIENCE_OPTIONS, EXAMPLES } from '@/lib/constants';
import { ModeGrid } from '@/components/shared/mode-grid';
import { ConstraintPills } from '@/components/shared/constraint-pills';
import { CustomSelect } from '@/components/shared/custom-select';
import type { ModeType } from '@/types';

export function InputPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);
  const formatPresets = useSessionStore((s) => s.formatPresets);
  const onboardingSeen = useSessionStore((s) => s.onboardingSeen);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);

  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraintPresets = useSessionStore((s) => s.setConstraintPresets);
  const setFormatPresets = useSessionStore((s) => s.setFormatPresets);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);
  const setOnboardingSeen = useSessionStore((s) => s.setOnboardingSeen);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);
  const [customAudience, setCustomAudience] = useState('');

  function handleToggleConstraintPreset(preset: string) {
    if (constraintPresets.includes(preset)) {
      setConstraintPresets(constraintPresets.filter((p) => p !== preset));
    } else {
      setConstraintPresets([...constraintPresets, preset]);
    }
  }

  function handleToggleFormatPreset(preset: string) {
    if (formatPresets.includes(preset)) {
      setFormatPresets(formatPresets.filter((p) => p !== preset));
    } else {
      setFormatPresets([...formatPresets, preset]);
    }
  }

  function handleFillExample(example: (typeof EXAMPLES)[number]) {
    setObjective(example.objective);
    setAudience(example.audience);
    setConstraints(example.constraints);
    setMode(example.mode);
  }

  async function handleAssemble() {
    if (!objective.trim()) {
      setError('Please enter an objective before assembling.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const effectiveAudience = audience === 'Other' ? customAudience || 'Other' : audience;

      // Combine preset chips + free-text constraints
      const parts = [...constraintPresets];
      if (constraints.trim()) parts.push(constraints.trim());
      const finalConstraints = parts.join('. ');

      // Combine format preset chips + free-text format
      const fmtParts = [...formatPresets];
      if (outputFormat.trim()) fmtParts.push(outputFormat.trim());
      const finalFormat = fmtParts.join(', ');

      const result = await api.buildPrompt({
        objective,
        audience: effectiveAudience,
        constraints: finalConstraints,
        output_format: finalFormat,
        mode,
      });
      setAssembled(result);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assemble prompt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* Onboarding panel */}
      {!onboardingSeen && (
        <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100">
          <h2 className="text-sm font-semibold text-[var(--on-surface)] mb-3">
            Welcome to PromptMaster Engine
          </h2>
          <ol className="text-sm text-[var(--on-surface-variant)] space-y-1 mb-4 list-none">
            <li>1. Pick a mode — choose how the AI should think</li>
            <li>2. Describe your objective — what do you want the AI to produce?</li>
            <li>3. Click Assemble Prompt — the system builds an optimized prompt</li>
          </ol>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                handleFillExample(EXAMPLES[0]);
                setOnboardingSeen(true);
              }}
              className="px-4 py-2 bg-[var(--pm-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all"
            >
              Try an example
            </button>
            <button
              type="button"
              onClick={() => setOnboardingSeen(true)}
              className="px-4 py-2 bg-white text-[var(--on-surface-variant)] text-xs font-medium rounded-lg border border-[var(--outline-variant)] hover:bg-[var(--surface-container-high)] transition-all"
            >
              Got it, let me start
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-display">Prompt Configuration</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Define the persona, objective, and structural constraints for your high-precision AI output.
        </p>
        <p className="text-xs text-[var(--on-surface-variant)] italic mb-4">
          PromptMaster structures your request with mode locking, anchoring, and invisible scaffolding — techniques from the PromptMaster™ methodology.
        </p>
      </div>

      {/* Example quick-fill buttons */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-[var(--on-surface-variant)]">
          Start with an example (click any to auto-fill):
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => handleFillExample(example)}
              className="px-3 py-2 bg-white text-[var(--on-surface-variant)] text-xs font-medium rounded-lg hover:bg-[var(--surface-container-high)] transition-all border border-[var(--outline-variant)]/20 text-left"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Grid section */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Select Engine Mode
        </h2>
        <ModeGrid selectedMode={mode} onSelect={(m: ModeType) => setMode(m)} />

        {/* Custom mode fields */}
        {mode === 'custom' && (
          <div className="bg-blue-50/50 p-5 rounded-xl border-l-4 border-[var(--pm-primary)] space-y-4">
            <div className="text-xs font-bold text-[var(--pm-primary)] tracking-widest uppercase">
              Configure Custom Mode
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--on-surface)]">Mode Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomMode(e.target.value, customPreamble, customTone)}
                placeholder="e.g. Strategist, Mentor, Devil's Advocate…"
                className="w-full bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--on-surface)]">Tone</label>
              <input
                type="text"
                value={customTone}
                onChange={(e) => setCustomMode(customName, customPreamble, e.target.value)}
                placeholder="e.g. Direct and concise, Warm and encouraging…"
                className="w-full bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--on-surface)]">
                Persona / System Preamble
              </label>
              <textarea
                value={customPreamble}
                onChange={(e) => setCustomMode(customName, e.target.value, customTone)}
                placeholder="Describe the persona and system-level instructions for this mode…"
                className="w-full min-h-[100px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
              />
            </div>
          </div>
        )}
      </div>

      {/* Objective + Audience — 3 col grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Objective textarea — 2/3 */}
        <div className="col-span-2 space-y-2">
          <label
            htmlFor="objective"
            className="text-sm font-semibold text-[var(--on-surface)]"
          >
            Objective <span className="text-red-500">*</span>
          </label>
          <textarea
            id="objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Describe what you want to achieve. Be specific about the outcome, scope, and key constraints..."
            className="w-full min-h-[160px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
          />
        </div>

        {/* Audience — 1/3 */}
        <div className="space-y-2">
          <label
            htmlFor="audience"
            className="text-sm font-semibold text-[var(--on-surface)]"
          >
            Target Audience
          </label>
          <CustomSelect
            value={audience}
            onChange={(v) => setAudience(v)}
            options={AUDIENCE_OPTIONS.map((o) => ({ value: o, label: o }))}
            placeholder="Select audience"
          />

          {audience === 'Other' && (
            <input
              type="text"
              value={customAudience}
              onChange={(e) => setCustomAudience(e.target.value)}
              placeholder="Describe your audience…"
              className="w-full bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
            />
          )}

          <div className="bg-[var(--surface-container-low)] rounded-xl p-4 mt-2 space-y-1">
            <div className="text-xs font-semibold text-[var(--on-surface)] uppercase tracking-widest">
              Audience Signal
            </div>
            <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
              {audience === 'Technical'
                ? 'Expects precision, domain terminology, and implementation detail.'
                : audience === 'Executive'
                  ? 'Prefers concise, decision-focused summaries with clear recommendations.'
                  : audience === 'Academic'
                    ? 'Expects rigorous sourcing, nuanced argument, and formal tone.'
                    : audience === 'Student'
                      ? 'Benefits from analogies, step-by-step explanations, and plain language.'
                      : audience === 'Other'
                        ? 'Custom audience — tailor your description to match their context.'
                        : 'Balanced tone, clear language, broadly accessible.'}
            </p>
          </div>
        </div>
      </div>

      {/* Preset Constraints */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Preset Constraints
        </h2>
        <ConstraintPills
          presets={CONSTRAINT_PRESETS}
          selected={constraintPresets}
          onToggle={handleToggleConstraintPreset}
        />
      </div>

      {/* Negative Constraints */}
      <div className="space-y-2">
        <label
          htmlFor="negative-constraints"
          className="text-sm font-semibold text-[var(--on-surface)]"
        >
          Additional Constraints
        </label>
        <textarea
          id="negative-constraints"
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder="Any additional constraints, restrictions, or requirements not covered above..."
          className="w-full min-h-[100px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
        />
      </div>

      {/* Output Format Presets */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Output Format Presets
        </h2>
        <ConstraintPills
          presets={FORMAT_PRESETS}
          selected={formatPresets}
          onToggle={handleToggleFormatPreset}
        />
      </div>

      {/* Output Format */}
      <div className="space-y-2">
        <label
          htmlFor="output-format"
          className="text-sm font-semibold text-[var(--on-surface)]"
        >
          Output Format
        </label>
        <textarea
          id="output-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
          placeholder="Describe the desired format: bullet points, numbered list, narrative prose, table, step-by-step..."
          className="w-full min-h-[100px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
        />
      </div>

      {/* Footer CTA */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleAssemble}
          disabled={loading}
          className="flex items-center gap-2 px-8 py-4 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[18px]">bolt</span>
          {loading ? 'Assembling Prompt…' : 'Assemble Prompt'}
        </button>
      </div>
    </div>
  );
}
