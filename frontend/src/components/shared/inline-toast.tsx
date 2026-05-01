'use client';

import { useEffect } from 'react';

interface InlineToastProps {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

export function InlineToast({ message, onDismiss, durationMs = 3000 }: InlineToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-container)] text-[11px] text-[var(--on-surface)] shadow-sm"
    >
      <span className="material-symbols-outlined text-[14px] text-emerald-600">check</span>
      {message}
    </div>
  );
}
