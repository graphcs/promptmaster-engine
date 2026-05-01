'use client';

interface ChatActionBarProps {
  onApplyToAnswer: () => void;
  onSaveAsNewVersion: () => void;
  disabled: boolean;
  loading: 'apply' | 'save' | null;
}

export function ChatActionBar({
  onApplyToAnswer,
  onSaveAsNewVersion,
  disabled,
  loading,
}: ChatActionBarProps) {
  return (
    <div className="border-t border-[var(--outline-variant)]/30 px-4 py-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onApplyToAnswer}
        disabled={disabled}
        title={disabled ? 'Send a message first.' : 'Update this version using what you discussed.'}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--on-surface)] bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading === 'apply' ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            Updating…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Apply to answer
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onSaveAsNewVersion}
        disabled={disabled}
        title={disabled ? 'Send a message first.' : 'Create a new version using your chat as a guide.'}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--pm-primary)] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading === 'save' ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Saving…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[14px]">add_circle</span>
            Save as new version
          </>
        )}
      </button>
    </div>
  );
}
