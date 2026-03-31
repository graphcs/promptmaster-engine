'use client';

interface SuggestionsListProps {
  suggestions: string[];
}

export function SuggestionsList({ suggestions }: SuggestionsListProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[20px] text-[var(--pm-primary)]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          lightbulb
        </span>
        <h3 className="text-sm font-semibold text-[var(--on-surface)]">AI Suggested Refinements</h3>
      </div>
      <div className="bg-[var(--surface-container-low)] p-6 rounded-xl border border-slate-200/20 space-y-4">
        {suggestions.map((suggestion, i) => (
          <div key={i} className="flex gap-4">
            <span className="text-[var(--pm-primary)] font-bold text-sm">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="text-sm text-[var(--on-surface)] leading-relaxed">{suggestion}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
