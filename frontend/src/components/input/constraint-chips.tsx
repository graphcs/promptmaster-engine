'use client';

import { useSessionStore } from '@/stores/session-store';
import { CONSTRAINT_PRESETS } from '@/lib/constants';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function ConstraintChips() {
  const constraints = useSessionStore((s) => s.constraints);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setConstraintPresets = useSessionStore((s) => s.setConstraintPresets);

  function isSelected(preset: string): boolean {
    return constraintPresets.includes(preset);
  }

  function togglePreset(preset: string) {
    if (isSelected(preset)) {
      // Remove from presets list
      const newPresets = constraintPresets.filter((p) => p !== preset);
      setConstraintPresets(newPresets);
      // Remove from text: split by comma, filter out exact match, rejoin
      const parts = constraints
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== preset && s !== '');
      setConstraints(parts.join(', '));
    } else {
      // Add to presets list
      const newPresets = [...constraintPresets, preset];
      setConstraintPresets(newPresets);
      // Append to text
      const trimmed = constraints.trim();
      setConstraints(trimmed ? `${trimmed}, ${preset}` : preset);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Constraints</Label>
      <div className="flex flex-wrap gap-1.5">
        {CONSTRAINT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => togglePreset(preset)}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              isSelected(preset)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <Textarea
        value={constraints}
        onChange={(e) => setConstraints(e.target.value)}
        placeholder="Add constraints, or click presets above..."
        className="min-h-[72px] text-sm resize-none"
      />
    </div>
  );
}
