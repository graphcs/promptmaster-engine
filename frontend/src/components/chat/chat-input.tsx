'use client';

import { useState } from 'react';

interface ChatInputProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="border-t border-[var(--outline-variant)]/30 px-4 py-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type a message…"
        rows={2}
        disabled={disabled}
        className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 focus:bg-white transition-all duration-200 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--on-surface-variant)]">Cmd+Enter to send</span>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[14px]">send</span>
          Send
        </button>
      </div>
    </div>
  );
}
