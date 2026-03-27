'use client';

import { useSessionStore } from '@/stores/session-store';
import { EXAMPLES } from '@/lib/constants';
import { Button } from '@/components/ui/button';

export function ExampleButtons() {
  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setMode = useSessionStore((s) => s.setMode);
  const setOnboardingSeen = useSessionStore((s) => s.setOnboardingSeen);

  function fillExample(index: number) {
    const example = EXAMPLES[index];
    setObjective(example.objective);
    setAudience(example.audience);
    setConstraints(example.constraints);
    setMode(example.mode);
    setOnboardingSeen(true);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {EXAMPLES.map((example, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => fillExample(index)}
          className="h-auto py-2 px-3 text-left text-xs leading-snug whitespace-normal"
        >
          {example.label}
        </Button>
      ))}
    </div>
  );
}
