# Next.js Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend for PromptMaster Engine with full feature parity to the Streamlit app, using the FastAPI backend (already built) for LLM operations and Supabase JS SDK for auth/data.

**Architecture:** Single-page workspace app with sidebar navigation. The main content area switches between 5 workflow phases via a Zustand store. Auth handled by Supabase JS SDK with middleware for session refresh. LLM calls go to the FastAPI backend. Sessions/templates/usage stored directly in Supabase via client SDK.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui, Zustand, @supabase/ssr, Plus Jakarta Sans font, Lucide icons

**Design System:** `design-system/promptmaster-engine/MASTER.md` (global) + `design-system/promptmaster-engine/pages/session-workspace.md` (score badges, tier colors, dark mode)

---

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout: font, theme, providers
│   │   ├── page.tsx                # Redirect to /session
│   │   ├── globals.css             # Tailwind + custom tokens
│   │   ├── auth/
│   │   │   ├── login/page.tsx      # Email/password + Google OAuth
│   │   │   ├── signup/page.tsx     # Registration form
│   │   │   └── callback/page.tsx   # OAuth PKCE callback handler
│   │   └── session/
│   │       ├── layout.tsx          # Sidebar + main content shell
│   │       └── page.tsx            # Phase router (renders active phase)
│   ├── components/
│   │   ├── phases/
│   │   │   ├── input-phase.tsx     # Step 1: objective, mode, constraints
│   │   │   ├── review-phase.tsx    # Step 2: prompt review + execute
│   │   │   ├── output-phase.tsx    # Step 3: output + evaluation + suggestions
│   │   │   ├── realign-phase.tsx   # Step 4: realignment prompt
│   │   │   └── summary-phase.tsx   # Step 5: final output + export + audit
│   │   ├── sidebar/
│   │   │   ├── app-sidebar.tsx     # Full sidebar component
│   │   │   ├── model-selector.tsx  # Model dropdown
│   │   │   ├── tier-badge.tsx      # Tier 1-4 display
│   │   │   ├── session-list.tsx    # Saved session history
│   │   │   └── template-list.tsx   # Saved templates
│   │   ├── evaluation/
│   │   │   ├── score-badge.tsx     # Colored pill badge
│   │   │   ├── eval-card.tsx       # Quality Scores + Scope Check
│   │   │   ├── suggestions.tsx     # LLM-powered next-step guidance
│   │   │   ├── iteration-history.tsx  # Past iterations with trends
│   │   │   └── iteration-comparison.tsx  # Side-by-side compare
│   │   ├── input/
│   │   │   ├── mode-selector.tsx   # Mode dropdown with taglines
│   │   │   ├── constraint-chips.tsx # Preset + textarea combo
│   │   │   ├── format-chips.tsx    # Preset + textarea combo
│   │   │   ├── example-buttons.tsx # Quick-fill examples
│   │   │   └── onboarding-panel.tsx # First-time user guide
│   │   └── shared/
│   │       ├── phase-indicator.tsx # 5-step progress stepper
│   │       ├── markdown-output.tsx # Rendered markdown display
│   │       └── loading-spinner.tsx # Consistent loading state
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # createBrowserClient
│   │   │   ├── server.ts           # createServerClient (middleware)
│   │   │   ├── sessions.ts         # Session CRUD
│   │   │   ├── templates.ts        # Template CRUD
│   │   │   └── usage.ts            # Usage tracking inserts
│   │   ├── api/
│   │   │   └── client.ts           # FastAPI fetch wrapper
│   │   ├── constants.ts            # Modes display, presets, examples
│   │   └── utils.ts                # Tier calculation, score helpers
│   ├── stores/
│   │   └── session-store.ts        # Zustand store for workflow state
│   ├── hooks/
│   │   └── use-auth.ts             # Auth state hook
│   └── types/
│       └── index.ts                # TypeScript mirrors of Pydantic schemas
├── middleware.ts                    # Supabase session refresh
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json                  # shadcn/ui config
└── .env.local.example
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `frontend/` via create-next-app
- Create: `frontend/.env.local.example`
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/constants.ts`

- [ ] **Step 1: Create Next.js project**

```bash
cd /root/code/PromptMaster/.claude/worktrees/nextjs-migration
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Select defaults when prompted.

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install zustand @supabase/ssr @supabase/supabase-js react-markdown
npx shadcn@latest init -d
npx shadcn@latest add button card input textarea select label badge separator tabs dialog dropdown-menu sheet toast tooltip scroll-area
```

- [ ] **Step 3: Create .env.local.example**

Write to `frontend/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- [ ] **Step 4: Create TypeScript type definitions**

