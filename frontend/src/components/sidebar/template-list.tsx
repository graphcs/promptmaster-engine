'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import { listTemplates, loadTemplate, deleteTemplate } from '@/lib/supabase/templates';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import type { TemplateSummary } from '@/types';

interface TemplateListProps {
  onNavigate?: () => void;
}

export function TemplateList({ onNavigate }: TemplateListProps) {
  const { user } = useAuth();
  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listTemplates(50);
      setTemplates(data);
    } catch {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (!user) {
    return (
      <p className="text-xs text-muted-foreground">Sign in to see templates</p>
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

  if (templates.length === 0) {
    return <p className="text-xs text-muted-foreground">No templates saved</p>;
  }

  const handleApply = async (templateId: string) => {
    setApplyingId(templateId);
    try {
      const template = await loadTemplate(templateId);
      if (template) {
        setMode(template.mode);
        setAudience(template.audience);
        setConstraints(template.constraints);
        setOutputFormat(template.output_format);
        if (template.objective_hint) setObjective(template.objective_hint);
        if (template.mode === 'custom') {
          setCustomMode(template.custom_name, template.custom_preamble, template.custom_tone);
        }
        onNavigate?.();
      }
    } catch {
      // Ignore — user can retry
    } finally {
      setApplyingId(null);
    }
  };

  const handleDelete = async (templateId: string) => {
    setDeletingId(templateId);
    try {
      await deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.template_id !== templateId));
    } catch {
      // Ignore — user can retry
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ul className="flex flex-col gap-1.5">
      {templates.map((t) => (
        <li
          key={t.template_id}
          className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[11px] font-medium text-foreground/80 max-w-[120px]">
              {t.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t.mode} · {t.audience}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => handleApply(t.template_id)}
              disabled={applyingId === t.template_id || deletingId === t.template_id}
            >
              {applyingId === t.template_id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Apply'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(t.template_id)}
              disabled={deletingId === t.template_id || applyingId === t.template_id}
            >
              {deletingId === t.template_id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
