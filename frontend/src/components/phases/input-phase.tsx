'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { CONSTRAINT_PRESETS, AUDIENCE_OPTIONS } from '@/lib/constants';
import { ModeGrid } from '@/components/shared/mode-grid';
import { ConstraintPills } from '@/components/shared/constraint-pills';
import type { ModeType } from '@/types';

export function InputPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);

  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraintPresets = useSessionStore((s) => s.setConstraintPresets);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);
  const [negativeConstraints, setNegativeConstraints] = useState('');

  function handleTogglePreset(preset: string) {
    if (constraintPresets.includes(preset)) {
      setConstraintPresets(constraintPresets.filter((p) => p !== preset));
    } else {
      setConstraintPresets([...constraintPresets, preset]);
    }
  }

  async function handleAssemble() {
    if (!objective.trim()) {
      setError('Please enter an objective before assembling.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const joinedConstraints = [
        ...constraintPresets,
        ...(negativeConstraints.trim() ? [negativeConstraints.trim()] : []),
      ].join('. ');

      const result = await api.buildPrompt({
        objective,
        audience,
        constraints: joinedConstraints || constraints,
        output_format: outputFormat,
        mode,
      });
      setConstraints(joinedConstraints || constraints);
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
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-display">Prompt Configuration</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Define the persona, objective, and structural constraints for your high-precision AI output.
        </p>
      </div>

      {/* Mode Grid section */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Select Engine Mode
        </h2>
        <ModeGrid selectedMode={mode} onSelect={(m: ModeType) => setMode(m)} />
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
          <select
            id="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-4 py-3 text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow appearance-none"
          >
            {AUDIENCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
          onToggle={handleTogglePreset}
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
          value={negativeConstraints}
          onChange={(e) => setNegativeConstraints(e.target.value)}
          placeholder="Any additional constraints, restrictions, or requirements not covered above..."
          className="w-full min-h-[100px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
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
