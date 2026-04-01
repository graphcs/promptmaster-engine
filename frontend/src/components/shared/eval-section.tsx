'use client';

import type { EvaluationResult } from '@/types';
import { ScoreBadge } from '@/components/evaluation/score-badge';

interface EvalSectionProps {
  evaluation: EvaluationResult;
}

export function EvalSection({ evaluation }: EvalSectionProps) {
  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-8 overflow-hidden">
      {/* Quality Scores */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6">
          Quality Scores
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ScoreBadge label="Alignment" score={evaluation.alignment.score} />
              <span className="text-sm font-semibold text-[var(--on-surface)]">Alignment</span>
            </div>
            <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
              {evaluation.alignment.explanation}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ScoreBadge label="Clarity" score={evaluation.clarity.score} />
              <span className="text-sm font-semibold text-[var(--on-surface)]">Clarity</span>
            </div>
            <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
              {evaluation.clarity.explanation}
            </p>
          </div>
        </div>
      </div>

      {/* Scope Check (Drift) */}
      <div className="pt-8 border-t border-slate-100">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Scope Check
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ScoreBadge label="Drift" score={evaluation.drift.score} />
            <span className="text-sm font-semibold text-[var(--on-surface)]">Drift</span>
          </div>
          <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
            {evaluation.drift.explanation}
          </p>
        </div>
        <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-3">
          Drift measures whether the output stayed focused on your objective. Low = focused. High = wandered off-topic.
        </p>
      </div>
    </div>
  );
}
