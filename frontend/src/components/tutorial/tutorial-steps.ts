import type { TutorialStep } from './tutorial-overlay';

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: '[data-tutorial="mode-grid"]',
    title: 'Choose Your Mode',
    description:
      'Start by selecting a mode. Each mode sets a different AI persona — Architect for structure, Critic for finding flaws, Clarity for simplification, and more. Click a card to see what it does.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="objective"]',
    title: 'Define Your Objective',
    description:
      'Describe what you want the AI to produce. Be specific — the more detail you provide, the more aligned the output will be. This is the most important field.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="audience"]',
    title: 'Set Your Audience',
    description:
      'Choose who the output is for. The AI adjusts its tone, complexity, and terminology based on the audience — Technical, Executive, Student, etc.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="constraint-presets"]',
    title: 'Add Constraints',
    description:
      'Click preset constraint chips to apply common rules like "Keep it under 300 words" or "No jargon." You can also type custom constraints in the text field below.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="format-presets"]',
    title: 'Choose Output Format',
    description:
      'Select how you want the output structured — bullet points, numbered list, executive summary, etc. This helps the AI organize its response.',
    position: 'top',
  },
  {
    target: '[data-tutorial="assemble-btn"]',
    title: 'Assemble Your Prompt',
    description:
      'Click this to build an optimized prompt from your inputs. PromptMaster adds mode locking, anchoring, and invisible scaffolding behind the scenes.',
    position: 'top',
  },
  {
    target: '[data-tutorial="phase-tabs"]',
    title: 'Track Your Progress',
    description:
      'The top bar shows which phase you\'re in. After assembling, you\'ll Review the prompt, then Execute to generate output with evaluation scores.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="new-session"]',
    title: 'Start Fresh Anytime',
    description:
      'Click "New Session" to reset everything and start a new prompt. Your previous sessions are saved if you\'re signed in. You\'re all set — let\'s build your first prompt!',
    position: 'bottom',
  },
];
