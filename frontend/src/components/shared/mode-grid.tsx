'use client';

import type { ModeType } from '@/types';
import { MODE_DISPLAY } from '@/lib/constants';

const MODES: Array<{ key: ModeType; icon: string; name: string; desc: string }> = [
  { key: 'architect', icon: 'architecture', name: 'Architect', desc: 'Systemic structural logic' },
  { key: 'critic', icon: 'rate_review', name: 'Critic', desc: 'Rigorous evaluation' },
  { key: 'clarity', icon: 'lightbulb', name: 'Clarity', desc: 'Simplification focus' },
  { key: 'coach', icon: 'sports', name: 'Coach', desc: 'Guided performance' },
  { key: 'therapist', icon: 'psychology', name: 'Therapist', desc: 'Empathetic analysis' },
  { key: 'cold_critic', icon: 'ac_unit', name: 'Cold Critic', desc: 'Emotionless logic' },
  { key: 'analyst', icon: 'analytics', name: 'Analyst', desc: 'Data-driven insights' },
  { key: 'custom', icon: 'tune', name: 'Custom', desc: 'User-defined logic' },
];

interface ModeGridProps {
  selectedMode: ModeType;
  onSelect: (mode: ModeType) => void;
}

export function ModeGrid({ selectedMode, onSelect }: ModeGridProps) {
  const selected = MODES.find((m) => m.key === selectedMode);
  const modeInfo = MODE_DISPLAY[selectedMode];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {MODES.map((mode) => {
          const isSelected = mode.key === selectedMode;
          return (
            <div
              key={mode.key}
              onClick={() => onSelect(mode.key)}
              className={`p-4 bg-white rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? 'shadow-ambient border-2 border-[var(--pm-primary)]'
                  : 'hover:bg-[var(--surface-container-high)]'
              }`}
            >
              <span
                className={`material-symbols-outlined mb-2 ${
                  isSelected ? 'text-[var(--pm-primary)]' : 'text-[var(--outline)]'
                }`}
              >
                {mode.icon}
              </span>
              <div className="text-sm font-semibold text-[var(--on-surface)]">{mode.name}</div>
              <div className="text-[11px] text-[var(--on-surface-variant)] leading-tight">{mode.desc}</div>
            </div>
          );
        })}
      </div>

      {selected && modeInfo && (
        <div className="bg-blue-50/50 p-5 rounded-xl border-l-4 border-[var(--pm-primary)]">
          <div className="text-xs font-bold text-[var(--pm-primary)] tracking-widest uppercase mb-1">
            About this mode: {selected.name}
          </div>
          <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
            {modeInfo.tagline}
          </p>
        </div>
      )}
    </div>
  );
}
