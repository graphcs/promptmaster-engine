'use client';

import type { ScoreLevel } from '@/types';
import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  label: string;
  score: ScoreLevel;
}

export function ScoreBadge({ label, score }: ScoreBadgeProps) {
  const isDrift = label.toLowerCase().includes('drift');

  const isGood = isDrift ? score === 'Low' : score === 'High';
  const isBad = isDrift ? score === 'High' : score === 'Low';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide uppercase',
        isGood && 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        !isGood && !isBad && 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        isBad && 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'
      )}
    >
      {score}
    </span>
  );
}