Write to `frontend/src/types/index.ts`:
```typescript
export type ModeType = 'architect' | 'critic' | 'clarity' | 'coach' | 'therapist' | 'cold_critic' | 'analyst' | 'custom';
export type ScoreLevel = 'Low' | 'Medium' | 'High';
export type Phase = 'input' | 'review' | 'output' | 'realign' | 'summary';

export interface PMInput {
  objective: string;
  audience: string;
  constraints: string;
  output_format: string;
  mode: ModeType;
}

export interface AssembledPrompt {
  system_prompt: string;
  user_prompt: string;
  scaffolding_notes: string;
}

export interface DimensionScore {
  score: ScoreLevel;
  explanation: string;
}

export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
}

export interface Iteration {
  iteration_number: number;
  prompt_sent: string;
  system_prompt_used: string;
  output: string;
  mode: ModeType;
  evaluation: EvaluationResult | null;
}

export interface PromptTemplate {
  template_id: string;
  name: string;
  created_at: string;
  mode: ModeType;
  audience: string;
  constraints: string;
  output_format: string;
  objective_hint: string;
  custom_name: string;
  custom_preamble: string;
  custom_tone: string;
}

export interface Session {
  session_id: string;
  created_at: string;
  objective: string;
  audience: string;
  constraints: string;
  output_format: string;
  mode: ModeType;
  model: string;
  iterations: Iteration[];
  finalized: boolean;
}

export interface ModeConfig {
  display_name: string;
  tagline: string;
  tone: string;
}

export interface SessionSummary {
  session_id: string;
  objective: string;
  mode: string;
  iterations: number;
  created_at: string;
  finalized: boolean;
}

export interface TemplateSummary {
  template_id: string;
  name: string;
  mode: string;
  audience: string;
  created_at: string;
}
```

- [ ] **Step 5: Create constants**

