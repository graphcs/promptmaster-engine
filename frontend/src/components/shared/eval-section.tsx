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

      {/* Completeness — only when present (optional field for backward compat) */}
      {evaluation.completeness && (
        <div className="pt-8 border-t border-slate-100">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Completeness
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                  evaluation.completeness.status === 'complete'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {evaluation.completeness.status === 'complete' ? 'Complete' : 'Incomplete'}
              </span>
              <span className="text-sm font-semibold text-[var(--on-surface)]">
                {evaluation.completeness.status === 'complete' ? 'Output is complete' : 'Output is incomplete'}
              </span>
            </div>
            {evaluation.completeness.reason && (
              <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">
                {evaluation.completeness.reason}
              </p>
            )}
          </div>
          {evaluation.completeness.status === 'incomplete' && (
            <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-3">
              Click <span className="font-semibold">Continue Document</span> above to pick up exactly where it stopped.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
