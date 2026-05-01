'use client';

import { useEffect, useRef, useState } from 'react';
import type { Iteration } from '@/types';

interface VersionSelectorProps {
  versions: Iteration[];
  activeNumber: number | null;
  onSelect: (n: number) => void;
}

function ratingBadge(rating: 'positive' | 'negative' | null | undefined) {
  if (!rating) return null;
  const isPositive = rating === 'positive';
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
      title={isPositive ? 'Marked as strong' : 'Marked as poor'}
    >
      <span
        className="material-symbols-outlined text-[12px]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {isPositive ? 'thumb_up' : 'thumb_down'}
      </span>
    </span>
  );
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

export function VersionSelector({ versions, activeNumber, onSelect }: VersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (versions.length === 0) {
    return (
      <span className="text-xs font-semibold text-[var(--on-surface-variant)]">
        No versions yet
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors"
      >
        <span>Discussing: Version {activeNumber ?? versions[versions.length - 1].iteration_number}</span>
        <span className="material-symbols-outlined text-[14px]">expand_more</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-white rounded-lg shadow-lg border border-[var(--outline-variant)]/30 z-30">
          {versions.map((iter) => {
            const isActive = iter.iteration_number === activeNumber;
            return (
              <button
                key={iter.iteration_number}
                type="button"
                onClick={() => {
                  onSelect(iter.iteration_number);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-[var(--surface-container-low)] transition-colors ${
                  isActive ? 'bg-[var(--surface-container-low)]' : ''
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[var(--on-surface)]">
                    Version {iter.iteration_number}
                  </span>
                  {ratingBadge(iter.user_rating)}
                </div>
                {iter.summary && (
                  <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-0.5">
                    {truncate(iter.summary, 80)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
