'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownOutputProps {
  content: string;
}

export function MarkdownOutput({ content }: MarkdownOutputProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
