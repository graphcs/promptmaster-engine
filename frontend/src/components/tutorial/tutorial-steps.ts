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
      'Click this to build an optimized prompt from your inputs. PromptMaster structures the request using roles, constraints, and refinement techniques behind the scenes.',
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
    target: '',
    title: 'You\'re All Set!',
    description:
      'You now know the essentials. Use "New Session" in the sidebar to start fresh anytime. Your sessions are saved automatically if you\'re signed in. Go ahead — build your first prompt!',
    position: 'bottom',
  },
];
