'use client';

import { useState } from 'react';
import type { OutlineSection } from '@/types';

interface SectionListProps {
  outline: OutlineSection[];
  currentSectionIndex: number;
  onRegenerate: (index: number) => void;
  onRetry: (index: number) => void;
  regenerateDisabled: boolean;
}

export function SectionList({
  outline,
  currentSectionIndex,
  onRegenerate,
  onRetry,
  regenerateDisabled,
}: SectionListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-6">
      <h3 className="text-base font-semibold text-[var(--on-surface)]">Sections</h3>
      <ol className="space-y-4">
        {outline.map((section, i) => {
          const isCurrent = i === currentSectionIndex;
          const isOpen = expanded.has(section.id);
          return (
            <li
              key={section.id}
              className={`border-l-4 pl-4 py-2 ${
                section.status === 'complete'
                  ? 'border-emerald-300'
                  : section.status === 'writing' || isCurrent
                  ? 'border-amber-400'
                  : section.status === 'error'
                  ? 'border-red-400'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <SectionStatusIcon status={section.status} isCurrent={isCurrent} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => section.content && toggleExpand(section.id)}
                      disabled={!section.content}
                      className="text-left text-sm font-semibold text-[var(--on-surface)] hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {i + 1}. {section.title}
                    </button>
                    {section.status === 'complete' && (
                      <button
                        onClick={() => onRegenerate(i)}
                        disabled={regenerateDisabled}
                        className="text-xs font-semibold text-[var(--pm-primary)] hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        Regenerate
                      </button>
                    )}
                    {section.status === 'error' && (
                      <button
                        onClick={() => onRetry(i)}
                        className="text-xs font-semibold text-red-700 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--on-surface-variant)] mt-1">{section.abstract}</p>
                  {section.status === 'error' && section.error && (
                    <p className="text-xs text-red-700 mt-2">Couldn&apos;t generate this section. {section.error}</p>
                  )}
                  {isOpen && section.content && (
                    <div className="mt-3 text-sm text-[var(--on-surface)] whitespace-pre-wrap leading-relaxed">
                      {section.content}
                    </div>
                  )}
                  {section.finish_reason === 'length' && section.status === 'complete' && (
                    <p className="text-[11px] text-amber-700 italic mt-2">
                      This section may have been cut short. Regenerate if needed.
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SectionStatusIcon({
  status,
  isCurrent,
}: {
  status: OutlineSection['status'];
  isCurrent: boolean;
}) {
  if (status === 'complete') {
    return <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>;
  }
  if (status === 'writing' || isCurrent) {
    return <span className="material-symbols-outlined text-amber-500 text-lg animate-pulse">edit</span>;
  }
  if (status === 'error') {
    return <span className="material-symbols-outlined text-red-600 text-lg">error</span>;
  }
  return <span className="material-symbols-outlined text-slate-300 text-lg">radio_button_unchecked</span>;
}
