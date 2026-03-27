'use client';

import { useSessionStore } from '@/stores/session-store';
import { useAuth } from '@/hooks/use-auth';
import { PhaseIndicator } from '@/components/shared/phase-indicator';
import { TierBadge } from '@/components/sidebar/tier-badge';
import { ModelSelector } from '@/components/sidebar/model-selector';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, User, Zap } from 'lucide-react';

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const phase = useSessionStore((s) => s.phase);
  const iterations = useSessionStore((s) => s.iterations);
  const resetSession = useSessionStore((s) => s.resetSession);
  const { user, loading } = useAuth();

  const handleNewSession = () => {
    resetSession();
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col gap-0 overflow-y-auto">
      {/* Branding */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight">PromptMaster</span>
          <span className="text-[10px] text-muted-foreground">Engine</span>
        </div>
      </div>

      <Separator />

      {/* User info */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xs font-medium truncate max-w-[180px]">
                {user.user_metadata?.full_name || user.email || 'User'}
              </span>
              {user.user_metadata?.full_name && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                  {user.email}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">Sign in to save sessions</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Model selector */}
      <div className="px-4 py-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Model
        </p>
        <ModelSelector />
      </div>

      <Separator />

      {/* Phase indicator */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Current Phase
        </p>
        <PhaseIndicator currentPhase={phase} />
      </div>

      {/* Iteration count */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">Iterations</span>
          <span className="text-sm font-semibold tabular-nums">{iterations.length}</span>
        </div>
      </div>

      {/* Tier badge */}
      <div className="px-4 py-2">
        <TierBadge tier={1} />
      </div>

      <Separator className="mt-1" />

      {/* New Session button */}
      <div className="px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleNewSession}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      <Separator />

      {/* Session history */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Sessions
        </p>
        {user ? (
          <p className="text-xs text-muted-foreground">No sessions yet</p>
        ) : (
          <p className="text-xs text-muted-foreground">Sign in to see history</p>
        )}
      </div>

      <Separator />

      {/* Template list */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Templates
        </p>
        {user ? (
          <p className="text-xs text-muted-foreground">No templates saved</p>
        ) : (
          <p className="text-xs text-muted-foreground">Sign in to see templates</p>
        )}
      </div>
    </div>
  );
}
