'use client';

import { useSessionStore } from '@/stores/session-store';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const resetSession = useSessionStore((s) => s.resetSession);

  return (
    <aside className="w-[260px] h-screen fixed left-0 top-0 bg-slate-100 flex flex-col p-4 gap-y-4 z-50">
      {/* Brand */}
      <div className="px-2 mb-4">
        <h1 className="text-lg font-semibold tracking-tighter text-slate-900">
          PromptMaster Engine
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">
          Professional AI Workflow
        </p>
      </div>

      {/* New Session Button */}
      <button
        onClick={() => { resetSession(); onNavigate?.(); }}
        className="w-full bg-[var(--pm-primary-container)] text-white py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 mb-4"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        New Session
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        <a href="#" className="flex items-center gap-3 px-3 py-2 bg-slate-200 text-blue-700 rounded-lg text-sm font-medium transition-colors">
          <span className="material-symbols-outlined">dashboard</span>
          Dashboard
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors">
          <span className="material-symbols-outlined">folder_open</span>
          Library
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors">
          <span className="material-symbols-outlined">settings</span>
          Settings
        </a>
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto pt-4 space-y-1">
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors">
          <span className="material-symbols-outlined">smart_toy</span>
          Model Selector
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors">
          <span className="material-symbols-outlined">verified</span>
          Pro Tier
        </a>
      </div>
    </aside>
  );
}
