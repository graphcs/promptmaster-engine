'use client';

import type { LongFormState } from '@/types';

interface StatePillProps {
  state: LongFormState['state'];
  currentSectionIndex: number;
  totalSections: number;
}

export function StatePill({ state, currentSectionIndex, totalSections }: StatePillProps) {
  const { label, icon, tone } = getDisplay(state, currentSectionIndex, totalSections);

  const toneClasses = {
    info: 'bg-blue-50 text-blue-800',
    progress: 'bg-amber-50 text-amber-800',
    paused: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-50 text-emerald-800',
  }[tone];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${toneClasses}`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function getDisplay(
  state: LongFormState['state'],
  currentSectionIndex: number,
  totalSections: number,
): { label: string; icon: string; tone: 'info' | 'progress' | 'paused' | 'success' } {
  switch (state) {
    case 'outlining':
      return { label: 'Building outline…', icon: 'list_alt', tone: 'info' };
    case 'review_outline':
      return { label: 'Review outline', icon: 'edit_note', tone: 'info' };
    case 'writing': {
      const displayIndex = Math.max(1, currentSectionIndex + 1);
      return {
        label: `Writing section ${displayIndex} of ${totalSections}…`,
        icon: 'edit',
        tone: 'progress',
      };
    }
    case 'paused':
      return { label: 'Paused', icon: 'pause_circle', tone: 'paused' };
    case 'complete':
      return { label: 'Done', icon: 'check_circle', tone: 'success' };
  }
}
