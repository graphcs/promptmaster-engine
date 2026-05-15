import type { TutorialStep } from './tutorial-overlay';
import { useSessionStore } from '@/stores/session-store';

function expandDetailsElement(selector: string) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(selector);
  if (!el) return;
  let cur: HTMLElement | null = el as HTMLElement;
  while (cur) {
    if (cur.tagName.toLowerCase() === 'details') {
      (cur as HTMLDetailsElement).open = true;
      break;
    }
    cur = cur.parentElement;
  }
}

function openChatPanel() {
  useSessionStore.getState().setChatPanelOpen(true);
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: '[data-tutorial="hero-objective"]',
    title: 'Start with your goal',
    description: 'Describe what you want to do or figure out. The system builds the rest from here.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="generate-setup"]',
    title: 'Let the system suggest',
    description: 'Click Generate Setup and the system recommends a mode, audience, constraints, and format from your objective.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="recommended-approach"]',
    title: 'Refine if you want',
    description: 'Click any chip to refine. Each shows what was picked and why. After Generate Setup runs, this card appears above the input.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="advanced-section"]',
    title: 'Full controls live here',
    description: 'Open Advanced any time for direct control over mode, constraints, format, and more.',
    position: 'top',
    expandTarget: () => expandDetailsElement('[data-tutorial="advanced-section"]'),
  },
  {
    target: '[data-tutorial="continue-review"]',
    title: 'Continue to Review',
    description: 'Once you are happy with the setup, continue to review the assembled prompt before running it.',
    position: 'top',
  },
  {
    target: '[data-tutorial="output-card"]',
    title: 'Your generated answer',
    description: 'This is the structured output. Use the buttons below to iterate, chat, or apply fixes.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="chat-panel"]',
    title: 'Chat about it',
    description: 'The chat panel lets you ask follow-ups without affecting your version. Apply or Save as new version when you have something useful.',
    position: 'left',
    expandTarget: openChatPanel,
  },
  {
    target: '[data-tutorial="why-this-works"]',
    title: 'Why this works',
    description: 'This card translates the technical eval into plain language — a quick read on what is strong or weak.',
    position: 'top',
  },
  {
    target: '[data-tutorial="self-audit"]',
    title: 'Self-Audit → Apply',
    description: 'Click Self-Audit and the system surfaces specific fixes you can apply directly.',
    position: 'top',
  },
];
