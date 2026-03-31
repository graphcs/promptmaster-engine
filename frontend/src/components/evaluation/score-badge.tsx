'use client';

import type { ScoreLevel } from '@/types';

interface ScoreBadgeProps {
  label: string;
  score: ScoreLevel;
}

export function ScoreBadge({ label, score }: ScoreBadgeProps) {
  const isDrift = label.toLowerCase().includes('drift');
  const isGood = isDrift ? score === 'Low' : score === 'High';
  const isBad = isDrift ? score === 'High' : score === 'Low';

  const colorClass = isGood
    ? 'bg-green-100 text-green-700'
    : isBad
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${colorClass}`}>
      {score}
    </span>
  );
}
