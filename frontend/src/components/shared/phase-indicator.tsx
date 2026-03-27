'use client';

import type { Phase } from '@/types';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const PHASES: { key: Phase; label: string; number: number }[] = [
  { key: 'input', label: 'Input', number: 1 },
  { key: 'review', label: 'Review', number: 2 },
  { key: 'output', label: 'Evaluate', number: 3 },
  { key: 'realign', label: 'Realign', number: 4 },
  { key: 'summary', label: 'Summary', number: 5 },
];

const PHASE_ORDER: Record<Phase, number> = { input: 0, review: 1, output: 2, realign: 3, summary: 4 };

interface PhaseIndicatorProps {
  currentPhase: Phase;
}

export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIdx = PHASE_ORDER[currentPhase];

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((p, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={p.key} className="flex items-center gap-1">
            {idx > 0 && (
              <div className={cn('h-px w-4', isCompleted ? 'bg-primary' : 'bg-border')} />
            )}
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors',
                isCompleted && 'bg-emerald-500 text-white',
                isCurrent && 'bg-primary text-primary-foreground',
                !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
              )}
            >
              {isCompleted ? <Check className="h-3 w-3" /> : p.number}
            </div>
            <span
              className={cn(
                'hidden text-xs sm:inline',
                isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
