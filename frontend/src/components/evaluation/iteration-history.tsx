'use client';

import type { Iteration } from '@/types';
import { ScoreBadge } from './score-badge';
import { scoreTrend } from '@/lib/utils';
import { MODE_DISPLAY } from '@/lib/constants';

interface IterationHistoryProps {
  iterations: Iteration[];
}

function TrendIndicator({ trend }: { trend: 'improved' | 'declined' | 'unchanged' }) {
  if (trend === 'improved') {
    return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">▲</span>;
  }
  if (trend === 'declined') {
    return <span className="text-red-600 dark:text-red-400 text-xs font-bold">▼</span>;
  }
  return <span className="text-muted-foreground text-xs font-bold">—</span>;
}

export function IterationHistory({ iterations }: IterationHistoryProps) {
  if (iterations.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Iteration History
      </p>
      <div className="space-y-2">
        {iterations.map((iteration, index) => {
          const prev = index > 0 ? iterations[index - 1] : null;
          const modeLabel = MODE_DISPLAY[iteration.mode]?.display_name ?? iteration.mode;

          return (
            <details
              key={iteration.iteration_number}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none list-none">
                <span className="text-sm font-medium text-foreground">
                  Iteration {iteration.iteration_number}{' '}
                  <span className="text-muted-foreground font-normal">({modeLabel})</span>
                </span>

                {iteration.evaluation && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Alignment */}
                    <div className="flex items-center gap-1">
                      <ScoreBadge label="alignment" score={iteration.evaluation.alignment.score} />
                      {prev?.evaluation && (
                        <TrendIndicator
                          trend={scoreTrend(
                            'alignment',
                            prev.evaluation.alignment.score,
                            iteration.evaluation.alignment.score
                          )}
                        />
                      )}
                    </div>

                    {/* Drift */}
                    <div className="flex items-center gap-1">
                      <ScoreBadge label="drift" score={iteration.evaluation.drift.score} />
                      {prev?.evaluation && (
                        <TrendIndicator
                          trend={scoreTrend(
                            'drift',
                            prev.evaluation.drift.score,
                            iteration.evaluation.drift.score
                          )}
                        />
                      )}
                    </div>

                    {/* Clarity */}
                    <div className="flex items-center gap-1">
                      <ScoreBadge label="clarity" score={iteration.evaluation.clarity.score} />
                      {prev?.evaluation && (
                        <TrendIndicator
                          trend={scoreTrend(
                            'clarity',
                            prev.evaluation.clarity.score,
                            iteration.evaluation.clarity.score
                          )}
                        />
                      )}
                    </div>
                  </div>
                )}
              </summary>

              <div className="px-4 py-3 border-t border-border bg-muted/10">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {iteration.output}
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
