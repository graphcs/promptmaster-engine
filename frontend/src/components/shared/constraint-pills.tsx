'use client';

interface ConstraintPillsProps {
  presets: string[];
  selected: string[];
  onToggle: (preset: string) => void;
}

export function ConstraintPills({ presets, selected, onToggle }: ConstraintPillsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {presets.map((preset) => {
        const isActive = selected.includes(preset);
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onToggle(preset)}
            className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-[var(--pm-primary-container)] text-white'
                : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'
            }`}
          >
            <span>{preset}</span>
            <span
              className={`material-symbols-outlined text-[18px] ${isActive ? '' : 'opacity-20'}`}
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {isActive ? 'check_circle' : 'add_circle'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
