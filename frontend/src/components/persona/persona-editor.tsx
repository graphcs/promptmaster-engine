'use client';

import { useState } from 'react';
import type { CustomMode, CustomModeInput } from '@/types';

const NAME_MAX = 60;
const PREAMBLE_MAX = 2000;
const TONE_MAX = 200;

interface PersonaEditorProps {
  mode: 'create' | 'edit';
  initial?: CustomMode | null;
  onCancel: () => void;
  onSave: (input: CustomModeInput) => Promise<void>;
}

export function PersonaEditor({ mode, initial, onCancel, onSave }: PersonaEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [preamble, setPreamble] = useState(initial?.preamble ?? '');
  const [tone, setTone] = useState(initial?.tone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedPreamble = preamble.trim();
  const trimmedTone = tone.trim();

  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX;
  const preambleValid = trimmedPreamble.length >= 1 && trimmedPreamble.length <= PREAMBLE_MAX;
  const toneValid = trimmedTone.length <= TONE_MAX;
  const canSave = nameValid && preambleValid && toneValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmedName, preamble: trimmedPreamble, tone: trimmedTone });
    } catch {
      setError("Couldn't save your persona. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const preambleCount = preamble.length;
  const preambleCountClass =
    preambleCount > PREAMBLE_MAX
      ? 'text-red-600'
      : preambleCount > PREAMBLE_MAX - 100
      ? 'text-amber-600'
      : 'text-[var(--outline)]';

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border-l-4 border-red-400 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {mode === 'edit' && (
        <p className="rounded-lg bg-[var(--surface-container-low)] px-4 py-3 text-[12px] italic text-[var(--on-surface-variant)]">
          Edits apply to future sessions. Re-pick this persona to use the updated version in this session.
        </p>
      )}

      {/* Name */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX + 10}
          placeholder="e.g. Skeptical Investor"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
        />
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          Short label to help you find this persona later.
        </p>
      </div>

      {/* Preamble */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Persona instructions
        </label>
        <textarea
          value={preamble}
          onChange={(e) => setPreamble(e.target.value)}
          rows={6}
          placeholder="You are a numbers-first investor who pushes back on optimistic claims and asks for evidence…"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] text-[var(--on-surface-variant)]">
            How the AI should think and behave as this persona.
          </p>
          <p className={`text-[11px] ${preambleCountClass}`}>
            {preambleCount} / {PREAMBLE_MAX}
          </p>
        </div>
      </div>

      {/* Tone */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Tone <span className="font-normal lowercase text-[var(--outline)]">(optional)</span>
        </label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          maxLength={TONE_MAX + 10}
          placeholder="e.g. blunt, evidence-based, no hedging"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
        />
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          A short phrase about voice or style (kept separate from the instructions).
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-2 px-5 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">check</span>
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
