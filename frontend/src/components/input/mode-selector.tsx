'use client';

import { useSessionStore } from '@/stores/session-store';
import { MODE_DISPLAY } from '@/lib/constants';
import type { ModeType } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function ModeSelector() {
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const setMode = useSessionStore((s) => s.setMode);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);

  const modeEntries = Object.entries(MODE_DISPLAY) as Array<[ModeType, { display_name: string; tagline: string }]>;

  return (
    <div className="space-y-3">
      <Select
        value={mode}
        onValueChange={(value) => {
          if (value !== null) setMode(value as ModeType);
        }}
      >
        <SelectTrigger className="w-full h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modeEntries.map(([key, { display_name, tagline }]) => (
            <SelectItem key={key} value={key}>
              {display_name} — {tagline}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mode === 'custom' && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mode Name</Label>
            <Input
              value={customName}
              onChange={(e) => setCustomMode(e.target.value, customPreamble, customTone)}
              placeholder="e.g. Strategist"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tone</Label>
            <Input
              value={customTone}
              onChange={(e) => setCustomMode(customName, customPreamble, e.target.value)}
              placeholder="e.g. Analytical and direct"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Persona / Preamble</Label>
            <Textarea
              value={customPreamble}
              onChange={(e) => setCustomMode(customName, e.target.value, customTone)}
              placeholder="Describe this mode's persona and approach..."
              className="min-h-[72px] text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
