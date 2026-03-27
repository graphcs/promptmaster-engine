'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PMInput } from '@/types';

export function RealignPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const systemPrompt = useSessionStore((s) => s.systemPrompt);
  const iterations = useSessionStore((s) => s.iterations);
  const realignmentPrompt = useSessionStore((s) => s.realignmentPrompt);

  const setPhase = useSessionStore((s) => s.setPhase);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const appendIteration = useSessionStore((s) => s.appendIteration);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(realignmentPrompt ?? '');

  async function handleExecute() {
    setError(null);
    setLoading(true);

    try {
      const inputs: PMInput = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
      };

      const result = await api.runIteration({
        inputs,
        prompt_text: localPrompt,
        system_text: systemPrompt,
        iteration_number: iterations.length + 1,
        model,
      });

      appendIteration(result.iteration, result.suggestions);
      setRealignmentPrompt(null);
      setPhase('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute realignment.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setRealignmentPrompt(localPrompt);
    setPhase('output');
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Step 4: Realignment</h2>

      {/* Info callout */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3">
        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
          Realignment re-anchors your objective and injects a corrective instruction
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
          The prompt below was generated to address alignment and drift issues detected in the previous iteration. You can edit it before running.
        </p>
      </div>

      {/* Editable realignment prompt */}
      <Textarea
        value={localPrompt}
        onChange={(e) => setLocalPrompt(e.target.value)}
        className="min-h-[250px] font-mono text-sm resize-y"
        placeholder="Realignment prompt will appear here..."
        disabled={loading}
      />

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={loading}
          className="flex-1"
        >
          &larr; Back to Output
        </Button>
        <Button
          onClick={handleExecute}
          disabled={loading || !localPrompt.trim()}
          className="flex-1"
        >
          {loading ? 'Executing…' : 'Execute Realignment →'}
        </Button>
      </div>
    </div>
  );
}
