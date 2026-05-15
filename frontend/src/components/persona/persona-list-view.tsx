'use client';

import type { CustomMode } from '@/types';
import { PersonaRow } from './persona-row';

interface PersonaListViewProps {
  personas: CustomMode[];
  activePersonaName: string;
  loading: boolean;
  onUse: (persona: CustomMode) => void;
  onEdit: (persona: CustomMode) => void;
  onDelete: (persona: CustomMode) => Promise<void>;
  onCreateNew: () => void;
}

export function PersonaListView({
  personas,
  activePersonaName,
  loading,
  onUse,
  onEdit,
  onDelete,
  onCreateNew,
}: PersonaListViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <span className="material-symbols-outlined text-[var(--outline)] animate-spin text-[28px]">
          progress_activity
        </span>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[260px] text-center px-6">
        <span className="material-symbols-outlined text-[40px] text-[var(--outline)] mb-3">
          theater_comedy
        </span>
        <p className="text-sm font-semibold text-[var(--on-surface)] mb-1">
          No personas yet
        </p>
        <p className="text-[12px] text-[var(--on-surface-variant)] mb-4 max-w-[300px]">
          A custom persona is your own AI character — name it, write what it should do, set the tone, then reuse it any time.
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Create your first persona
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {personas.map((p) => (
        <PersonaRow
          key={p.id}
          persona={p}
          isActive={p.name === activePersonaName}
          onUse={() => onUse(p)}
          onEdit={() => onEdit(p)}
          onDelete={() => onDelete(p)}
        />
      ))}
    </div>
  );
}
