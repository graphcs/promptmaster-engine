'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import { listSessions, loadSession } from '@/lib/supabase/sessions';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { SessionSummary } from '@/types';

interface SessionListProps {
  onNavigate?: () => void;
}

function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function SessionList({ onNavigate }: SessionListProps) {
  const { user } = useAuth();
  const loadSessionToStore = useSessionStore((s) => s.loadSession);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSessions(20);
      setSessions(data);
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  if (!user) {
    return (
      <p className="text-xs text-muted-foreground">Sign in to see session history</p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Loading…</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (sessions.length === 0) {
    return <p className="text-xs text-muted-foreground">No sessions yet</p>;
  }

  const handleLoad = async (sessionId: string) => {
    setLoadingId(sessionId);
    try {
      const session = await loadSession(sessionId);
      if (session) {
        loadSessionToStore(session);
        onNavigate?.();
      }
    } catch {
      // Ignore — user can retry
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <ul className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <li
          key={s.session_id}
          className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium text-foreground/80">
              {toTitleCase(s.mode)} · {s.iterations} {s.iterations === 1 ? 'iter' : 'iters'}
            </span>
            <span className="truncate text-[10px] text-muted-foreground max-w-[140px]">
              {s.objective.slice(0, 50) || 'Untitled'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-[10px]"
            onClick={() => handleLoad(s.session_id)}
            disabled={loadingId === s.session_id}
          >
            {loadingId === s.session_id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Load'
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
