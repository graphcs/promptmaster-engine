'use client';

import { PROMPT_STACKS, type PromptStack } from '@/lib/constants';

interface TemplatesRowProps {
  onSelectStack: (stack: PromptStack) => void;
}

export function TemplatesRow({ onSelectStack }: TemplatesRowProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
        Or start with a template
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {PROMPT_STACKS.map((stack) => (
          <button
            key={stack.id}
            type="button"
            onClick={() => onSelectStack(stack)}
            className="text-left rounded-xl bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] transition-colors p-4 space-y-1"
          >
            <div className="text-sm font-semibold text-[var(--on-surface)]">
              {stack.name.replace(/ Stack$/, '')}
            </div>
            <p className="text-[11px] text-[var(--on-surface-variant)] leading-relaxed line-clamp-2">
              {stack.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
