'use client';

import { useState } from 'react';
import type { Iteration } from '@/types';
import { ScoreBadge } from './score-badge';
import { MarkdownOutput } from '@/components/shared/markdown-output';
import { MODE_DISPLAY } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface IterationComparisonProps {
  iterations: Iteration[];
}

function IterationColumn({ iteration }: { iteration: Iteration }) {
  const modeLabel = MODE_DISPLAY[iteration.mode]?.display_name ?? iteration.mode;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">
        Iteration {iteration.iteration_number}{' '}
        <span className="font-normal text-muted-foreground">({modeLabel})</span>
      </p>

      {iteration.evaluation && (
        <div className="flex flex-wrap gap-2">
          <ScoreBadge label="alignment" score={iteration.evaluation.alignment.score} />
          <ScoreBadge label="drift" score={iteration.evaluation.drift.score} />
          <ScoreBadge label="clarity" score={iteration.evaluation.clarity.score} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <MarkdownOutput content={iteration.output} />
      </div>
    </div>
  );
}

export function IterationComparison({ iterations }: IterationComparisonProps) {
  const [leftIndex, setLeftIndex] = useState(iterations.length - 2);
  const [rightIndex, setRightIndex] = useState(iterations.length - 1);

  if (iterations.length < 2) return null;

  const leftIteration = iterations[leftIndex];
  const rightIteration = iterations[rightIndex];

  return (
    <div className="space-y-4">
      {/* Dropdowns */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Left
          </Label>
          <Select
            value={String(leftIndex)}
            onValueChange={(v) => setLeftIndex(Number(v))}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {iterations.map((it, i) => (
                <SelectItem key={it.iteration_number} value={String(i)}>
                  Iteration {it.iteration_number} ({MODE_DISPLAY[it.mode]?.display_name ?? it.mode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Right
          </Label>
          <Select
            value={String(rightIndex)}
            onValueChange={(v) => setRightIndex(Number(v))}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {iterations.map((it, i) => (
                <SelectItem key={it.iteration_number} value={String(i)}>
                  Iteration {it.iteration_number} ({MODE_DISPLAY[it.mode]?.display_name ?? it.mode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Side-by-side columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <IterationColumn iteration={leftIteration} />
        <IterationColumn iteration={rightIteration} />
      </div>
    </div>
  );
}
