'use client';

import { TIER_INFO } from '@/lib/constants';

interface TierBadgeProps {
  tier: 1 | 2 | 3 | 4;
}

export function TierBadge({ tier }: TierBadgeProps) {
  const info = TIER_INFO[tier];
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: info.color, backgroundColor: info.bg }}
    >
      <span className="text-sm font-bold" style={{ color: info.color }}>
        Tier {tier}
      </span>{' '}
      <span className="text-sm font-medium" style={{ color: info.color }}>
        {info.name}
      </span>
    </div>
  );
}
