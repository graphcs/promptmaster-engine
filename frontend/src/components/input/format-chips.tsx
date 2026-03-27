'use client';

import { useSessionStore } from '@/stores/session-store';
import { FORMAT_PRESETS } from '@/lib/constants';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function FormatChips() {
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const formatPresets = useSessionStore((s) => s.formatPresets);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setFormatPresets = useSessionStore((s) => s.setFormatPresets);

  function isSelected(preset: string): boolean {
    return formatPresets.includes(preset);
  }

  function togglePreset(preset: string) {
    if (isSelected(preset)) {
      const newPresets = formatPresets.filter((p) => p !== preset);
      setFormatPresets(newPresets);
      const parts = outputFormat
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== preset && s !== '');
      setOutputFormat(parts.join(', '));
    } else {
      const newPresets = [...formatPresets, preset];
      setFormatPresets(newPresets);
      const trimmed = outputFormat.trim();
      setOutputFormat(trimmed ? `${trimmed}, ${preset}` : preset);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Output Format</Label>
      <div className="flex flex-wrap gap-1.5">
        {FORMAT_PRESETS.map((preset) => (
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
        value={outputFormat}
        onChange={(e) => setOutputFormat(e.target.value)}
        placeholder="Describe desired format, or click presets above..."
        className="min-h-[72px] text-sm resize-none"
      />
    </div>
  );
}
