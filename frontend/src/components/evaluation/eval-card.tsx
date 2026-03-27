'use client';

import type { EvaluationResult } from '@/types';
import { ScoreBadge } from './score-badge';

interface EvalCardProps {
  evaluation: EvaluationResult;
}

export function EvalCard({ evaluation }: EvalCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Quality Scores: Alignment + Clarity */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Quality Scores
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Alignment */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">Alignment</span>
              <ScoreBadge label="alignment" score={evaluation.alignment.score} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {evaluation.alignment.explanation}
            </p>
          </div>

          {/* Clarity */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">Clarity</span>
              <ScoreBadge label="clarity" score={evaluation.clarity.score} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {evaluation.clarity.explanation}
            </p>
          </div>
        </div>
      </div>

      {/* Scope Check: Drift */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Scope Check
        </p>
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">Drift</span>
            <ScoreBadge label="drift" score={evaluation.drift.score} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {evaluation.drift.explanation}
          </p>
          <p className="text-xs text-muted-foreground/60 italic pt-1">
            Drift measures whether the output stayed focused on your original objective.
          </p>
        </div>
      </div>
    </div>
  );
}
