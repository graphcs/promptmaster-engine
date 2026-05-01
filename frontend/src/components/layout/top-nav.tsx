'use client';

import { useSessionStore } from '@/stores/session-store';
import type { Phase } from '@/types';

const PHASE_TABS: { key: Phase; label: string; shortLabel: string }[] = [
  { key: 'input', label: 'Phase: Input', shortLabel: 'Input' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
  { key: 'output', label: 'Output', shortLabel: 'Output' },
  { key: 'realign', label: 'Realignment', shortLabel: 'Realign' },
  { key: 'summary', label: 'Summary', shortLabel: 'Summary' },
];

interface TopNavProps {
  onMenuToggle?: () => void;
}

export function TopNav({ onMenuToggle }: TopNavProps) {
  const phase = useSessionStore((s) => s.phase);
  const chatPanelOpen = useSessionStore((s) => s.chatPanelOpen);
  const toggleChatPanel = useSessionStore((s) => s.toggleChatPanel);

  return (
    <header className="fixed top-0 left-0 md:left-[260px] right-0 h-14 bg-white/80 backdrop-blur-md z-40 border-b border-slate-200/50 flex items-center">
      <div className="flex items-center gap-4 px-4 md:px-6 max-w-[720px] mx-auto w-full">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          <span className="material-symbols-outlined text-[22px] text-slate-600">menu</span>
        </button>

        {/* Mobile: app name */}
        <span className="md:hidden text-sm font-semibold text-slate-800 tracking-tight">
          PromptMaster
        </span>

        {/* Phase tabs */}
        <nav className="flex gap-4 md:gap-6 overflow-x-auto flex-1" data-tutorial="phase-tabs">
          {PHASE_TABS.map((tab) => (
            <span
              key={tab.key}
              className={`text-xs md:text-sm font-medium tracking-tight h-14 flex items-center whitespace-nowrap transition-all duration-200 cursor-default ${
                phase === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-500'
              }`}
            >
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.shortLabel}</span>
            </span>
          ))}
        </nav>

        {/* Chat toggle — visible only on Output phase, desktop */}
        {phase === 'output' && (
          <button
            type="button"
            onClick={toggleChatPanel}
            title={chatPanelOpen ? 'Close chat' : 'Open chat'}
            aria-label={chatPanelOpen ? 'Close chat' : 'Open chat'}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={chatPanelOpen ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              chat_bubble
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
