'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSessionStore } from '@/stores/session-store';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api/client';
import { DEFAULT_MODEL } from '@/lib/constants';
import { assessTier } from '@/lib/utils';
import { TierBadge } from '@/components/sidebar/tier-badge';
import { SessionModal } from '@/components/shared/session-modal';
import { TemplateModal } from '@/components/shared/template-modal';
import { CustomSelect } from '@/components/shared/custom-select';
import { useTutorial } from '@/components/tutorial/tutorial-provider';
import type { Phase } from '@/types';

const PHASE_LABELS: Record<Phase, string> = {
  input: 'Input',
  review: 'Review',
  output: 'Output',
  realign: 'Realignment',
  summary: 'Summary',
};

interface ModelOption {
  id: string;
  name: string;
  context_length: number;
}

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const resetSession = useSessionStore((s) => s.resetSession);
  const model = useSessionStore((s) => s.model);
  const setModel = useSessionStore((s) => s.setModel);
  const iterations = useSessionStore((s) => s.iterations);
  const phase = useSessionStore((s) => s.phase);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const audience = useSessionStore((s) => s.audience);
  const mode = useSessionStore((s) => s.mode);
  const selfAudit = useSessionStore((s) => s.selfAudit);

  const { user, loading: authLoading, signOut } = useAuth();
  const { replay } = useTutorial();

  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    api.getModels()
      .then((res) => setModels(res.models))
      .catch(() => setModelsError(true));
  }, []);

  const tier = assessTier(0, iterations, {
    constraints,
    outputFormat,
    audience,
    mode,
    selfAudit,
  });

  return (
    <aside className="w-[260px] md:w-[260px] h-screen md:fixed md:left-0 md:top-0 bg-slate-100 flex flex-col p-4 gap-y-4 z-50 overflow-y-auto">
      {/* Brand */}
      <div className="px-2 mb-4 flex items-center gap-3">
        <img src="/logo.svg" alt="PromptMaster" className="w-9 h-9 rounded-lg" />
        <div>
          <h1 className="text-sm font-semibold tracking-tighter text-slate-900">
            PromptMaster Engine
          </h1>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
            Professional AI Workflow
          </p>
        </div>
      </div>

      {/* New Session Button */}
      <button
        data-tutorial="new-session"
        onClick={() => { resetSession(); onNavigate?.(); }}
        className="w-full bg-[var(--pm-primary-container)] text-white py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        New Session
      </button>

      <hr className="border-slate-200" />

      {/* Model Selector */}
      <div className="px-1 space-y-1">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-1">
          Model
        </label>
        {!modelsError ? (
          <CustomSelect
            value={model}
            onChange={(v) => setModel(v)}
            options={
              models.length === 0
                ? [{ value: DEFAULT_MODEL, label: DEFAULT_MODEL }]
                : models.map((m) => ({ value: m.id, label: m.id }))
            }
            disabled={models.length === 0}
            placeholder={DEFAULT_MODEL}
          />
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      <hr className="border-slate-200" />

      {/* Session Info */}
      <div className="px-2 space-y-1">
        {iterations.length > 0 && (
          <p className="text-sm text-slate-600">
            Iterations: <span className="font-semibold text-slate-800">{iterations.length}</span>
          </p>
        )}
        <p className="text-sm text-slate-600">
          Phase: <span className="font-semibold text-slate-800">{PHASE_LABELS[phase]}</span>
        </p>
      </div>

      {/* Tier Badge */}
      <div className="px-1">
        <TierBadge tier={tier} />
      </div>

      {/* Library Nav (authenticated only) */}
      {user && (
        <div className="px-1 space-y-1">
          <button
            type="button"
            onClick={() => setShowSessions(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">history</span>
            Session History
          </button>
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">bookmark</span>
            Prompt Templates
          </button>
        </div>
      )}

      {/* Settings */}
      <div className="px-1">
        <button
          type="button"
          onClick={() => { replay(); onNavigate?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">school</span>
          Replay Tutorial
        </button>
      </div>

      <hr className="border-slate-200" />

      {/* Auth */}
      <div className="mt-auto pt-2 px-1 space-y-2">
        {!authLoading && (
          user ? (
            <>
              <p className="text-xs text-slate-500 truncate">
                Signed in as{' '}
                <span className="font-medium text-slate-700">{user.email}</span>
              </p>
              <button
                onClick={() => signOut()}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">Sign in to save sessions</p>
              <Link
                href="/auth/login"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-200/50 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">login</span>
                Sign In
              </Link>
            </>
          )
        )}
      </div>

      {/* Modals (rendered outside sidebar flow) */}
      <SessionModal open={showSessions} onClose={() => setShowSessions(false)} />
      <TemplateModal open={showTemplates} onClose={() => setShowTemplates(false)} />
    </aside>
  );
}
