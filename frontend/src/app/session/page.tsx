'use client';

import { useSessionStore } from '@/stores/session-store';
import { InputPhase } from '@/components/phases/input-phase';
import { ReviewPhase } from '@/components/phases/review-phase';
import { OutputPhase } from '@/components/phases/output-phase';

// Placeholder components — will be implemented in Task 7
function RealignPhasePlaceholder() {
  return <div className="rounded-lg border p-8 text-center text-muted-foreground">Realignment Phase (Task 7)</div>;
}
function SummaryPhasePlaceholder() {
  return <div className="rounded-lg border p-8 text-center text-muted-foreground">Summary Phase (Task 7)</div>;
}

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
      {phase === 'realign' && <RealignPhasePlaceholder />}
      {phase === 'summary' && <SummaryPhasePlaceholder />}
    </>
  );
}