Write to `frontend/src/lib/constants.ts`:
```typescript
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

export const EXAMPLES = [
  {
    label: 'Architect — structured planning',
    objective: 'Design a structured plan for launching an online course, including content outline, timeline, platform requirements, and marketing strategy',
    audience: 'General',
    constraints: 'Must be actionable within 90 days, budget under $5K',
    mode: 'architect' as ModeType,
  },
  {
    label: 'Critic — strategy review',
    objective: 'Evaluate this product strategy: We plan to launch a social media app targeting users aged 18-25 by competing directly with Instagram on photo sharing',
    audience: 'Executive',
    constraints: 'Budget is $50K, team of 3 developers, 6-month timeline',
    mode: 'critic' as ModeType,
  },
  {
    label: 'Clarity — simplify a concept',
    objective: 'Explain how supply chain logistics work, from manufacturer to end consumer, including the role of distributors, warehouses, and last-mile delivery',
    audience: 'Student',
    constraints: 'No jargon, use everyday analogies, under 300 words',
    mode: 'clarity' as ModeType,
  },
  {
    label: 'Coach — personal roadmap',
    objective: "I'm starting a new management role and feeling overwhelmed. Help me create a 30-day plan to build trust with my team and get up to speed",
    audience: 'General',
    constraints: 'Focus on practical steps, not theory. Include daily time commitments under 2 hours',
    mode: 'coach' as ModeType,
  },
  {
    label: 'Therapist — explore a dilemma',
    objective: "I'm feeling overwhelmed and burned out at work but I don't know if I should quit or push through. Help me explore what's really going on.",
    audience: 'General',
    constraints: 'Focus on understanding feelings, not giving career advice yet',
    mode: 'therapist' as ModeType,
  },
  {
    label: 'Cold Critic — tear apart a pitch',
    objective: "Our startup pitch: We're building an AI-powered personal finance app that uses GPT to give investment advice to millennials. We plan to launch in 3 months with a team of 2.",
    audience: 'Executive',
    constraints: 'No praise. Only risks, flaws, and problems.',
    mode: 'cold_critic' as ModeType,
  },
  {
    label: 'Analyst — market research',
    objective: 'Analyze the remote work software market: key players, trends, growth drivers, and risks for a new entrant targeting small businesses',
    audience: 'Executive',
    constraints: 'Separate facts from assumptions. Quantify where possible.',
    mode: 'analyst' as ModeType,
  },
  {
    label: 'Clarity — refine a rough idea',
    objective: "I have a vague idea about improving team productivity at my company, but I'm not sure where to start or what the real problem is. Help me structure this into something clear and actionable.",
    audience: 'General',
    constraints: 'Focus on clarifying the core problem before suggesting solutions',
    mode: 'clarity' as ModeType,
  },
];

export const AUDIENCE_OPTIONS = ['General', 'Technical', 'Executive', 'Academic', 'Student', 'Other'];

export const TIER_INFO = {
  1: { name: 'Prompt Starter', color: '#9CA3AF', bg: '#F3F4F6' },
  2: { name: 'Prompt Practitioner', color: '#3B82F6', bg: '#EFF6FF' },
  3: { name: 'Prompt Architect', color: '#8B5CF6', bg: '#F5F3FF' },
  4: { name: 'PromptMaster', color: '#F59E0B', bg: '#FFFBEB' },
} as const;
```

- [ ] **Step 6: Update globals.css with design tokens**

Replace `frontend/src/app/globals.css` with Tailwind base + Plus Jakarta Sans font import + custom CSS variables from the design system.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Next.js frontend with types, constants, shadcn/ui"
```

---

## Task 2: Supabase Client + Auth

**Files:**
- Create: `frontend/src/lib/supabase/client.ts`
- Create: `frontend/src/lib/supabase/server.ts`
- Create: `frontend/middleware.ts`
- Create: `frontend/src/hooks/use-auth.ts`
- Create: `frontend/src/app/auth/login/page.tsx`
- Create: `frontend/src/app/auth/signup/page.tsx`
- Create: `frontend/src/app/auth/callback/page.tsx`

- [ ] **Step 1: Create Supabase browser client**

Write `frontend/src/lib/supabase/client.ts` using `createBrowserClient` from `@supabase/ssr`.

- [ ] **Step 2: Create Supabase server client**

Write `frontend/src/lib/supabase/server.ts` using `createServerClient` for middleware cookie handling.

- [ ] **Step 3: Create middleware for session refresh**

Write `frontend/middleware.ts` that refreshes the Supabase session on every request and protects `/session` route for unauthenticated users.

- [ ] **Step 4: Create auth hook**

Write `frontend/src/hooks/use-auth.ts` — a hook that provides `user`, `signIn`, `signUp`, `signOut`, `signInWithGoogle`, and `loading` state.

- [ ] **Step 5: Build login page**

Write `frontend/src/app/auth/login/page.tsx` with email/password form + Google OAuth button. Uses shadcn/ui Card, Input, Button, Label.

- [ ] **Step 6: Build signup page**

Write `frontend/src/app/auth/signup/page.tsx` with full name + email + password form.

- [ ] **Step 7: Build callback page**

Write `frontend/src/app/auth/callback/page.tsx` — handles PKCE code exchange, token_hash verification, and implicit flow fallback (same 3 flows as Python `auth.py`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/supabase/ frontend/middleware.ts frontend/src/hooks/ frontend/src/app/auth/
git commit -m "feat: Supabase auth with Google OAuth, email/password, session refresh"
```

