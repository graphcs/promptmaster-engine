'use client';

import type { OutlineSection } from '@/types';

interface OutlinePanelProps {
  outline: OutlineSection[];
  editable: boolean;  // false while state === "outlining"
  onChange: (outline: OutlineSection[]) => void;
  onStartWriting: () => void;
  startDisabled: boolean;
}

export function OutlinePanel({
  outline,
  editable,
  onChange,
  onStartWriting,
  startDisabled,
}: OutlinePanelProps) {
  const updateSection = (id: string, patch: Partial<OutlineSection>) => {
    onChange(outline.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteSection = (id: string) => {
    onChange(outline.filter((s) => s.id !== id));
  };

  const addSection = () => {
    const newSection: OutlineSection = {
      id: crypto.randomUUID(),
      title: 'New section',
      abstract: '',
      status: 'pending',
      content: '',
      revision: 0,
      finish_reason: null,
      error: null,
      generated_at: null,
    };
    onChange([...outline, newSection]);
  };

  if (outline.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-ambient p-8 text-center text-sm text-[var(--on-surface-variant)]">
        Building outline…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--on-surface)] mb-1">Outline</h3>
        <p className="text-sm text-[var(--on-surface-variant)]">
          Review and edit before writing starts. Each section will be written one at a time.
        </p>
      </div>

      <ol className="space-y-4">
        {outline.map((section, i) => (
          <li key={section.id} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold">
              {i + 1}
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                disabled={!editable}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-200 rounded-md disabled:bg-slate-50 disabled:cursor-not-allowed"
                placeholder="Section title"
              />
              <textarea
                value={section.abstract}
                onChange={(e) => updateSection(section.id, { abstract: e.target.value })}
                disabled={!editable}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:cursor-not-allowed"
                placeholder="One-sentence description of what this section covers"
              />
            </div>
            {editable && (
              <button
                onClick={() => deleteSection(section.id)}
                className="flex-shrink-0 w-8 h-8 text-slate-400 hover:text-red-600"
                aria-label="Delete section"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            )}
          </li>
        ))}
      </ol>

      {editable && (
        <button
          onClick={addSection}
          className="text-sm font-semibold text-[var(--pm-primary)] hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add a section
        </button>
      )}

      <div className="pt-4 border-t border-slate-100">
        <button
          onClick={onStartWriting}
          disabled={startDisabled || !editable || outline.length === 0}
          className="px-6 py-2.5 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Writing
        </button>
      </div>
    </div>
  );
}
