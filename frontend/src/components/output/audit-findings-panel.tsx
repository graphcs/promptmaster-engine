'use client';

import { useMemo, useState } from 'react';
import type { AuditFinding } from '@/types';
import { AuditFindingRow } from './audit-finding-row';

interface AuditFindingsPanelProps {
  findings: AuditFinding[];
  loading: 'apply' | null;
  onApply: (selectedFindingIds: string[]) => void;
  onDismiss: () => void;
}

export function AuditFindingsPanel({
  findings,
  loading,
  onApply,
  onDismiss,
}: AuditFindingsPanelProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    findings.forEach((f) => { init[f.id] = true; });
    return init;
  });

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selectedIds = useMemo(
    () => findings.filter((f) => checked[f.id]).map((f) => f.id),
    [findings, checked]
  );

  const noneChecked = selectedIds.length === 0;
  const applyDisabled = loading !== null || noneChecked;
  const applyTooltip = noneChecked ? 'At least one finding must be checked.' : undefined;

  if (findings.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-ambient p-6 border-l-4 border-emerald-400">
        <p className="text-sm text-[var(--on-surface)]">No issues found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
          Audit findings
        </h3>
        <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-0.5">
          Pick which fixes to apply, then click Apply.
        </p>
      </div>

      <div className="space-y-2">
        {findings.map((f) => (
          <AuditFindingRow
            key={f.id}
            finding={f}
            checked={!!checked[f.id]}
            onToggle={() => toggle(f.id)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => onApply(selectedIds)}
          disabled={applyDisabled}
          title={applyTooltip}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'apply' ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Applying…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
              Apply
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading !== null}
          className="px-4 py-2.5 text-xs font-semibold text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
