'use client';

interface LongFormProposalProps {
  suggestedSectionCount: number;
  onPlanItOut: () => void;
  onJustGenerate: () => void;
  disabled?: boolean;
}

export function LongFormProposal({
  suggestedSectionCount,
  onPlanItOut,
  onJustGenerate,
  disabled = false,
}: LongFormProposalProps) {
  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-blue-700 text-2xl">auto_stories</span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--on-surface)]">
            This looks like a long-form document
          </h3>
          <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
            I can plan it section by section first for more coherent results
            {suggestedSectionCount > 0 ? ` (roughly ${suggestedSectionCount} sections)` : ''}. Or just generate it in one pass.
          </p>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onPlanItOut}
          disabled={disabled}
          className="px-4 py-2 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Plan It Out
        </button>
        <button
          onClick={onJustGenerate}
          disabled={disabled}
          className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Just Generate
        </button>
      </div>
    </div>
  );
}
