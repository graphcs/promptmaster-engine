'use client';

interface HeroZoneProps {
  objective: string;
  onObjectiveChange: (v: string) => void;
  onGenerateSetup: () => void;
  loading: boolean;
}

export function HeroZone({
  objective,
  onObjectiveChange,
  onGenerateSetup,
  loading,
}: HeroZoneProps) {
  const trimmed = objective.trim();
  const disabled = loading || trimmed.length === 0;
  const tooltip = trimmed.length === 0 ? 'Type your objective first' : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-display">What do you want to do or figure out?</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Describe your goal — a problem to solve, a document to write, a decision to make.
        </p>
      </div>

      <textarea
        value={objective}
        onChange={(e) => onObjectiveChange(e.target.value)}
        rows={3}
        placeholder="e.g. Plan a launch strategy for an internal tool over the next two weeks…"
        disabled={loading}
        className="w-full bg-white rounded-xl shadow-ambient px-5 py-4 text-base text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerateSetup}
          disabled={disabled}
          title={tooltip}
          className="flex items-center gap-2 px-6 py-3 bg-[var(--pm-primary)] text-white text-sm font-bold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Setting up…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Generate Setup
            </>
          )}
        </button>
      </div>
    </div>
  );
}
