'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';

export function SessionFacts() {
  const facts = useSessionStore((s) => s.sessionFacts);
  const addFact = useSessionStore((s) => s.addSessionFact);
  const removeFact = useSessionStore((s) => s.removeSessionFact);
  const clearFacts = useSessionStore((s) => s.clearSessionFacts);

  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addFact(trimmed);
    setDraft('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  const hasFacts = facts.length > 0;

  return (
    <div className="px-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
        title="Pinned facts that anchor every prompt — the AI will not contradict them across iterations"
      >
        <span className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px]">push_pin</span>
          Session Facts
          {hasFacts && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-[var(--pm-primary)] rounded-full px-1">
              {facts.length}
            </span>
          )}
        </span>
        <span className={`material-symbols-outlined text-[18px] transition-transform ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-2 pr-1">
          <p className="text-[10px] text-slate-500 leading-relaxed px-1">
            Pin agreed facts to anchor every prompt. The AI won&apos;t contradict these.
          </p>

          {/* Fact list */}
          {hasFacts && (
            <ul className="space-y-1">
              {facts.map((fact, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-2 px-2 py-1.5 bg-white/60 rounded-md border border-slate-200/60"
                >
                  <span className="text-[10px] text-slate-400 font-bold mt-0.5 flex-shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-[11px] text-slate-700 leading-snug flex-1 break-words">
                    {fact}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFact(i)}
                    aria-label="Remove fact"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add fact input */}
          <div className="flex gap-1">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a fact…"
              className="flex-1 min-w-0 px-2 py-1.5 bg-white rounded-md border border-slate-200 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim()}
              className="px-2 py-1.5 bg-[var(--pm-primary)] text-white text-[11px] font-semibold rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              aria-label="Add"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
            </button>
          </div>

          {hasFacts && (
            <button
              type="button"
              onClick={clearFacts}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
