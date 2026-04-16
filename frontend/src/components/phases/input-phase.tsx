'use client';

import { useState, useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { CONSTRAINT_PRESETS, FORMAT_PRESETS, AUDIENCE_OPTIONS, EXAMPLES, PROMPT_STACKS, type PromptStack } from '@/lib/constants';
import { ModeGrid } from '@/components/shared/mode-grid';
import { ConstraintPills } from '@/components/shared/constraint-pills';
import { CustomSelect } from '@/components/shared/custom-select';
import { useAuth } from '@/hooks/use-auth';
import { saveTemplate } from '@/lib/supabase/templates';
import {
  listPresets,
  addPreset,
  deletePreset,
  listLocalPresets,
  addLocalPreset,
  removeLocalPreset,
} from '@/lib/supabase/presets';
import type { ModeType, PromptTemplate } from '@/types';

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
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const activeStackId = useSessionStore((s) => s.activeStackId);
  const setActiveStack = useSessionStore((s) => s.setActiveStack);

  const customConstraintPresets = useSessionStore((s) => s.customConstraintPresets);
  const customFormatPresets = useSessionStore((s) => s.customFormatPresets);
  const setCustomConstraintPresets = useSessionStore((s) => s.setCustomConstraintPresets);
  const setCustomFormatPresets = useSessionStore((s) => s.setCustomFormatPresets);
  const addCustomConstraintPreset = useSessionStore((s) => s.addCustomConstraintPreset);
  const removeCustomConstraintPreset = useSessionStore((s) => s.removeCustomConstraintPreset);
  const addCustomFormatPreset = useSessionStore((s) => s.addCustomFormatPreset);
  const removeCustomFormatPreset = useSessionStore((s) => s.removeCustomFormatPreset);

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
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    async function loadCustomPresets() {
      if (user) {
        try {
          const presets = await listPresets();
          setCustomConstraintPresets(
            presets.filter((p) => p.type === 'constraint').map((p) => p.label)
          );
          setCustomFormatPresets(
            presets.filter((p) => p.type === 'format').map((p) => p.label)
          );
        } catch {
          setCustomConstraintPresets(listLocalPresets('constraint'));
          setCustomFormatPresets(listLocalPresets('format'));
        }
      } else {
        setCustomConstraintPresets(listLocalPresets('constraint'));
        setCustomFormatPresets(listLocalPresets('format'));
      }
    }
    loadCustomPresets();
  }, [user, setCustomConstraintPresets, setCustomFormatPresets]);

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

  function handlePickStack(stack: PromptStack) {
    setActiveStack(stack.id);
    setMode(stack.initial.mode);
    // Only overwrite objective if empty (don't clobber user's work)
    if (!objective.trim()) {
      setObjective(stack.initial.objective_placeholder);
    }
    setConstraints(stack.initial.constraints);
    setOutputFormat(stack.initial.output_format);
  }

  function handleFillExample(example: (typeof EXAMPLES)[number]) {
    setObjective(example.objective);
    setAudience(example.audience);
    setConstraints(example.constraints);
    setMode(example.mode);
  }

  async function handleAddCustomConstraint(label: string) {
    addCustomConstraintPreset(label);
    if (user) {
      try { await addPreset('constraint', label, user.id); } catch { /* stored in store already */ }
    } else {
      addLocalPreset('constraint', label);
    }
  }

  async function handleRemoveCustomConstraint(label: string) {
    removeCustomConstraintPreset(label);
    if (user) {
      try {
        const presets = await listPresets('constraint');
        const preset = presets.find((p) => p.label === label);
        if (preset) await deletePreset(preset.id);
      } catch { /* already removed from store */ }
    } else {
      removeLocalPreset('constraint', label);
    }
  }

  async function handleAddCustomFormat(label: string) {
    addCustomFormatPreset(label);
    if (user) {
      try { await addPreset('format', label, user.id); } catch { /* stored in store already */ }
    } else {
      addLocalPreset('format', label);
    }
  }

  async function handleRemoveCustomFormat(label: string) {
    removeCustomFormatPreset(label);
    if (user) {
      try {
        const presets = await listPresets('format');
        const preset = presets.find((p) => p.label === label);
        if (preset) await deletePreset(preset.id);
      } catch { /* already removed from store */ }
    } else {
      removeLocalPreset('format', label);
    }
  }

  const activeStack = activeStackId ? PROMPT_STACKS.find((s) => s.id === activeStackId) : null;

  async function handleSaveTemplate() {
    if (!user || !templateName.trim()) return;
    setTemplateSaving(true);
    try {
      const template: PromptTemplate = {
        template_id: crypto.randomUUID().slice(0, 8),
        name: templateName.trim(),
        created_at: new Date().toISOString(),
        mode,
        audience,
        constraints,
        output_format: outputFormat,
        objective_hint: objective,
        custom_name: customName,
        custom_preamble: customPreamble,
        custom_tone: customTone,
      };
      await saveTemplate(template, user.id);
      setTemplateSaved(true);
      setTemplateName('');
      setTimeout(() => setTemplateSaved(false), 3000);
    } catch {
      // Silently fail — non-blocking
    } finally {
      setTemplateSaving(false);
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
        session_facts: sessionFacts,
        ...(mode === 'custom' ? {
          custom_name: customName,
          custom_preamble: customPreamble,
          custom_tone: customTone,
        } : {}),
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
            Welcome to PromptMaster
          </h2>
          <ol className="text-sm text-[var(--on-surface-variant)] space-y-1 mb-4 list-none">
            <li>1. Choose a mode — define how the AI approaches the task</li>
            <li>2. Describe your objective — what outcome are you trying to achieve?</li>
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
        <h1 className="text-display">Define Your Request</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Set your objective, constraints, and perspective to guide the AI's response.
        </p>
        <p className="text-xs text-[var(--on-surface-variant)] italic mb-4">
          PromptMaster guides the AI's thinking using structured roles, constraints, and iterative refinement.
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

      {/* Prompt Stacks */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
              Prompt Stacks
            </h2>
            <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
              Multi-step workflows for common tasks. Pick one to prefill your setup and see the planned steps.
            </p>
          </div>
          {activeStack && (
            <button
              type="button"
              onClick={() => setActiveStack(null)}
              className="text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
            >
              Clear stack
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {PROMPT_STACKS.map((stack) => {
            const isActive = stack.id === activeStackId;
            return (
              <button
                key={stack.id}
                type="button"
                onClick={() => handlePickStack(stack)}
                className={`px-3 py-3 text-left rounded-lg border transition-all ${
                  isActive
                    ? 'bg-[var(--pm-primary)]/10 border-[var(--pm-primary)] ring-1 ring-[var(--pm-primary)]'
                    : 'bg-white border-[var(--outline-variant)]/20 hover:bg-[var(--surface-container-high)]'
                }`}
              >
                <div className="text-xs font-bold text-[var(--on-surface)]">{stack.name}</div>
                <div className="text-[10px] text-[var(--on-surface-variant)] mt-0.5 leading-snug">
                  {stack.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Stack Guide */}
        {activeStack && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--pm-primary)] text-[18px]">layers</span>
              <h3 className="text-sm font-bold text-[var(--on-surface)]">
                {activeStack.name} — Planned Steps
              </h3>
            </div>
            <ol className="space-y-2">
              {activeStack.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--pm-primary)] text-white text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-[var(--on-surface)]">
                      {step.label}
                    </div>
                    <div className="text-[11px] text-[var(--on-surface-variant)] leading-relaxed mt-0.5">
                      {step.hint}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-[var(--on-surface-variant)] italic pt-1">
              The stack guide will stay visible as you iterate — use it as a roadmap.
            </p>
          </div>
        )}
      </div>

      {/* Mode Grid section */}
      <div className="space-y-4" data-tutorial="mode-grid">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Choose a Mode
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Objective textarea — 2/3 */}
        <div className="col-span-2 space-y-2" data-tutorial="objective">
          <label
            htmlFor="objective"
            className="text-sm font-semibold text-[var(--on-surface)]"
          >
            Objective <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-[var(--on-surface-variant)]">
            What are you trying to accomplish or figure out?
          </p>
          <textarea
            id="objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Describe what you want to achieve. Be specific about the outcome, scope, and key constraints..."
            className="w-full min-h-[160px] resize-none bg-white rounded-xl shadow-ambient border border-[var(--outline-variant)] px-5 py-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
          />
        </div>

        {/* Audience — 1/3 */}
        <div className="space-y-2" data-tutorial="audience">
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
      <div className="space-y-4" data-tutorial="constraint-presets">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Preset Constraints
        </h2>
        <ConstraintPills
          presets={CONSTRAINT_PRESETS}
          selected={constraintPresets}
          onToggle={handleToggleConstraintPreset}
          customPresets={customConstraintPresets}
          onAddCustom={handleAddCustomConstraint}
          onRemoveCustom={handleRemoveCustomConstraint}
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
      <div className="space-y-4" data-tutorial="format-presets">
        <h2 className="text-sm font-semibold text-[var(--on-surface)] uppercase tracking-widest">
          Output Format Presets
        </h2>
        <ConstraintPills
          presets={FORMAT_PRESETS}
          selected={formatPresets}
          onToggle={handleToggleFormatPreset}
          customPresets={customFormatPresets}
          onAddCustom={handleAddCustomFormat}
          onRemoveCustom={handleRemoveCustomFormat}
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

      {/* Save as Template */}
      {user && (
        <details className="rounded-xl border border-[var(--outline-variant)]/30 bg-white overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]">bookmark_add</span>
              <span className="text-sm font-semibold text-[var(--on-surface)]">Save as Template</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-[var(--on-surface-variant)]">
              Save the current configuration as a reusable template.
            </p>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name…"
                className="flex-1 bg-[var(--surface-container-low)] rounded-lg border border-[var(--outline-variant)]/30 px-4 py-2.5 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)] transition-shadow"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={templateSaving || !templateName.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {templateSaved ? 'check' : 'save'}
                </span>
                {templateSaving ? 'Saving…' : templateSaved ? 'Saved!' : 'Save Template'}
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Footer CTA */}
      <div className="pt-2" data-tutorial="assemble-btn">
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