---

## Task 3: Zustand Store + API Client + FastAPI Integration

**Files:**
- Create: `frontend/src/stores/session-store.ts`
- Create: `frontend/src/lib/api/client.ts`
- Create: `frontend/src/lib/utils.ts`

- [ ] **Step 1: Create FastAPI client**

Write `frontend/src/lib/api/client.ts` — a fetch wrapper class `PromptMasterAPI` with methods for all 9 API endpoints. Each method calls the FastAPI backend at `NEXT_PUBLIC_API_URL`. No auth token needed (backend is a pure LLM proxy).

Methods:
- `buildPrompt(input: PMInput): Promise<AssembledPrompt>`
- `runIteration(req): Promise<{ iteration: Iteration; suggestions: string[] }>`
- `buildRealignment(req): Promise<{ realignment_prompt: string }>`
- `runSelfAudit(req): Promise<{ audit: string }>`
- `hardResetLessons(req): Promise<{ lessons: string }>`
- `formatSummary(req): Promise<{ summary: string }>`
- `exportSession(req): Promise<{ json: string }>`
- `getModels(): Promise<{ models: Array<{ id: string; name: string; context_length: number }> }>`
- `getModes(): Promise<Record<string, ModeConfig>>`

- [ ] **Step 2: Create Zustand store**

Write `frontend/src/stores/session-store.ts` — mirrors the Streamlit session state defaults. Includes all fields + actions: `setPhase`, `setInputs`, `setAssembled`, `appendIteration`, `resetSession`, `loadSession`, `setError`, etc.

- [ ] **Step 3: Create utils**

Write `frontend/src/lib/utils.ts` — `assessTier()` function (port from app.py lines 274-329), `needsRealignment()` helper, `cn()` classname merge utility.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/ frontend/src/lib/api/ frontend/src/lib/utils.ts
git commit -m "feat: Zustand store, FastAPI client, utility functions"
```

---

## Task 4: App Layout + Sidebar

**Files:**
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/session/layout.tsx`
- Create: `frontend/src/app/session/page.tsx`
- Create: `frontend/src/components/sidebar/app-sidebar.tsx`
- Create: `frontend/src/components/sidebar/model-selector.tsx`
- Create: `frontend/src/components/sidebar/tier-badge.tsx`
- Create: `frontend/src/components/shared/phase-indicator.tsx`

- [ ] **Step 1: Build root layout**

Write `frontend/src/app/layout.tsx` — includes Plus Jakarta Sans font via `next/font/google`, ThemeProvider (if using next-themes for dark mode), and metadata.

- [ ] **Step 2: Build root page (redirect)**

Write `frontend/src/app/page.tsx` — redirects to `/session` if authenticated, `/auth/login` if not.

- [ ] **Step 3: Build session layout with sidebar**

Write `frontend/src/app/session/layout.tsx` — sidebar on the left (280px desktop, drawer on mobile), main content area on the right.

- [ ] **Step 4: Build sidebar**

Write `frontend/src/components/sidebar/app-sidebar.tsx` — contains:
- App title + caption
- User info / sign in button
- Model selector dropdown
- Phase indicator (current phase)
- Tier badge
- Iteration count
- "New Session" button
- Session history list (from Supabase)
- Template list (from Supabase)

- [ ] **Step 5: Build model selector**

Write `frontend/src/components/sidebar/model-selector.tsx` — fetches models from `GET /api/models`, displays as Select dropdown, defaults to `openai/gpt-5.4`.

- [ ] **Step 6: Build tier badge**

Write `frontend/src/components/sidebar/tier-badge.tsx` — uses `assessTier()` from utils, renders colored badge with tier name and next-level hint.

