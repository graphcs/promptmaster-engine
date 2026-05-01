'use client';

import type { ChatMessage } from '@/types';
import { MarkdownOutput } from '@/components/shared/markdown-output';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[var(--pm-primary-container)] text-white text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-[var(--surface-container-low)] text-[var(--on-surface)] text-sm">
        <MarkdownOutput content={message.content} />
      </div>
    </div>
  );
}
