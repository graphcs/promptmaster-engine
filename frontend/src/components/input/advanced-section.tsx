'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import {
  CONSTRAINT_PRESETS,
  FORMAT_PRESETS,
  AUDIENCE_OPTIONS,
  PROMPT_STACKS,
} from '@/lib/constants';
import { ModeGrid } from '@/components/shared/mode-grid';
import { ConstraintPills } from '@/components/shared/constraint-pills';
import { CustomSelect } from '@/components/shared/custom-select';
import { listPresets, listLocalPresets } from '@/lib/supabase/presets';
import { createClient } from '@/lib/supabase/client';

export function AdvancedSection() {
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);
  const formatPresets = useSessionStore((s) => s.formatPresets);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const activeStackId = useSessionStore((s) => s.activeStackId);

  const customConstraintPresets = useSessionStore((s) => s.customConstraintPresets);
  const customFormatPresets = useSessionStore((s) => s.customFormatPresets);

  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraintPresets = useSessionStore((s) => s.setConstraintPresets);
  const setFormatPresets = useSessionStore((s) => s.setFormatPresets);
  const setActiveStack = useSessionStore((s) => s.setActiveStack);
  const setCustomConstraintPresets = useSessionStore((s) => s.setCustomConstraintPresets);
  const setCustomFormatPresets = useSessionStore((s) => s.setCustomFormatPresets);
  const addCustomConstraintPreset = useSessionStore((s) => s.addCustomConstraintPreset);
  const removeCustomConstraintPreset = useSessionStore((s) => s.removeCustomConstraintPreset);
  const addCustomFormatPreset = useSessionStore((s) => s.addCustomFormatPreset);
  const removeCustomFormatPreset = useSessionStore((s) => s.removeCustomFormatPreset);
  const addSessionFact = useSessionStore((s) => s.addSessionFact);
  const removeSessionFact = useSessionStore((s) => s.removeSessionFact);

  const [newFact, setNewFact] = useState('');

  // Load custom presets on mount — same as existing input-phase
  useEffect(() => {
    async function loadCustomPresets() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const cp = await listPresets('constraint').catch(() => []);
        const fp = await listPresets('format').catch(() => []);
        setCustomConstraintPresets(cp.map((p) => p.label));
        setCustomFormatPresets(fp.map((p) => p.label));
      } else {
        setCustomConstraintPresets(listLocalPresets('constraint'));
        setCustomFormatPresets(listLocalPresets('format'));
      }
    }
    loadCustomPresets();
  }, [setCustomConstraintPresets, setCustomFormatPresets]);

  function toggleConstraintPreset(preset: string) {
    if (constraintPresets.includes(preset)) {
      setConstraintPresets(constraintPresets.filter((p) => p !== preset));
    } else {
      setConstraintPresets([...constraintPresets, preset]);
    }
  }

  function toggleFormatPreset(preset: string) {
    if (formatPresets.includes(preset)) {
      setFormatPresets(formatPresets.filter((p) => p !== preset));
    } else {
      setFormatPresets([...formatPresets, preset]);
    }
  }

  async function handleAddCustomConstraint(label: string) {
    addCustomConstraintPreset(label);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { addPreset } = await import('@/lib/supabase/presets');
      await addPreset('constraint', label, user.id).catch(() => {});
    } else {
      const { addLocalPreset } = await import('@/lib/supabase/presets');
      addLocalPreset('constraint', label);
    }
  }

  async function handleAddCustomFormat(label: string) {
    addCustomFormatPreset(label);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { addPreset } = await import('@/lib/supabase/presets');
      await addPreset('format', label, user.id).catch(() => {});
    } else {
      const { addLocalPreset } = await import('@/lib/supabase/presets');
      addLocalPreset('format', label);
    }
  }

  function addFact() {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    addSessionFact(trimmed);
    setNewFact('');
  }

  return (
    <details className="bg-white rounded-2xl shadow-ambient overflow-hidden group">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-widest text-[var(--on-surface-variant)] select-none hover:bg-[var(--surface-container-low)] transition-colors flex items-center justify-between">
        <span>Advanced</span>
        <span className="material-symbols-outlined text-[18px] group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-6 space-y-8 border-t border-[var(--outline-variant)]/20">

        {/* Stack picker */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Stack</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveStack(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeStackId === null
                  ? 'bg-[var(--pm-primary)] text-white'
                  : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]'
              }`}
            >
              No stack
            </button>
            {PROMPT_STACKS.map((stack) => (
              <button
                key={stack.id}
                type="button"
                onClick={() => setActiveStack(stack.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeStackId === stack.id
                    ? 'bg-[var(--pm-primary)] text-white'
                    : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]'
                }`}
              >
                {stack.name.replace(/ Stack$/, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Mode</h3>
          <ModeGrid selectedMode={mode} onSelect={setMode} />
        </div>

        {/* Audience */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Audience</h3>
          <CustomSelect
            value={audience}
            onChange={setAudience}
            options={AUDIENCE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </div>

        {/* Constraints */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Constraints</h3>
          <ConstraintPills
            presets={CONSTRAINT_PRESETS}
            selected={constraintPresets}
            onToggle={toggleConstraintPreset}
            customPresets={customConstraintPresets}
            onAddCustom={handleAddCustomConstraint}
            onRemoveCustom={removeCustomConstraintPreset}
          />
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder="Free-text constraints…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </div>

        {/* Output format */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Output format</h3>
          <ConstraintPills
            presets={FORMAT_PRESETS}
            selected={formatPresets}
            onToggle={toggleFormatPreset}
            customPresets={customFormatPresets}
            onAddCustom={handleAddCustomFormat}
            onRemoveCustom={removeCustomFormatPreset}
          />
          <textarea
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            rows={2}
            placeholder="Free-text format description…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </div>

        {/* Session facts */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Session facts</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFact(); } }}
              placeholder="Pin a fact (e.g. team size = 6)…"
              className="flex-1 bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
            />
            <button
              type="button"
              onClick={addFact}
              disabled={!newFact.trim()}
              className="px-4 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {sessionFacts.length > 0 && (
            <ul className="space-y-1">
              {sessionFacts.map((fact, i) => (
                <li key={i} className="flex items-center justify-between bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)]">
                  <span>{fact}</span>
                  <button
                    type="button"
                    onClick={() => removeSessionFact(i)}
                    aria-label="Remove"
                    className="text-[var(--on-surface-variant)] hover:text-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
