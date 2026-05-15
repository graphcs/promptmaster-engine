'use client';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function CustomCheckbox({ checked, onChange, ariaLabel, disabled }: CustomCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`flex items-center justify-center h-5 w-5 rounded-md transition-all flex-shrink-0 ${
        checked
          ? 'bg-[var(--pm-primary)] hover:opacity-90'
          : 'bg-[var(--surface-container-high)] hover:bg-[var(--surface-container-highest)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
    >
      {checked && (
        <span
          className="material-symbols-outlined text-white text-[16px]"
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}
        >
          check
        </span>
      )}
    </button>
  );
}
