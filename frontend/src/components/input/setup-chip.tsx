'use client';

import type { ReactNode } from 'react';

interface SetupChipProps {
  label: string;
  value: string;
  rationale?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  children: ReactNode; // editor rendered when expanded
}

export function SetupChip({
  label,
  value,
  rationale,
  expanded,
  onToggleExpand,
  children,
}: SetupChipProps) {
  if (expanded) {
    return (
      <div className="rounded-xl border border-[var(--outline-variant)]/30 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
              {label}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="Collapse"
            className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">expand_less</span>
          </button>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleExpand}
      className="w-full text-left rounded-xl bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] transition-colors p-4 flex items-start justify-between gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            {label}
          </span>
          <span className="text-sm font-semibold text-[var(--on-surface)] truncate">
            {value || '(none)'}
          </span>
        </div>
        {rationale && (
          <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-1">
            {rationale}
          </p>
        )}
      </div>
      <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] flex-shrink-0">
        expand_more
      </span>
    </button>
  );
}
