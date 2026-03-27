'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

export function ReviewPhase() {
  const assembled = useSessionStore((s) => s.assembled);
  const promptEdited = useSessionStore((s) => s.promptEdited);
  const systemPrompt = useSessionStore((s) => s.systemPrompt);
  const showScaffolding = useSessionStore((s) => s.showScaffolding);
  const iterations = useSessionStore((s) => s.iterations);
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);

  const setPromptEdited = useSessionStore((s) => s.setPromptEdited);
  const setShowScaffolding = useSessionStore((s) => s.setShowScaffolding);
  const appendIteration = useSessionStore((s) => s.appendIteration);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [loading, setLoading] = useState(false);

  async function handleExecute() {
    setError(null);
    setLoading(true);

    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
      };

      const result = await api.runIteration({
        inputs,
        prompt_text: promptEdited,
        system_text: systemPrompt,
        iteration_number: iterations.length + 1,
        model,
      });

      appendIteration(result.iteration, result.suggestions);
      setPhase('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run iteration.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSpinner message="Running iteration…" />;
  }

  return (
    <div className="space-y-5">
      {/* Structural callout */}
      <p className="text-xs text-muted-foreground">
        Your prompt has been assembled with mode locking and anchoring. Review and edit the user prompt before executing.
      </p>

      {/* System Prompt — collapsible */}
      <details className="rounded-lg border border-border/60 bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground transition-colors">
          System Prompt (read-only)
        </summary>
        <div className="px-3 pb-3 pt-1">
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono bg-background/50 rounded p-3 border border-border/40">
            {systemPrompt}
          </pre>
        </div>
      </details>

      {/* Scaffolding toggle */}
      {assembled?.scaffolding_notes && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showScaffolding}
              onChange={(e) => setShowScaffolding(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Show internal scaffolding</span>
          </label>
          {showScaffolding && (
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono bg-muted/30 rounded p-3 border border-border/40">
              {assembled.scaffolding_notes}
            </pre>
          )}
        </div>
      )}

      {/* User Prompt — editable */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">User Prompt (editable)</Label>
        <Textarea
          value={promptEdited}
          onChange={(e) => setPromptEdited(e.target.value)}
          className="text-sm font-mono resize-none"
          style={{ minHeight: '200px' }}
        />
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setPhase('input')}
          className="flex-1"
        >
          &larr; Back to Input
        </Button>
        <Button
          onClick={handleExecute}
          disabled={loading || !promptEdited.trim()}
          className="flex-1"
        >
          Execute &rarr;
        </Button>
      </div>
    </div>
  );
}