- [ ] **Step 7: Build phase indicator**

Write `frontend/src/components/shared/phase-indicator.tsx` — 5-step horizontal stepper showing current phase, completed phases with checkmarks, and upcoming phases grayed out.

- [ ] **Step 8: Build session page (phase router)**

Write `frontend/src/app/session/page.tsx` — reads `phase` from Zustand store, renders the corresponding phase component (InputPhase, ReviewPhase, OutputPhase, RealignPhase, SummaryPhase).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/ frontend/src/components/sidebar/ frontend/src/components/shared/
git commit -m "feat: app layout with sidebar, phase routing, model selector, tier badge"
```

---

## Task 5: Input Phase

**Files:**
- Create: `frontend/src/components/phases/input-phase.tsx`
- Create: `frontend/src/components/input/mode-selector.tsx`
- Create: `frontend/src/components/input/constraint-chips.tsx`
- Create: `frontend/src/components/input/format-chips.tsx`
- Create: `frontend/src/components/input/example-buttons.tsx`
- Create: `frontend/src/components/input/onboarding-panel.tsx`

- [ ] **Step 1: Build mode selector**

Write `frontend/src/components/input/mode-selector.tsx` — Select dropdown showing `{display_name} — {tagline}` for each mode. When "Custom" selected, shows additional fields for name/preamble/tone.

- [ ] **Step 2: Build constraint chips**

Write `frontend/src/components/input/constraint-chips.tsx` — multiselect buttons from `CONSTRAINT_PRESETS` that append/remove from a textarea below. Same add/remove logic as the fixed Streamlit version.

- [ ] **Step 3: Build format chips**

Write `frontend/src/components/input/format-chips.tsx` — same pattern as constraint chips but with `FORMAT_PRESETS`.

- [ ] **Step 4: Build example buttons**

Write `frontend/src/components/input/example-buttons.tsx` — grid of 8 buttons from `EXAMPLES` constant, each auto-fills the form fields in Zustand store.

- [ ] **Step 5: Build onboarding panel**

Write `frontend/src/components/input/onboarding-panel.tsx` — dismissable info panel with 3-step guide and "Try an example" button. Uses `onboardingSeen` from store.

- [ ] **Step 6: Build input phase**

Write `frontend/src/components/phases/input-phase.tsx` — assembles all input components: onboarding → examples → objective textarea → audience dropdown + mode selector → constraint/format chips → "Assemble Prompt" button that calls `POST /api/build-prompt` and transitions to review phase.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/phases/input-phase.tsx frontend/src/components/input/
git commit -m "feat: input phase with mode selector, constraint chips, examples, onboarding"
```

---

## Task 6: Review + Output + Evaluation Phases

**Files:**
- Create: `frontend/src/components/phases/review-phase.tsx`
- Create: `frontend/src/components/phases/output-phase.tsx`
- Create: `frontend/src/components/evaluation/score-badge.tsx`
- Create: `frontend/src/components/evaluation/eval-card.tsx`
- Create: `frontend/src/components/evaluation/suggestions.tsx`
- Create: `frontend/src/components/shared/markdown-output.tsx`
- Create: `frontend/src/components/shared/loading-spinner.tsx`

- [ ] **Step 1: Build score badge**

Write `frontend/src/components/evaluation/score-badge.tsx` — pill-shaped badge with colors from design system. Handles drift polarity inversion (Low=green, High=red for drift; opposite for alignment/clarity).

- [ ] **Step 2: Build evaluation card**

Write `frontend/src/components/evaluation/eval-card.tsx` — "Quality Scores" section (2-col grid: Alignment + Clarity) + "Scope Check" section (full-width: Drift with explanatory caption).

- [ ] **Step 3: Build suggestions display**

Write `frontend/src/components/evaluation/suggestions.tsx` — renders LLM-powered suggestions as a bulleted list.

- [ ] **Step 4: Build markdown output**

