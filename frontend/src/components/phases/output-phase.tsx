'use client';

import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { needsRealignment, downloadFile } from '@/lib/utils';
import { EvalSection } from '@/components/shared/eval-section';
import { SuggestionsList } from '@/components/shared/suggestions-list';
import { MODE_DISPLAY } from '@/lib/constants';
import type { ModeType, ScoreLevel, FlowTriggerType, PMInput } from '@/types';
import { MarkdownOutput } from '@/components/shared/markdown-output';
import { CustomSelect } from '@/components/shared/custom-select';

type InspectionState =
  | { kind: 'none' }
  | { kind: 'check_intent'; text: string }
  | { kind: 'confirm_understanding'; text: string }
  | { kind: 'analyze_pattern'; text: string }
  | { kind: 'ask_questions'; questions: string[]; answers: string[] };

const INSPECTION_PANEL_META: Record<
  'check_intent' | 'confirm_understanding' | 'analyze_pattern',
  { icon: string; label: string }
> = {
  check_intent: { icon: 'visibility', label: 'Inferred Intent' },
  confirm_understanding: { icon: 'record_voice_over', label: 'Understanding Restated' },
  analyze_pattern: { icon: 'insights', label: 'Pattern Analysis' },
};

const REFINE_OPTIONS: Array<{ value: FlowTriggerType; label: string }> = [
  { value: 'refine_shorter', label: 'Shorter' },
  { value: 'refine_technical', label: 'More technical' },
  { value: 'refine_concrete', label: 'More concrete' },
  { value: 'refine_angle', label: 'Different angle' },
  { value: 'refine_cautious', label: 'More cautious' },
];

