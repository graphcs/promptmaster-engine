'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { needsRealignment, downloadFile } from '@/lib/utils';
import { MODE_DISPLAY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MarkdownOutput } from '@/components/shared/markdown-output';
import { EvalCard } from '@/components/evaluation/eval-card';
import { Suggestions } from '@/components/evaluation/suggestions';
import type { ModeType } from '@/types';

export function OutputPhase() {
  const iterations = useSessionStore((s) => s.iterations);
  const currentOutput = useSessionStore((s) => s.currentOutput);
  const currentEval = useSessionStore((s) => s.currentEval);
  const suggestions = useSessionStore((s) => s.suggestions);
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const model = useSessionStore((s) => s.model);
  const assembled = useSessionStore((s) => s.assembled);

  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);
  const setMode = useSessionStore((s) => s.setMode);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPromptEdited = useSessionStore((s) => s.setPromptEdited);
  const finalize = useSessionStore((s) => s.finalize);

  const [realignLoading, setRealignLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [nextMode, setNextMode] = useState<ModeType>(mode);

  const iterationNumber = iterations.length;
  const shouldRealign = currentEval ? needsRealignment(currentEval) : false;

  async function handleGenerateRealignment() {
    if (!currentEval) return;
    setError(null);
    setRealignLoading(true);

    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
      };

      const result = await api.buildRealignment({ inputs, evaluation: currentEval, model });
      setRealignmentPrompt(result.realignment_prompt);
      setPhase('realign');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build realignment prompt.');
    } finally {
      setRealignLoading(false);
    }
  }

  async function handleRefinePrompt() {
    setError(null);
    setRefineLoading(true);

    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode: nextMode,
      };

      const result = await api.buildPrompt(inputs);
      setMode(nextMode);
      setAssembled(result);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild prompt.');
    } finally {
      setRefineLoading(false);
    }
  }

  function handleDownload() {
    if (!currentOutput) return;
    const filename = `promptmaster-output-iteration-${iterationNumber}.txt`;
    downloadFile(currentOutput, filename);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">
        Step 3: Output &amp; Evaluation (Iteration {iterationNumber})
      </h2>

      {/* Generated output */}
      {currentOutput && (
        <div className="rounded-lg border border-border bg-card p-4">
          <MarkdownOutput content={currentOutput} />
        </div>
      )}

      <Separator />

      {/* Mode switch for next iteration */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Mode for next iteration
        </Label>
        <Select
          value={nextMode}
          onValueChange={(value) => setNextMode(value as ModeType)}
        >
          <SelectTrigger className="w-full h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_DISPLAY) as ModeType[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_DISPLAY[m].display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Evaluation card */}
      {currentEval && <EvalCard evaluation={currentEval} />}

      {/* Suggestions */}
      {suggestions.length > 0 && <Suggestions suggestions={suggestions} />}

      {/* Evaluator callout */}
      <p className="text-xs text-muted-foreground mb-4 italic">
        These scores come from a separate evaluator — a second AI call that independently checks the output against your original objective, not the AI grading itself.
      </p>

      <Separator />

      {/* Realignment or proceed buttons */}
      {shouldRealign ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
              Realignment recommended
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              One or more scores indicate the output may have drifted or misaligned with your objective. Consider realigning before proceeding.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleGenerateRealignment}
              disabled={realignLoading || refineLoading}
              className="flex-1"
            >
              {realignLoading ? 'Generating…' : 'Generate Realignment Prompt'}
            </Button>
            <Button
              variant="outline"
              onClick={handleRefinePrompt}
              disabled={realignLoading || refineLoading}
              className="flex-1"
            >
              {refineLoading ? 'Rebuilding…' : 'Refine Prompt'}
            </Button>
            <Button
              variant="ghost"
              onClick={finalize}
              disabled={realignLoading || refineLoading}
              className="flex-1"
            >
              Proceed Anyway &rarr;
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3">
            <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
              All scores acceptable.
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
              Alignment, clarity, and drift are within acceptable ranges.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={finalize}
              className="flex-1"
            >
              Finalize Session &rarr;
            </Button>
            <Button
              variant="outline"
              onClick={handleRefinePrompt}
              disabled={refineLoading}
              className="flex-1"
            >
              {refineLoading ? 'Rebuilding…' : 'Refine Prompt'}
            </Button>
          </div>
        </div>
      )}

      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={!currentOutput}
        className="w-full text-xs text-muted-foreground"
      >
        Download Current Output
      </Button>
    </div>
  );
}
