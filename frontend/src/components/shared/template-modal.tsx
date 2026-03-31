'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import { listTemplates, loadTemplate, deleteTemplate } from '@/lib/supabase/templates';
import type { TemplateSummary } from '@/types';

const PAGE_SIZE = 5;

interface TemplateModalProps {
  open: boolean;
  onClose: () => void;
}

export function TemplateModal({ open, onClose }: TemplateModalProps) {
  const { user } = useAuth();
  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);
  const setPhase = useSessionStore((s) => s.setPhase);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setLoading(true);
      listTemplates(50)
        .then((data) => setTemplates(data))
        .catch(() => setTemplates([]))
        .finally(() => setLoading(false));
    }
  }, [open, user]);

  if (!open) return null;

  const totalPages = Math.ceil(templates.length / PAGE_SIZE);
  const paginated = templates.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleApply(templateId: string) {
    setApplying(templateId);
    try {
      const template = await loadTemplate(templateId);
      if (template) {
        if (template.objective_hint) setObjective(template.objective_hint);
        setAudience(template.audience);
        setConstraints(template.constraints);
        setOutputFormat(template.output_format);
        setMode(template.mode);
        if (template.mode === 'custom') {
          setCustomMode(template.custom_name, template.custom_preamble, template.custom_tone);
        }
        setPhase('input');
        onClose();
      }
    } catch {
      // silently fail
    } finally {
      setApplying(null);
    }
  }

  async function handleDelete(templateId: string) {
    setDeleting(templateId);
    try {
      await deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.template_id !== templateId));
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
            <span className="material-symbols-outlined text-[var(--pm-primary)]">bookmark</span>
            <h2 className="text-lg font-semibold text-[var(--on-surface)]">Prompt Templates</h2>
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
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-[var(--outline)]">
              <span className="material-symbols-outlined text-[40px] mb-2">bookmarks</span>
              <p className="text-sm">No templates saved yet</p>
              <p className="text-xs mt-1">Save templates from the input phase</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginated.map((t) => (
                <div
                  key={t.template_id}
                  className="flex items-center justify-between p-4 bg-[var(--surface-container-low)] rounded-xl hover:bg-[var(--surface-container-high)] transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-[var(--on-surface)]">
                      {t.name}
                    </p>
                    <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
                      <span className="capitalize">{t.mode}</span> · {t.audience} · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApply(t.template_id)}
                      disabled={applying === t.template_id}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--pm-primary)] rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                      {applying === t.template_id ? 'Applying…' : 'Apply'}
                    </button>
                    <button
                      onClick={() => handleDelete(t.template_id)}
                      disabled={deleting === t.template_id}
                      className="p-1.5 text-[var(--outline)] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Delete template"
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
              Page {page + 1} of {totalPages} · {templates.length} templates
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
