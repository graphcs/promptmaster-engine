'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { MODE_DISPLAY, AUDIENCE_OPTIONS } from '@/lib/constants';
import { OnboardingPanel } from '@/components/input/onboarding-panel';
import { ExampleButtons } from '@/components/input/example-buttons';
import { ModeSelector } from '@/components/input/mode-selector';
import { ConstraintChips } from '@/components/input/constraint-chips';
import { FormatChips } from '@/components/input/format-chips';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ModeType } from '@/types';

export function InputPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);

  async function handleAssemble() {
    if (!objective.trim()) {
      setError('Please enter an objective before assembling.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await api.buildPrompt({
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
      });
      setAssembled(result);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assemble prompt.');
    } finally {
      setLoading(false);
    }
  }

  const modeInfo = MODE_DISPLAY[mode as ModeType];

  return (
    <div className="space-y-5">
      {/* Structural callout */}
      <p className="text-xs text-muted-foreground mb-4">
        PromptMaster structures your request with mode locking, anchoring, and invisible scaffolding — techniques from the PromptMaster™ methodology.
      </p>

      {/* Onboarding panel */}
      <OnboardingPanel />

      {/* Example buttons */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Quick examples</Label>
        <ExampleButtons />
      </div>

      {/* Objective */}
      <div className="space-y-2">
        <Label htmlFor="objective" className="text-sm font-medium">
          Objective <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Describe what you want to achieve..."
          className="min-h-[100px] text-sm resize-none"
        />
      </div>

      {/* Audience + Mode — 2 columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Audience</Label>
          <Select
            value={audience}
            onValueChange={(value) => {
              if (value !== null) setAudience(value);
            }}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Mode</Label>
          <ModeSelector />
        </div>
      </div>

      {/* Mode info expander */}
      {modeInfo && (
        <details className="rounded-lg border border-border/60 bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground transition-colors">
            About {modeInfo.display_name} mode
          </summary>
          <p className="px-3 pb-3 pt-1 text-xs text-muted-foreground">
            {modeInfo.tagline}
            {mode === 'custom' && customName && (
              <span className="block mt-1 text-foreground font-medium">{customName}{customTone ? ` — ${customTone}` : ''}</span>
            )}
            {mode === 'custom' && customPreamble && (
              <span className="block mt-1">{customPreamble}</span>
            )}
          </p>
        </details>
      )}

      {/* Constraints + Format — 2 columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ConstraintChips />
        <FormatChips />
      </div>

      {/* Assemble button */}
      <Button
        onClick={handleAssemble}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? 'Assembling…' : 'Assemble Prompt →'}
      </Button>
    </div>
  );
}
