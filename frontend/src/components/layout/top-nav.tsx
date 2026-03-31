'use client';

import { useSessionStore } from '@/stores/session-store';
import type { Phase } from '@/types';

const PHASE_TABS: { key: Phase; label: string }[] = [
  { key: 'input', label: 'Phase: Input' },
  { key: 'review', label: 'Review' },
  { key: 'output', label: 'Output' },
  { key: 'realign', label: 'Realignment' },
  { key: 'summary', label: 'Summary' },
];

export function TopNav() {
  const phase = useSessionStore((s) => s.phase);

  return (
    <header className="fixed top-0 right-0 w-[calc(100%-260px)] h-14 bg-white/80 backdrop-blur-md z-40 border-b border-slate-200/50 flex items-center">
      <div className="flex justify-between items-center px-6 max-w-[720px] mx-auto w-full">
        <nav className="flex gap-6">
          {PHASE_TABS.map((tab) => (
            <span
              key={tab.key}
              className={`text-sm font-medium tracking-tight h-14 flex items-center transition-all duration-200 cursor-default ${
                phase === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-500'
              }`}
            >
              {tab.label}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-slate-900 transition-colors">
            notifications
          </span>
          <button className="bg-[var(--pm-primary)] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-all">
            Save Session
          </button>
        </div>
      </div>
    </header>
  );
}
