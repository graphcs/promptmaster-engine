'use client';

import { useState } from 'react';
import type { CustomMode } from '@/types';

interface PersonaRowProps {
  persona: CustomMode;
  isActive: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function PersonaRow({ persona, isActive, onUse, onEdit, onDelete }: PersonaRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between p-4 rounded-xl bg-red-50 border-l-4 border-red-400">
        <span className="text-sm text-red-900">
          Delete &ldquo;{persona.name}&rdquo;?
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--on-surface-variant)] hover:bg-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    );
  }

  const previewLength = 90;
  const preview =
    persona.preamble.length > previewLength
      ? persona.preamble.slice(0, previewLength) + '…'
      : persona.preamble;

  return (
    <div
      onClick={onUse}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onUse();
        }
      }}
      className={`group flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-colors ${
        isActive
          ? 'bg-white ring-1 ring-[var(--pm-primary)]'
          : 'bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--on-surface)] truncate">
            {persona.name}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--pm-primary)]/10 text-[var(--pm-primary)]">
              <span
                className="material-symbols-outlined text-[12px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              Active
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--on-surface-variant)] leading-relaxed mt-1">
          {preview}
        </p>
        {persona.tone && (
          <p className="text-[11px] italic text-[var(--outline)] mt-1">
            Tone: {persona.tone}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
          aria-label={`Edit ${persona.name}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--on-surface-variant)] hover:bg-white hover:text-[var(--on-surface)] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(true);
          }}
          title="Delete"
          aria-label={`Delete ${persona.name}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--on-surface-variant)] hover:bg-white hover:text-red-600 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    </div>
  );
}