Write `frontend/src/components/shared/markdown-output.tsx` — uses `react-markdown` to render LLM output with proper styling.

- [ ] **Step 5: Build loading spinner**

Write `frontend/src/components/shared/loading-spinner.tsx` — consistent loading state with animated spinner and "Generating + Evaluating..." text.

- [ ] **Step 6: Build review phase**

Write `frontend/src/components/phases/review-phase.tsx`:
- Read-only system prompt (collapsible)
- Scaffolding toggle
- Editable user prompt textarea
- "Back to Input" and "Execute" buttons
- "Execute" calls `POST /api/run-iteration`, shows loading spinner, stores result + transitions to output

- [ ] **Step 7: Build output phase**

Write `frontend/src/components/phases/output-phase.tsx`:
- Rendered markdown output
- Mode switch dropdown for next iteration
- Evaluation card with scores
- Suggestions
- Evaluator callout caption
- Conditional buttons: "Generate Realignment" / "Refine Prompt" / "Proceed Anyway" (if needs realignment) or "Finalize Session" / "Refine Prompt" (if scores OK)
- Download current output button
- Iteration history + comparison (if 2+ iterations)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/phases/review-phase.tsx frontend/src/components/phases/output-phase.tsx frontend/src/components/evaluation/ frontend/src/components/shared/
git commit -m "feat: review phase, output phase, evaluation cards, score badges"
```

---

## Task 7: Realignment + Summary Phases

**Files:**
- Create: `frontend/src/components/phases/realign-phase.tsx`
- Create: `frontend/src/components/phases/summary-phase.tsx`
- Create: `frontend/src/components/evaluation/iteration-history.tsx`
- Create: `frontend/src/components/evaluation/iteration-comparison.tsx`

- [ ] **Step 1: Build iteration history**

Write `frontend/src/components/evaluation/iteration-history.tsx` — lists all iterations with score badges and trend indicators (▲/▼/—). Each iteration expandable to show full output.

- [ ] **Step 2: Build iteration comparison**

Write `frontend/src/components/evaluation/iteration-comparison.tsx` — two dropdowns to select iterations, side-by-side display with scores and output.

- [ ] **Step 3: Build realignment phase**

Write `frontend/src/components/phases/realign-phase.tsx`:
- Info box explaining realignment
- Editable realignment prompt textarea
- "Back to Output" and "Execute Realignment" buttons
- Execute calls `POST /api/run-iteration` with realignment prompt

- [ ] **Step 4: Build summary phase**

Write `frontend/src/components/phases/summary-phase.tsx`:
- Final evaluation card
- Summary metrics (Mode, Iterations, Alignment)
- Final output (markdown)
- Export buttons: Download Summary (.txt) via `POST /api/format-summary`, Download Session (.json) via `POST /api/export-session`
- Copyable session summary
- Save as template dialog
- Iteration history + comparison
- Self-audit button (calls `POST /api/run-self-audit`)
- "Start New Session" and "Hard Reset" buttons

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/phases/ frontend/src/components/evaluation/
git commit -m "feat: realignment phase, summary phase, iteration history + comparison"
```

---

## Task 8: Supabase Data Layer (Sessions, Templates, Usage)

**Files:**
- Create: `frontend/src/lib/supabase/sessions.ts`
- Create: `frontend/src/lib/supabase/templates.ts`
- Create: `frontend/src/lib/supabase/usage.ts`
- Create: `frontend/src/components/sidebar/session-list.tsx`
- Create: `frontend/src/components/sidebar/template-list.tsx`

- [ ] **Step 1: Build session CRUD**

Write `frontend/src/lib/supabase/sessions.ts`:
- `saveSessions(session)` — upsert to sessions table
- `loadSession(sessionId)` — fetch single session data
- `listSessions(limit=20)` — fetch summaries ordered by created_at desc
- `deleteSession(sessionId)` — remove session

All queries use the authenticated Supabase client. RLS enforces per-user access.

