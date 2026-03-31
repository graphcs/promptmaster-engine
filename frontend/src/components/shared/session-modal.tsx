'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import { listSessions, loadSession, deleteSession } from '@/lib/supabase/sessions';
import type { SessionSummary, Session } from '@/types';

const PAGE_SIZE = 5;

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
}

export function SessionModal({ open, onClose }: SessionModalProps) {
  const { user } = useAuth();
  const storeLoadSession = useSessionStore((s) => s.loadSession);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setLoading(true);
      listSessions(50)
        .then((data) => setSessions(data))
        .catch(() => setSessions([]))
        .finally(() => setLoading(false));
    }
  }, [open, user]);

  if (!open) return null;

  const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
  const paginated = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleLoad(sessionId: string) {
    setLoadingSession(sessionId);
    try {
      const session = await loadSession(sessionId);
      if (session) {
        storeLoadSession(session);
        onClose();
      }
    } catch {
      // silently fail
    } finally {
      setLoadingSession(null);
    }
  }

  async function handleDelete(sessionId: string) {
    setDeleting(sessionId);
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--surface-container-high)]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[var(--pm-primary)]">history</span>
            <h2 className="text-lg font-semibold text-[var(--on-surface)]">Session History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--surface-container-high)] transition-colors"
          >
            <span className="material-symbols-outlined text-[var(--outline)]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-[200px]">
              <span className="material-symbols-outlined text-[var(--outline)] animate-spin">progress_activity</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-[var(--outline)]">
              <span className="material-symbols-outlined text-[40px] mb-2">folder_open</span>
              <p className="text-sm">No saved sessions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginated.map((s) => (
                <div
                  key={s.session_id}
                  className="flex items-center justify-between p-4 bg-[var(--surface-container-low)] rounded-xl hover:bg-[var(--surface-container-high)] transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-[var(--on-surface)] truncate">
                      {s.objective || 'Untitled session'}
                    </p>
                    <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
                      <span className="capitalize">{s.mode}</span> · {s.iterations} iteration{s.iterations !== 1 ? 's' : ''} · {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLoad(s.session_id)}
                      disabled={loadingSession === s.session_id}
                      className="px-3 py-1.5 text-xs font-medium text-[var(--pm-primary)] bg-white border border-[var(--pm-primary)]/20 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {loadingSession === s.session_id ? 'Loading…' : 'Load'}
                    </button>
                    <button
                      onClick={() => handleDelete(s.session_id)}
                      disabled={deleting === s.session_id}
                      className="p-1.5 text-[var(--outline)] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Delete session"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--surface-container-high)]">
            <p className="text-xs text-[var(--outline)]">
              Page {page + 1} of {totalPages} · {sessions.length} sessions
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs font-medium rounded-lg border border-[var(--outline-variant)]/30 hover:bg-[var(--surface-container-low)] transition-colors disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs font-medium rounded-lg border border-[var(--outline-variant)]/30 hover:bg-[var(--surface-container-low)] transition-colors disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
