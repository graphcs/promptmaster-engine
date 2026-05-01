'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';
import { ChatMessageBubble } from './chat-message-bubble';

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
}

export function ChatMessageList({ messages, loading }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-sm text-[var(--on-surface-variant)] italic">
          Ask a follow-up about this answer, or just think out loud.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m) => (
        <ChatMessageBubble key={m.id} message={m} />
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[var(--surface-container-low)]">
            <div className="flex gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse [animation-delay:0.15s]" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse [animation-delay:0.3s]" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