- [ ] **Step 2: Build template CRUD**

Write `frontend/src/lib/supabase/templates.ts`:
- `saveTemplate(template)` — upsert
- `loadTemplate(templateId)` — fetch single
- `listTemplates(limit=50)` — fetch summaries
- `deleteTemplate(templateId)` — remove

- [ ] **Step 3: Build usage tracking**

Write `frontend/src/lib/supabase/usage.ts`:
- `recordUsage(action: string)` — insert event (iteration, realignment, self_audit, hard_reset, session_finalize)

- [ ] **Step 4: Build session list component**

Write `frontend/src/components/sidebar/session-list.tsx` — displays saved sessions in sidebar. Each shows mode, iteration count, objective preview. "Load" button restores session into Zustand store.

- [ ] **Step 5: Build template list component**

Write `frontend/src/components/sidebar/template-list.tsx` — displays saved templates. "Apply" button fills input fields, "Delete" button removes template.

- [ ] **Step 6: Wire auto-save on session finalize**

In `summary-phase.tsx`, auto-save the session to Supabase when the user reaches the summary phase (same as Streamlit auto-save behavior).

- [ ] **Step 7: Wire usage tracking**

Add `recordUsage()` calls at: iteration execution, realignment, self-audit, hard reset, session finalize.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/supabase/ frontend/src/components/sidebar/
git commit -m "feat: Supabase session/template CRUD, usage tracking, sidebar lists"
```

---

## Task 9: Polish + Responsive + Dark Mode

**Files:**
- Modify: Various component files for responsive behavior
- Modify: `frontend/src/app/globals.css` for dark mode tokens
- Modify: `frontend/tailwind.config.ts` for Plus Jakarta Sans

- [ ] **Step 1: Configure font**

Update `tailwind.config.ts` to use Plus Jakarta Sans as the default sans font. Import via `next/font/google` in layout.tsx.

- [ ] **Step 2: Add dark mode tokens**

Add dark mode CSS variables from `design-system/promptmaster-engine/pages/session-workspace.md` to globals.css. Use Tailwind `dark:` variants.

- [ ] **Step 3: Responsive sidebar**

Make sidebar collapsible on mobile (< 768px) using shadcn Sheet component. Add hamburger menu button in header.

- [ ] **Step 4: Responsive phase components**

Ensure all phase components work on mobile: single-column layouts, appropriately sized touch targets, no horizontal scroll.

- [ ] **Step 5: Add error boundary**

Create an error boundary component that catches render errors and shows a friendly error message.

- [ ] **Step 6: Add toast notifications**

Wire shadcn Toast for success/error feedback (session saved, template saved, errors).

- [ ] **Step 7: Structural value callouts**

Add the same educational captions at each phase:
- Input: "PromptMaster structures your request with mode locking, anchoring, and invisible scaffolding..."
- Review: "Your input has been assembled into a two-layer prompt..."
- Output: "These scores come from a separate evaluator..."
- Realignment: "This is the core of the iterative loop — most quality gains come from iteration 2 or 3."

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: responsive design, dark mode, font, error handling, callouts"
```

---

## Summary

| Task | Components | Depends On |
|------|-----------|------------|
| 1. Scaffolding | Types, constants, shadcn/ui setup | — |
| 2. Auth | Login, signup, callback, middleware | Task 1 |
| 3. Store + API | Zustand, FastAPI client, utils | Task 1 |
| 4. Layout + Sidebar | Shell, sidebar, phase routing | Tasks 2, 3 |
| 5. Input Phase | All input components | Tasks 3, 4 |
| 6. Review + Output | Execute, evaluate, display | Tasks 3, 4, 5 |
| 7. Realignment + Summary | Complete workflow loop | Task 6 |
| 8. Supabase Data | Persistence, sidebar lists | Tasks 2, 7 |
| 9. Polish | Responsive, dark mode, callouts | Task 8 |
