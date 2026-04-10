'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownOutputProps {
  content: string;
}

export function MarkdownOutput({ content }: MarkdownOutputProps) {
  return (
    <article className="prose prose-sm prose-slate max-w-none prose-headings:text-[var(--on-surface)] prose-headings:font-semibold prose-p:text-[var(--on-surface)] prose-p:leading-relaxed prose-li:text-[var(--on-surface)] prose-strong:text-[var(--on-surface)] prose-a:text-[var(--pm-primary)] prose-code:text-[var(--pm-primary)] prose-code:bg-[var(--surface-container-low)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-[var(--surface-container-low)] prose-pre:rounded-xl prose-table:w-full prose-th:bg-[var(--surface-container-low)] prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:border-t prose-td:border-[var(--outline-variant)]/20">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
