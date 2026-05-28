'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { saveSession } from '@/lib/supabase/sessions';
import { useAuth } from '@/hooks/use-auth';
import { StatePill } from './state-pill';
import { OutlinePanel } from './outline-panel';
import { SectionList } from './section-list';
import type { PMInput, Session } from '@/types';

export function LongFormView() {
  const longForm = useSessionStore((s) => s.longForm);
  const longFormLoading = useSessionStore((s) => s.longFormLoading);

  // Individual store fields that compose a PMInput
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);

  const sessionId = useSessionStore((s) => s.sessionId);
  const iterations = useSessionStore((s) => s.iterations);
  const model = useSessionStore((s) => s.model);

  const setLongFormStateName = useSessionStore((s) => s.setLongFormStateName);
  const updateOutline = useSessionStore((s) => s.updateOutline);
  const setSectionContent = useSessionStore((s) => s.setSectionContent);
  const setSectionStatus = useSessionStore((s) => s.setSectionStatus);
  const setSectionRegenerated = useSessionStore((s) => s.setSectionRegenerated);
  const setCurrentSectionIndex = useSessionStore((s) => s.setCurrentSectionIndex);
  const setContinuitySnapshot = useSessionStore((s) => s.setContinuitySnapshot);
  const setLongFormLoading = useSessionStore((s) => s.setLongFormLoading);
  const appendIteration = useSessionStore((s) => s.appendIteration);

  const { user } = useAuth();

  const runningRef = useRef(false);

  // Build PMInput from individual store fields
  const inputs: PMInput = useMemo(() => ({
    objective,
    audience,
    constraints,
    output_format: outputFormat,
    mode,
    ...(mode === 'custom' && {
      custom_name: customName,
      custom_preamble: customPreamble,
      custom_tone: customTone,
    }),
    session_facts: sessionFacts,
  }), [objective, audience, constraints, outputFormat, mode, customName, customPreamble, customTone, sessionFacts]);

  // On mount: if persisted state is "writing", coerce to "paused" so user must explicitly resume.
  // This handles the "refresh mid-write" case per the spec.
  useEffect(() => {
    if (longForm?.state === 'writing') {
      setLongFormStateName('paused');
      setLongFormLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run only on mount

  const persistToSupabase = useCallback(async () => {
    if (!user) return;
    const snapshot = useSessionStore.getState();
    const sid = snapshot.sessionId ?? sessionId;
    if (!sid) return;

    const session: Session = {
      session_id: sid,
      created_at: new Date().toISOString(),
      objective: snapshot.objective,
      audience: snapshot.audience,
      constraints: snapshot.constraints,
      output_format: snapshot.outputFormat,
      mode: snapshot.mode,
      model: snapshot.model,
      iterations: snapshot.iterations,
      finalized: snapshot.finalized,
    };

    await saveSession(session, user.id);
  }, [user, sessionId]);

  const finalize = useCallback(async () => {
    const lf = useSessionStore.getState().longForm;
    if (!lf) return;
    const merged = lf.outline.map((s) => s.content).join('\n\n');
    const currentIterations = useSessionStore.getState().iterations;
    try {
      const result = await api.finalizeLongForm({
        inputs,
        merged_content: merged,
        outline: lf.outline,
        iteration_number: currentIterations.length + 1,
        iteration_history: currentIterations,
        model,
      });
      appendIteration(result.iteration, result.suggestions);
      setLongFormStateName('complete');
      await persistToSupabase();
    } catch {
      setLongFormStateName('paused');
    }
  }, [appendIteration, inputs, model, persistToSupabase, setLongFormStateName]);

  const runAutoAdvance = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLongFormLoading(true);

    try {
      while (true) {
        const lf = useSessionStore.getState().longForm;
        if (!lf || lf.state === 'paused' || lf.state === 'complete') break;

        const nextIndex = Math.max(0, lf.current_section_index);
        if (nextIndex >= lf.outline.length) {
          // All sections done — finalize
          await finalize();
          break;
        }

        const section = lf.outline[nextIndex];
        if (section.status === 'complete') {
          setCurrentSectionIndex(nextIndex + 1);
          continue;
        }

        setSectionStatus(nextIndex, 'writing', null);
        const priorContent = nextIndex > 0 ? lf.outline[nextIndex - 1].content : '';

        try {
          const result = await api.generateSection({
            inputs,
            outline: lf.outline,
            section_index: nextIndex,
            prior_snapshot: lf.continuity_snapshot,
            prev_section_content: priorContent,
            model,
          });

          // If length, retry once (backend keeps same max_tokens; we just retry)
          if (result.finish_reason === 'length') {
            const retry = await api.generateSection({
              inputs,
              outline: lf.outline,
              section_index: nextIndex,
              prior_snapshot: lf.continuity_snapshot,
              prev_section_content: priorContent,
              model,
            });
            setSectionContent(nextIndex, retry.content, retry.finish_reason);
            setContinuitySnapshot(retry.new_snapshot);
          } else {
            setSectionContent(nextIndex, result.content, result.finish_reason);
            setContinuitySnapshot(result.new_snapshot);
          }

          setCurrentSectionIndex(nextIndex + 1);
          await persistToSupabase();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          setSectionStatus(nextIndex, 'error', msg);
          setLongFormStateName('paused');
          await persistToSupabase();
          break;
        }
      }
    } finally {
      runningRef.current = false;
      setLongFormLoading(false);
    }
  }, [
    finalize,
    inputs,
    model,
    persistToSupabase,
    setContinuitySnapshot,
    setCurrentSectionIndex,
    setLongFormLoading,
    setLongFormStateName,
    setSectionContent,
    setSectionStatus,
  ]);

  // Auto-start the loop when state transitions to "writing"
  useEffect(() => {
    if (longForm?.state === 'writing' && !runningRef.current) {
      runAutoAdvance();
    }
  }, [longForm?.state, runAutoAdvance]);

  const handleStartWriting = () => {
    setCurrentSectionIndex(0);
    setLongFormStateName('writing');
  };

  const handlePause = () => {
    setLongFormStateName('paused');
  };

  const handleResume = () => {
    setLongFormStateName('writing');
  };

  const handleRegenerate = useCallback(async (index: number) => {
    const lf = useSessionStore.getState().longForm;
    if (!lf) return;
    setLongFormLoading(true);
    try {
      const priorContent = index > 0 ? lf.outline[index - 1].content : '';
      const result = await api.generateSection({
        inputs,
        outline: lf.outline,
        section_index: index,
        prior_snapshot: lf.continuity_snapshot,
        prev_section_content: priorContent,
        model,
      });
      setSectionRegenerated(index, result.content, result.finish_reason);
      await persistToSupabase();
    } finally {
      setLongFormLoading(false);
    }
  }, [inputs, model, persistToSupabase, setLongFormLoading, setSectionRegenerated]);

  const handleRetry = useCallback((index: number) => {
    setSectionStatus(index, 'pending', null);
    setCurrentSectionIndex(index);
    setLongFormStateName('writing');
  }, [setCurrentSectionIndex, setLongFormStateName, setSectionStatus]);

  if (!longForm) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StatePill
          state={longForm.state}
          currentSectionIndex={longForm.current_section_index}
          totalSections={longForm.outline.length}
        />
        {longForm.state === 'writing' && (
          <button
            onClick={handlePause}
            className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-200"
          >
            Pause
          </button>
        )}
        {longForm.state === 'paused' && (
          <button
            onClick={handleResume}
            disabled={longFormLoading}
            className="px-4 py-2 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Resume
          </button>
        )}
      </div>

      {(longForm.state === 'outlining' || longForm.state === 'review_outline') && (
        <OutlinePanel
          outline={longForm.outline}
          editable={longForm.state === 'review_outline'}
          onChange={updateOutline}
          onStartWriting={handleStartWriting}
          startDisabled={longFormLoading}
        />
      )}

      {(longForm.state === 'writing' || longForm.state === 'paused' || longForm.state === 'complete') && (
        <SectionList
          outline={longForm.outline}
          currentSectionIndex={longForm.current_section_index}
          onRegenerate={handleRegenerate}
          onRetry={handleRetry}
          regenerateDisabled={longForm.state === 'writing' || longFormLoading}
        />
      )}
    </div>
  );
}
