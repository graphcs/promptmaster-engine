'use client';

import type { AuditFinding } from '@/types';

interface AuditFindingRowProps {
  finding: AuditFinding;
  checked: boolean;
  onToggle: () => void;
}

export function AuditFindingRow({ finding, checked, onToggle }: AuditFindingRowProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        checked ? 'bg-white' : 'bg-[var(--surface-container-low)] opacity-60'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-[var(--outline-variant)] text-[var(--pm-primary)] focus:ring-[var(--pm-primary)]/40 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[var(--pm-primary-container)]/20 text-[var(--pm-primary)]">
            {finding.category}
          </span>
          <span className="text-sm font-semibold text-[var(--on-surface)]">
            {finding.summary}
          </span>
        </div>
        <p className="text-[12px] italic text-[var(--on-surface-variant)] leading-relaxed">
          {finding.suggested_change}
        </p>
      </div>
    </label>
  );
}
