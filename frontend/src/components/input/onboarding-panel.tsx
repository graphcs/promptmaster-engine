'use client';

import { useSessionStore } from '@/stores/session-store';
import { EXAMPLES } from '@/lib/constants';
import { Button } from '@/components/ui/button';

export function OnboardingPanel() {
  const onboardingSeen = useSessionStore((s) => s.onboardingSeen);
  const setOnboardingSeen = useSessionStore((s) => s.setOnboardingSeen);
  const setObjective = useSessionStore((s) => s.setObjective);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setMode = useSessionStore((s) => s.setMode);

  if (onboardingSeen) return null;

  function tryFirstExample() {
    const example = EXAMPLES[0];
    setObjective(example.objective);
    setAudience(example.audience);
    setConstraints(example.constraints);
    setMode(example.mode);
    setOnboardingSeen(true);
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-800/50 dark:bg-blue-950/30">
      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
        Welcome to PromptMaster Engine
      </h3>
      <ol className="space-y-1 text-xs text-blue-800 dark:text-blue-200 mb-4 list-decimal list-inside">
        <li>Pick a mode — each mode shapes how the AI reasons and responds</li>
        <li>Describe your objective — what do you want to achieve?</li>
        <li>Click Assemble Prompt to generate a structured, optimised prompt</li>
      </ol>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={tryFirstExample}
          className="h-7 text-xs"
        >
          Try an example
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOnboardingSeen(true)}
          className="h-7 text-xs border-blue-300 text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900/40"
        >
          Got it, let me start
        </Button>
      </div>
    </div>
  );
}
