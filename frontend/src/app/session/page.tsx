'use client';

import { useSessionStore } from '@/stores/session-store';
import { InputPhase } from '@/components/phases/input-phase';
import { ReviewPhase } from '@/components/phases/review-phase';
import { OutputPhase } from '@/components/phases/output-phase';
import { RealignPhase } from '@/components/phases/realign-phase';
import { SummaryPhase } from '@/components/phases/summary-phase';

export default function SessionPage() {
  const phase = useSessionStore((s) => s.phase);
  const error = useSessionStore((s) => s.error);
  const setError = useSessionStore((s) => s.setError);

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80">
            &times;
          </button>
        </div>
      )}

      {phase === 'input' && <InputPhase />}
      {phase === 'review' && <ReviewPhase />}
      {phase === 'output' && <OutputPhase />}
      {phase === 'realign' && <RealignPhase />}
      {phase === 'summary' && <SummaryPhase />}
    </>
  );
}