function scoreBadgeClass(dim: string, score: ScoreLevel): string {
  const isDrift = dim === 'drift';
  const isGood = isDrift ? score === 'Low' : score === 'High';
  const isBad = isDrift ? score === 'High' : score === 'Low';
  if (isGood) return 'bg-emerald-100 text-emerald-800';
  if (isBad) return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

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
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);

  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);
  const setMode = useSessionStore((s) => s.setMode);
  const setRealignmentPrompt = useSessionStore((s) => s.setRealignmentPrompt);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const appendIteration = useSessionStore((s) => s.appendIteration);
  const setIterationRating = useSessionStore((s) => s.setIterationRating);
  const finalize = useSessionStore((s) => s.finalize);

  // The most recent iteration is the "current" one on screen
  const currentIteration = iterations[iterations.length - 1];
  const currentRating = currentIteration?.user_rating ?? null;

  function handleRate(rating: 'positive' | 'negative') {
    if (!currentIteration) return;
    // Toggle off if clicking the same rating; otherwise set it
    const next = currentRating === rating ? null : rating;
    setIterationRating(currentIteration.iteration_number, next);
  }

  const [realignLoading, setRealignLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({});
  const [flowLoading, setFlowLoading] = useState<FlowTriggerType | 'check_intent' | 'confirm_understanding' | 'analyze_pattern' | 'ask_questions' | null>(null);
  const [inspection, setInspection] = useState<InspectionState>({ kind: 'none' });
  const [refineMenuOpen, setRefineMenuOpen] = useState(false);
  const refineMenuRef = useRef<HTMLDivElement>(null);

  // Close refine dropdown on outside click or Escape
  useEffect(() => {
    if (!refineMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (refineMenuRef.current && !refineMenuRef.current.contains(e.target as Node)) {
        setRefineMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRefineMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [refineMenuOpen]);

  const shouldRealign = currentEval ? needsRealignment(currentEval) : false;
  const driftDetected = currentEval && (currentEval.drift.score === 'High' || currentEval.drift.score === 'Medium');

  function buildInputs(): PMInput {
    return {
      objective,
      audience,
      constraints,
      output_format: outputFormat,
      mode,
      session_facts: sessionFacts,
      ...(mode === 'custom' ? {
        custom_name: customName,
        custom_preamble: customPreamble,
        custom_tone: customTone,
      } : {}),
    };
  }

  async function handleFlowTrigger(trigger: FlowTriggerType) {
    if (!currentOutput) return;
    setError(null);
    setFlowLoading(trigger);
    setRefineMenuOpen(false);
    try {
      const result = await api.flowTrigger({
        inputs: buildInputs(),
        current_output: currentOutput,
        trigger,
        iteration_number: iterations.length + 1,
        evaluation: currentEval,
        iteration_history: iterations,
        model,
      });
      appendIteration(result.iteration, result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Flow trigger failed.');
    } finally {
      setFlowLoading(null);
    }
  }

  async function handleFlowInspect(
    inspectionKind: 'check_intent' | 'confirm_understanding' | 'analyze_pattern' | 'ask_questions'
  ) {
    if (!currentOutput) return;
    setError(null);
    setFlowLoading(inspectionKind);
    try {
      const result = await api.flowInspect({
        inputs: buildInputs(),
        current_output: currentOutput,
        inspection: inspectionKind,
        iteration_history: iterations,
        model,
      });
      if (result.kind === 'ask_questions') {
        setInspection({
          kind: 'ask_questions',
          questions: result.questions,
          answers: Array(result.questions.length).fill(''),
        });
      } else {
        // All other kinds are text-based inspection panels
        setInspection({ kind: result.kind, text: result.text });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection failed.');
    } finally {
      setFlowLoading(null);
    }
  }

  async function handleIterateWithAnswers() {
    if (inspection.kind !== 'ask_questions' || !currentOutput) return;
    const qaContext = inspection.questions
      .map((q, i) => `Q: ${q}\nA: ${inspection.answers[i] || '(no answer)'}`)
      .join('\n\n');
    const augmentedConstraints = constraints
      ? `${constraints}\n\nAdditional clarifications provided by the user:\n${qaContext}`
      : `Additional clarifications provided by the user:\n${qaContext}`;

    setError(null);
    setFlowLoading('ask_questions');
    try {
      // Build a fresh prompt with the augmented constraints and run a standard iteration.
      // This way the clarifications are treated as real constraints, not forced through a
      // refinement lens (shorter/technical/concrete/etc.).
      const augmentedInputs = { ...buildInputs(), constraints: augmentedConstraints };
      const assembled = await api.buildPrompt(augmentedInputs);
      const result = await api.runIteration({
        inputs: augmentedInputs,
        prompt_text: assembled.user_prompt,
        system_text: assembled.system_prompt,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        source: 'ask_questions',
        model,
      });
      appendIteration(result.iteration, result.suggestions);
      setInspection({ kind: 'none' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to iterate with answers.');
    } finally {
      setFlowLoading(null);
    }
  }

  async function handleGenerateRealignment() {
    if (!currentEval) return;
    setError(null);
    setRealignLoading(true);
    try {
      const result = await api.buildRealignment({
        inputs: buildInputs(),
        evaluation: currentEval,
        iteration_history: iterations,
        model,
      });
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
      const result = await api.buildPrompt(buildInputs());
      setMode(mode);
      setAssembled(result);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild prompt.');
    } finally {
      setRefineLoading(false);
    }
  }

  async function handleCopy() {
    if (!currentOutput) return;
    try {
      await navigator.clipboard.writeText(currentOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  function toggleIteration(num: number) {
    setExpandedIterations((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  const anyLoading = realignLoading || refineLoading || flowLoading !== null;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-display">Output &amp; Evaluation</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Assess the generated response and verify alignment with your initial parameters.
        </p>
      </div>

      {/* AI Output card */}
      <div className="bg-white rounded-xl shadow-ambient p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            Generated Output
          </span>
          <div className="flex items-center gap-1">
            {/* Thumbs up */}
            <button
              type="button"
              onClick={() => handleRate('positive')}
              disabled={!currentIteration}
              title="Mark as strong — the AI will preserve what worked here"
              aria-label="Mark as strong"
              aria-pressed={currentRating === 'positive'}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                currentRating === 'positive'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={currentRating === 'positive' ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                thumb_up
              </span>
            </button>

            {/* Thumbs down */}
            <button
              type="button"
              onClick={() => handleRate('negative')}
              disabled={!currentIteration}
              title="Mark as poor — the AI will avoid repeating this"
              aria-label="Mark as poor"
              aria-pressed={currentRating === 'negative'}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                currentRating === 'negative'
                  ? 'bg-red-100 text-red-700'
                  : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={currentRating === 'negative' ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                thumb_down
              </span>
            </button>

            {/* Copy */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy to clipboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] transition-colors ml-1"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        {currentOutput ? (
          <MarkdownOutput content={currentOutput} />
        ) : (
          <p className="text-sm text-[var(--on-surface-variant)] italic">No output available.</p>
        )}
      </div>

      {/* Mode switch for next iteration */}
      <div className="bg-white rounded-xl shadow-ambient p-6">
        <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
          Mode for next iteration:
        </label>
        <CustomSelect
          value={mode}
          onChange={(v) => setMode(v as ModeType)}
          options={(Object.entries(MODE_DISPLAY) as Array<[ModeType, { display_name: string; tagline: string }]>).map(
            ([key, info]) => ({
              value: key,
              label: `${info.display_name} — ${info.tagline}`,
            })
          )}
        />
      </div>

      {/* Evaluation section */}
      {currentEval && <EvalSection evaluation={currentEval} />}

      {/* Suggestions */}
      {suggestions.length > 0 && <SuggestionsList suggestions={suggestions} />}

      {/* Evaluator callout caption */}
      <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-3">
        These scores come from a separate evaluator — a second AI call that independently checks the output against
        your original objective, not the AI grading itself.
      </p>

      {/* ===== FLOW TRIGGERS (book techniques Ch1 S13-S14) ===== */}
      <div className="bg-white rounded-xl shadow-ambient p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--on-surface)]">Flow Triggers</h3>
            <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
              One-click advanced techniques to stress-test, refine, or reframe your output.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Challenge This */}
          <button
            type="button"
            onClick={() => handleFlowTrigger('challenge')}
            disabled={anyLoading || !currentOutput}
            title="Argue the opposite view and stress-test the previous answer"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'challenge' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">gavel</span>
            )}
            Challenge This
          </button>

          {/* Self-Audit */}
          <button
            type="button"
            onClick={() => handleFlowTrigger('self_audit')}
            disabled={anyLoading || !currentOutput}
            title="Ask the AI to audit its own response and fix gaps"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'self_audit' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">fact_check</span>
            )}
            Self-Audit
          </button>

          {/* Reframe (Ch4 S10 Commanding the Frame) */}
          <button
            type="button"
            onClick={() => handleFlowTrigger('reframe')}
            disabled={anyLoading || !currentOutput}
            title="Tier 4 meta-move: question whether the problem is framed correctly"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'reframe' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            )}
            Reframe
          </button>

          {/* Drift Alert (only when drift detected) */}
          {driftDetected && (
            <button
              type="button"
              onClick={() => handleFlowTrigger('drift_alert')}
              disabled={anyLoading || !currentOutput}
              title="Explicitly call out drift and re-anchor to the objective"
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 rounded-lg hover:bg-amber-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {flowLoading === 'drift_alert' ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-900 border-t-transparent" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">warning</span>
              )}
              Drift Alert
            </button>
          )}

          {/* Check Intent (Shadow Prompt) */}
          <button
            type="button"
            onClick={() => handleFlowInspect('check_intent')}
            disabled={anyLoading || !currentOutput}
            title="Ask the AI to infer what you really want"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'check_intent' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">visibility</span>
            )}
            Check Intent
          </button>

          {/* Confirm Understanding (Clarifying Prompt, Ch6 S3.1) */}
          <button
            type="button"
            onClick={() => handleFlowInspect('confirm_understanding')}
            disabled={anyLoading || !currentOutput}
            title="Ask the AI to restate your goal in its own words to verify it heard correctly"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'confirm_understanding' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">record_voice_over</span>
            )}
            Confirm Understanding
          </button>

          {/* Analyze My Pattern (Mode Switch for Reflection, Ch6 S3.3) */}
          <button
            type="button"
            onClick={() => handleFlowInspect('analyze_pattern')}
            disabled={anyLoading || !currentOutput}
            title="Ask the AI to observe patterns in how you have been prompting this session"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'analyze_pattern' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">insights</span>
            )}
            Analyze My Pattern
          </button>

          {/* Ask Questions (Reverse Q&A) */}
          <button
            type="button"
            onClick={() => handleFlowInspect('ask_questions')}
            disabled={anyLoading || !currentOutput}
            title="Let the AI ask you clarifying questions"
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {flowLoading === 'ask_questions' ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">quiz</span>
            )}
            Ask Questions
          </button>

          {/* Refine as... dropdown */}
          <div className="relative" ref={refineMenuRef}>
            <button
              type="button"
              onClick={() => setRefineMenuOpen((v) => !v)}
              disabled={anyLoading || !currentOutput}
              title="Iterate with a specific single constraint"
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {REFINE_OPTIONS.some((o) => o.value === flowLoading) ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">tune</span>
              )}
              Refine as…
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
            {refineMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-[var(--outline-variant)]/30 overflow-hidden z-20">
                {REFINE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleFlowTrigger(option.value)}
                    className="w-full text-left px-4 py-2.5 text-xs font-medium text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inspection Result Panel (text-based inspections) */}
        {(inspection.kind === 'check_intent' ||
          inspection.kind === 'confirm_understanding' ||
          inspection.kind === 'analyze_pattern') && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[18px]">
                  {INSPECTION_PANEL_META[inspection.kind].icon}
                </span>
                <span className="text-xs font-bold text-blue-900 uppercase tracking-widest">
                  {INSPECTION_PANEL_META[inspection.kind].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspection({ kind: 'none' })}
                className="text-blue-600 hover:text-blue-800"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="text-sm text-[var(--on-surface)] leading-relaxed">
              <MarkdownOutput content={inspection.text} />
            </div>
          </div>
        )}

        {inspection.kind === 'ask_questions' && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[18px]">quiz</span>
                <span className="text-xs font-bold text-blue-900 uppercase tracking-widest">Clarifying Questions</span>
              </div>
              <button
                type="button"
                onClick={() => setInspection({ kind: 'none' })}
                className="text-blue-600 hover:text-blue-800"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            {inspection.questions.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No questions returned.</p>
            ) : (
              <div className="space-y-3">
                {inspection.questions.map((q, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-sm font-medium text-[var(--on-surface)]">
                      {i + 1}. {q}
                    </p>
                    <input
                      type="text"
                      value={inspection.answers[i]}
                      onChange={(e) => {
                        const newAnswers = [...inspection.answers];
                        newAnswers[i] = e.target.value;
                        setInspection({ ...inspection, answers: newAnswers });
                      }}
                      placeholder="Your answer…"
                      className="w-full bg-white rounded-lg border border-[var(--outline-variant)]/40 px-3 py-2 text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleIterateWithAnswers}
                  disabled={anyLoading || inspection.answers.every((a) => !a.trim())}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">electric_bolt</span>
                  Iterate with these answers
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleRefinePrompt}
          disabled={anyLoading}
          className="flex items-center gap-2 px-6 py-3 border border-[var(--outline-variant)] bg-white text-sm font-semibold text-[var(--on-surface)] rounded-xl hover:bg-[var(--surface-container-low)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refineLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
              Rebuilding…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">tune</span>
              Refine Prompt
            </>
          )}
        </button>

        {/* Download current output */}
        <button
          type="button"
          onClick={() =>
            downloadFile(
              currentOutput || '',
              `promptmaster_iteration_${iterations.length}.txt`
            )
          }
          className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--outline-variant)]/30 hover:bg-[var(--surface-container-low)] transition-all"
          title="Download output"
        >
          <span className="material-symbols-outlined text-[20px] text-[var(--on-surface-variant)]">download</span>
        </button>

        {shouldRealign ? (
          <button
            type="button"
            onClick={handleGenerateRealignment}
            disabled={anyLoading}
            className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {realignLoading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                Generate Realignment
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={finalize}
            disabled={anyLoading}
            className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Finalize Session
          </button>
        )}
      </div>

      {/* Iteration history (2+ iterations) */}
      {iterations.length >= 2 && (
        <details className="bg-white rounded-xl shadow-ambient overflow-hidden">
          <summary className="cursor-pointer px-8 py-5 text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] select-none hover:bg-[var(--surface-container-low)] transition-colors">
            Iteration History ({iterations.length} iterations)
          </summary>
          <div className="divide-y divide-[var(--outline-variant)]/20">
            {iterations.map((iter) => {
              const modeLabel = MODE_DISPLAY[iter.mode]?.display_name ?? iter.mode;
              const isExpanded = !!expandedIterations[iter.iteration_number];
              const rating = iter.user_rating;
              return (
                <div key={iter.iteration_number} className="px-8 py-5">
                  {/* Iteration header */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--on-surface)]">
                        Iteration {iter.iteration_number} ({modeLabel})
                      </span>
                      {rating && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            rating === 'positive'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                          title={rating === 'positive' ? 'User marked as strong' : 'User marked as poor'}
                        >
                          <span
                            className="material-symbols-outlined text-[12px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {rating === 'positive' ? 'thumb_up' : 'thumb_down'}
                          </span>
                          {rating === 'positive' ? 'Strong' : 'Poor'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {iter.evaluation &&
                        (['alignment', 'drift', 'clarity'] as const).map((dim) => {
                          const score = iter.evaluation![dim].score;
                          return (
                            <span
                              key={dim}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${scoreBadgeClass(dim, score)}`}
                            >
                              {dim}: {score}
                            </span>
                          );
                        })}
                    </div>
                  </div>

                  {/* Rate + expand controls */}
                  <div className="flex items-center gap-4 mb-2">
                    <button
                      type="button"
                      onClick={() => toggleIteration(iter.iteration_number)}
                      className="flex items-center gap-1.5 text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      {isExpanded ? 'Hide output' : 'Show output'}
                    </button>

                    <div className="flex items-center gap-1 text-[var(--on-surface-variant)]">
                      <button
                        type="button"
                        onClick={() =>
                          setIterationRating(
                            iter.iteration_number,
                            rating === 'positive' ? null : 'positive'
                          )
                        }
                        title="Mark as strong"
                        aria-label="Mark as strong"
                        aria-pressed={rating === 'positive'}
                        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                          rating === 'positive'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'hover:bg-[var(--surface-container-low)]'
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          style={rating === 'positive' ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          thumb_up
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setIterationRating(
                            iter.iteration_number,
                            rating === 'negative' ? null : 'negative'
                          )
                        }
                        title="Mark as poor"
                        aria-label="Mark as poor"
                        aria-pressed={rating === 'negative'}
                        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                          rating === 'negative'
                            ? 'bg-red-100 text-red-700'
                            : 'hover:bg-[var(--surface-container-low)]'
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          style={rating === 'negative' ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          thumb_down
                        </span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 p-4 bg-[var(--surface-container-low)] rounded-lg">
                      <MarkdownOutput content={iter.output} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
