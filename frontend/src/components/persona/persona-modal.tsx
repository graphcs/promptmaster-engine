'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import {
  listCustomModes,
  createCustomMode,
  updateCustomMode,
  deleteCustomMode,
} from '@/lib/supabase/custom-modes';
import type { CustomMode, CustomModeInput } from '@/types';
import { PersonaListView } from './persona-list-view';
import { PersonaEditor } from './persona-editor';

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; persona: CustomMode };

interface PersonaModalProps {
  open: boolean;
  onClose: () => void;
}

export function PersonaModal({ open, onClose }: PersonaModalProps) {
  const { user, loading: authLoading } = useAuth();

  const customModes = useSessionStore((s) => s.customModes);
  const customModesLoading = useSessionStore((s) => s.customModesLoading);
  const setCustomModes = useSessionStore((s) => s.setCustomModes);
  const setCustomModesLoading = useSessionStore((s) => s.setCustomModesLoading);

  const customName = useSessionStore((s) => s.customName);
  const setMode = useSessionStore((s) => s.setMode);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);

  const [view, setView] = useState<View>({ kind: 'list' });
  const [listError, setListError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!open || !user || loadedOnce) return;
    let cancelled = false;
    setCustomModesLoading(true);
    setListError(null);
    listCustomModes()
      .then((list) => {
        if (cancelled) return;
        setCustomModes(list);
        setLoadedOnce(true);
      })
      .catch(() => {
        if (cancelled) return;
        setListError("Couldn't load your personas. Try again.");
      })
      .finally(() => {
        if (!cancelled) setCustomModesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, loadedOnce, setCustomModes, setCustomModesLoading]);

  useEffect(() => {
    if (open) setView({ kind: 'list' });
  }, [open]);

  if (!open) return null;

  function snapshotIntoSession(persona: CustomMode) {
    setMode('custom');
    setCustomMode(persona.name, persona.preamble, persona.tone);
  }

  async function handleCreateSave(input: CustomModeInput) {
    if (!user) return;
    const created = await createCustomMode(input, user.id);
    setCustomModes([created, ...customModes]);
    snapshotIntoSession(created);
    onClose();
  }

  async function handleEditSave(input: CustomModeInput) {
    if (view.kind !== 'edit') return;
    const updated = await updateCustomMode(view.persona.id, input);
    setCustomModes(customModes.map((m) => (m.id === updated.id ? updated : m)));
    setView({ kind: 'list' });
  }

  async function handleDelete(persona: CustomMode) {
    const previous = customModes;
    setCustomModes(customModes.filter((m) => m.id !== persona.id));
    try {
      await deleteCustomMode(persona.id);
    } catch {
      setCustomModes(previous);
      setListError("Couldn't delete that persona. Try again.");
    }
  }

  function handleUse(persona: CustomMode) {
    snapshotIntoSession(persona);
    onClose();
  }

  const title =
    view.kind === 'create'
      ? 'New persona'
      : view.kind === 'edit'
      ? 'Edit persona'
      : 'Custom personas';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[var(--pm-primary)]">theater_comedy</span>
            <h2 className="text-lg font-semibold text-[var(--on-surface)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-[var(--surface-container-low)] transition-colors"
          >
            <span className="material-symbols-outlined text-[var(--outline)]">close</span>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {!user && !authLoading ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <span className="material-symbols-outlined text-[40px] text-[var(--outline)] mb-2">
                lock
              </span>
              <p className="text-sm text-[var(--on-surface)]">
                Sign in to save and reuse personas.
              </p>
            </div>
          ) : view.kind === 'list' ? (
            <>
              {listError && (
                <div className="mb-3 rounded-lg bg-red-50 border-l-4 border-red-400 px-4 py-3 text-sm text-red-800">
                  {listError}
                </div>
              )}
              <PersonaListView
                personas={customModes}
                activePersonaName={customName}
                loading={customModesLoading}
                onUse={handleUse}
                onEdit={(p) => setView({ kind: 'edit', persona: p })}
                onDelete={handleDelete}
                onCreateNew={() => setView({ kind: 'create' })}
              />
            </>
          ) : view.kind === 'create' ? (
            <PersonaEditor
              mode="create"
              initial={null}
              onCancel={() => setView({ kind: 'list' })}
              onSave={handleCreateSave}
            />
          ) : (
            <PersonaEditor
              mode="edit"
              initial={view.persona}
              onCancel={() => setView({ kind: 'list' })}
              onSave={handleEditSave}
            />
          )}
        </div>

        {view.kind === 'list' && user && customModes.length > 0 && (
          <div className="flex items-center justify-end px-6 py-4">
            <button
              type="button"
              onClick={() => setView({ kind: 'create' })}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New persona
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
