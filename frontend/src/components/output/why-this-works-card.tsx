'use client';

import type { WhyThisWorks } from '@/types';

interface WhyThisWorksCardProps {
  interpretation: WhyThisWorks;
}

export function WhyThisWorksCard({ interpretation }: WhyThisWorksCardProps) {
  const isPositive = interpretation.label === 'Why this works';
  const accentClass = isPositive
    ? 'border-emerald-400 bg-emerald-50/30'
    : 'border-amber-400 bg-amber-50/30';
  const iconName = isPositive ? 'check_circle' : 'auto_fix_high';
  const iconColor = isPositive ? 'text-emerald-600' : 'text-amber-700';

  return (
    <div
      data-tutorial="why-this-works"
      className={`bg-white rounded-2xl shadow-ambient p-6 border-l-4 ${accentClass}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>
          {iconName}
        </span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
          {interpretation.label}
        </h3>
      </div>
      <ul className="space-y-2">
        {interpretation.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--on-surface)] leading-relaxed">
            <span className={`material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0 ${iconColor}`}>
              {isPositive ? 'check' : 'edit'}
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
