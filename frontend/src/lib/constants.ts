import type { ModeType } from '@/types';

export const MODE_DISPLAY: Record<ModeType, { display_name: string; tagline: string }> = {
  architect: { display_name: 'Architect', tagline: 'Structure, systems, and frameworks' },
  critic: { display_name: 'Critic', tagline: 'Finding weak points and contradictions' },
  clarity: { display_name: 'Clarity', tagline: 'Translating complexity into understanding' },
  coach: { display_name: 'Coach', tagline: 'Motivation and reframing obstacles' },
  therapist: { display_name: 'Therapist', tagline: 'Empathetic exploration and emotional processing' },
  cold_critic: { display_name: 'Cold Critic', tagline: 'Brutal honesty, zero praise, flaw-focused' },
  analyst: { display_name: 'Analyst', tagline: 'Data-driven, methodical, evidence-based reasoning' },
  custom: { display_name: 'Custom', tagline: 'Your own mode — define the persona' },
};

export const CONSTRAINT_PRESETS = [
  'Keep it under 300 words',
  'No jargon or technical language',
  'Include concrete examples',
  'Focus on actionable steps',
  'List pros and cons',
  'Avoid speculation',
  'Use formal tone',
  'Be concise and direct',
];

export const FORMAT_PRESETS = [
  'Bullet points',
  'Numbered list',
  'Short paragraphs',
  'Table or comparison',
  'Step-by-step guide',
  'Executive summary',
  'Q&A format',
];

export const EXAMPLES: Array<{ label: string; objective: string; audience: string; constraints: string; mode: ModeType }> = [
  {
    label: 'Architect — structured planning',
    objective: 'Design a structured plan for launching an online course, including content outline, timeline, platform requirements, and marketing strategy',
    audience: 'General',
    constraints: 'Must be actionable within 90 days, budget under $5K',
    mode: 'architect',
  },
  {
    label: 'Critic — strategy review',
    objective: 'Evaluate this product strategy: We plan to launch a social media app targeting users aged 18-25 by competing directly with Instagram on photo sharing',
    audience: 'Executive',
    constraints: 'Budget is $50K, team of 3 developers, 6-month timeline',
    mode: 'critic',
  },
  {
    label: 'Clarity — simplify a concept',
    objective: 'Explain how supply chain logistics work, from manufacturer to end consumer, including the role of distributors, warehouses, and last-mile delivery',
    audience: 'Student',
    constraints: 'No jargon, use everyday analogies, under 300 words',
    mode: 'clarity',
  },
  {
    label: 'Coach — personal roadmap',
    objective: "I'm starting a new management role and feeling overwhelmed. Help me create a 30-day plan to build trust with my team and get up to speed",
    audience: 'General',
    constraints: 'Focus on practical steps, not theory. Include daily time commitments under 2 hours',
    mode: 'coach',
  },
  {
    label: 'Therapist — explore a dilemma',
    objective: "I'm feeling overwhelmed and burned out at work but I don't know if I should quit or push through. Help me explore what's really going on.",
    audience: 'General',
    constraints: 'Focus on understanding feelings, not giving career advice yet',
    mode: 'therapist',
  },
  {
    label: 'Cold Critic — tear apart a pitch',
    objective: "Our startup pitch: We're building an AI-powered personal finance app that uses GPT to give investment advice to millennials. We plan to launch in 3 months with a team of 2.",
    audience: 'Executive',
    constraints: 'No praise. Only risks, flaws, and problems.',
    mode: 'cold_critic',
  },
  {
    label: 'Analyst — market research',
    objective: 'Analyze the remote work software market: key players, trends, growth drivers, and risks for a new entrant targeting small businesses',
    audience: 'Executive',
    constraints: 'Separate facts from assumptions. Quantify where possible.',
    mode: 'analyst',
  },
  {
    label: 'Clarity — refine a rough idea',
    objective: "I have a vague idea about improving team productivity at my company, but I'm not sure where to start or what the real problem is. Help me structure this into something clear and actionable.",
    audience: 'General',
    constraints: 'Focus on clarifying the core problem before suggesting solutions',
    mode: 'clarity',
  },
];

export const AUDIENCE_OPTIONS = ['General', 'Technical', 'Executive', 'Academic', 'Student', 'Other'];

export const TIER_INFO = {
  1: { name: 'Prompt Starter', color: '#9CA3AF', bg: '#F3F4F6' },
  2: { name: 'Prompt Practitioner', color: '#3B82F6', bg: '#EFF6FF' },
  3: { name: 'Prompt Architect', color: '#8B5CF6', bg: '#F5F3FF' },
  4: { name: 'PromptMaster', color: '#F59E0B', bg: '#FFFBEB' },
} as const;

export const DEFAULT_MODEL = 'openai/gpt-5.4';
