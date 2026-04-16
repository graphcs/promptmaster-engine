'use client';

import { useState } from 'react';

interface ConstraintPillsProps {
  presets: string[];
  selected: string[];
  onToggle: (preset: string) => void;
  customPresets?: string[];
  onAddCustom?: (label: string) => void;
  onRemoveCustom?: (label: string) => void;
}

export function ConstraintPills({
  presets,
  selected,
  onToggle,
  customPresets = [],
  onAddCustom,
  onRemoveCustom,
}: ConstraintPillsProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  function handleAdd() {
    const label = newLabel.trim();
    if (!label || !onAddCustom) return;
    onAddCustom(label);
    setNewLabel('');
    setAdding(false);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {/* Default presets */}
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

      {/* Custom presets (with remove button) */}
      {customPresets.map((preset) => {
        const isActive = selected.includes(preset);
        return (
          <div key={`custom-${preset}`} className="flex items-stretch gap-0">
            <button
              type="button"
              onClick={() => onToggle(preset)}
              className={`flex-1 flex items-center justify-between px-4 py-3 rounded-l-xl text-sm font-medium transition-all ${
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
            {onRemoveCustom && (
              <button
                type="button"
                onClick={() => onRemoveCustom(preset)}
                title="Remove custom preset"
                className={`flex items-center px-2 rounded-r-xl text-sm transition-all ${
                  isActive
                    ? 'bg-[var(--pm-primary-container)] text-white/70 hover:text-white'
                    : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:text-red-600 hover:bg-red-50'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        );
      })}

      {/* Add custom preset inline input or "+" button */}
      {onAddCustom && (
        adding ? (
          <div className="flex items-center gap-1.5 col-span-1 md:col-span-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
              placeholder="Type a preset..."
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl text-sm bg-white border border-[var(--outline-variant)]/40 text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              className="px-4 py-3 rounded-xl text-sm font-medium bg-[var(--pm-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewLabel(''); }}
              className="px-3 py-3 rounded-xl text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Add custom preset"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] border border-dashed border-[var(--outline-variant)]/40 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Custom
          </button>
        )
      )}
    </div>
  );
}
