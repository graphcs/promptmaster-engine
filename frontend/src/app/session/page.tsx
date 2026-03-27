'use client';

import { useSessionStore } from '@/stores/session-store';

// Placeholder components — will be implemented in Tasks 5-7
function InputPhasePlaceholder() {
  return <div className="rounded-lg border p-8 text-center text-muted-foreground">Input Phase (Task 5)</div>;
}
function ReviewPhasePlaceholder() {
  return <div className="rounded-lg border p-8 text-center text-muted-foreground">Review Phase (Task 6)</div>;
}
function OutputPhasePlaceholder() {
  return <div className="rounded-lg border p-8 text-center text-muted-foreground">Output Phase (Task 6)</div>;
}
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

      {phase === 'input' && <InputPhasePlaceholder />}
      {phase === 'review' && <ReviewPhasePlaceholder />}
      {phase === 'output' && <OutputPhasePlaceholder />}
      {phase === 'realign' && <RealignPhasePlaceholder />}
      {phase === 'summary' && <SummaryPhasePlaceholder />}
    </>
  );
}
