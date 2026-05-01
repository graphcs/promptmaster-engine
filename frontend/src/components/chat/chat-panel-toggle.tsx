'use client';

interface ChatPanelToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatPanelToggle({ isOpen, onToggle }: ChatPanelToggleProps) {
  if (isOpen) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Open chat"
      aria-label="Open chat"
      className="fixed right-6 bottom-6 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-[var(--pm-primary)] text-white shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all"
    >
      <span className="material-symbols-outlined text-[22px]">chat_bubble</span>
    </button>
  );
}
