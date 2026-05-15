'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface SetupChipProps {
  label: string;
  value: string;
  rationale?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  children: ReactNode; // editor rendered as popover when expanded
}

export function SetupChip({
  label,
  value,
  rationale,
  expanded,
  onToggleExpand,
  children,
}: SetupChipProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onToggleExpand();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onToggleExpand();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded, onToggleExpand]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={onToggleExpand}
        className={`w-full text-left rounded-xl transition-colors p-4 flex items-start justify-between gap-3 ${
          expanded
            ? 'bg-[var(--surface-container)] ring-1 ring-[var(--pm-primary)]/40'
            : 'bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]'
        }`}
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
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {expanded && (
        <div
          className="absolute z-30 left-0 right-0 mt-2 rounded-xl bg-white p-6 space-y-4 ring-1 ring-[var(--pm-primary)]/40"
          style={{ boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)' }}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
              {label}
            </span>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label="Close"
              className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <div className="px-1 pb-1">{children}</div>
        </div>
      )}
    </div>
  );
}
