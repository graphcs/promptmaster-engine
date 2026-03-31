'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownOutputProps {
  content: string;
}

export function MarkdownOutput({ content }: MarkdownOutputProps) {
  return (
    <article className="prose prose-sm prose-slate max-w-none prose-headings:text-[var(--on-surface)] prose-headings:font-semibold prose-p:text-[var(--on-surface)] prose-p:leading-relaxed prose-li:text-[var(--on-surface)] prose-strong:text-[var(--on-surface)] prose-a:text-[var(--pm-primary)] prose-code:text-[var(--pm-primary)] prose-code:bg-[var(--surface-container-low)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-[var(--surface-container-low)] prose-pre:rounded-xl">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
