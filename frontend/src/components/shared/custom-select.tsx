'use client';

import { useState, useRef, useEffect } from 'react';

interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 bg-[var(--surface-container-low)] rounded-lg text-sm text-left transition-all duration-200 outline-none ${
          open
            ? 'ring-2 ring-[var(--pm-primary)]/40 bg-white'
            : 'hover:bg-[var(--surface-container-high)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${selected ? 'text-[var(--on-surface)]' : 'text-[var(--outline)]'}`}>
          {selected?.label ?? placeholder}
        </span>
        <span
          className={`material-symbols-outlined text-[18px] text-[var(--outline)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl bg-white shadow-lg shadow-black/10 border border-[var(--outline-variant)]/20 py-1 custom-scrollbar">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                option.value === value
                  ? 'bg-[var(--primary-fixed)]/30 text-[var(--pm-primary)] font-medium'
                  : 'text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]'
              }`}
            >
              <span className="block">{option.label}</span>
              {option.description && (
                <span className="block text-[11px] text-[var(--on-surface-variant)] leading-tight mt-0.5">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
