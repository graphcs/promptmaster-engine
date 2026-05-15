'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { MODE_DISPLAY, AUDIENCE_OPTIONS } from '@/lib/constants';
import type { ModeType, SetupSuggestion } from '@/types';
import { SetupChip } from './setup-chip';
import { ModeGrid } from '@/components/shared/mode-grid';
import { CustomSelect } from '@/components/shared/custom-select';

interface SetupSummaryBarProps {
  suggestion: SetupSuggestion;
}

type ChipKey = 'mode' | 'audience' | 'constraints' | 'output_format';

export function SetupSummaryBar({ suggestion }: SetupSummaryBarProps) {
  const [expanded, setExpanded] = useState<ChipKey | null>(null);

  const mode = useSessionStore((s) => s.mode);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const customName = useSessionStore((s) => s.customName);

  const setMode = useSessionStore((s) => s.setMode);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);

  function toggle(key: ChipKey) {
    setExpanded(expanded === key ? null : key);
  }

  const modeLabel =
    mode === 'custom' && customName
      ? customName
      : MODE_DISPLAY[mode]?.display_name ?? mode;

  return (
    <div data-tutorial="recommended-approach" className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            Recommended Approach
          </h2>
          <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-0.5">
            Click any chip to refine.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SetupChip
          label="Mode"
          value={modeLabel}
          rationale={suggestion.rationale.mode}
          expanded={expanded === 'mode'}
          onToggleExpand={() => toggle('mode')}
        >
          <ModeGrid
            selectedMode={mode}
            onSelect={(v: ModeType) => { setMode(v); setExpanded(null); }}
            variant="list"
          />
        </SetupChip>

        <SetupChip
          label="Audience"
          value={audience}
          rationale={suggestion.rationale.audience}
          expanded={expanded === 'audience'}
          onToggleExpand={() => toggle('audience')}
        >
          <CustomSelect
            value={audience}
            onChange={(v) => setAudience(v)}
            options={AUDIENCE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </SetupChip>

        <SetupChip
          label="Constraints"
          value={constraints || '(none)'}
          rationale={suggestion.rationale.constraints}
          expanded={expanded === 'constraints'}
          onToggleExpand={() => toggle('constraints')}
        >
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder="Scope limits, focus areas, or deadlines…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </SetupChip>

        <SetupChip
          label="Format"
          value={outputFormat || '(none)'}
          rationale={suggestion.rationale.output_format}
          expanded={expanded === 'output_format'}
          onToggleExpand={() => toggle('output_format')}
        >
          <textarea
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            rows={2}
            placeholder="e.g. Numbered list, two-section memo, table…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </SetupChip>
      </div>
    </div>
  );
}
