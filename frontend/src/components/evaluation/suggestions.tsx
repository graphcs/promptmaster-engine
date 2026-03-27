'use client';

interface SuggestionsProps {
  suggestions: string[];
}

export function Suggestions({ suggestions }: SuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Suggestions:
      </p>
      <ul className="space-y-1.5">
        {suggestions.map((suggestion, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
            <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            <span>{suggestion}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
