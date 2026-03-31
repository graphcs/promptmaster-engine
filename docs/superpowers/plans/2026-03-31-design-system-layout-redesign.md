# Design System + Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current generic shadcn theme with the "Architectural Monolith" design system from the mockups, including new color tokens, typography scale, layout shell (sidebar + top nav + 720px content well), and shared component primitives.

**Architecture:** The design system uses tonal separation (background color shifts) instead of borders ("No-Line Rule"), Inter font with an editorial type scale (2.75rem display headings), a fixed 260px sidebar, a blurred top navigation bar with phase tabs, and a 720px centered content well. All color tokens come from the mockup Tailwind config. Material Symbols icons replace Lucide.

**Tech Stack:** Next.js 16, Tailwind CSS v4 (CSS-based config), shadcn/ui, Inter font, Material Symbols Outlined, React

**Design References:**
- `stitch/foundry_slate/DESIGN.md` — Design system specification
- `stitch/login_page/` — Login screen mockup (HTML + PNG)
- `stitch/phase_1_input_phase/` — Input phase mockup
- `stitch/phase_2_review_phase/` — Review phase mockup
- `stitch/phase_3_output_evaluation_phase/` — Output phase mockup
- `stitch/phase_4_realignment_phase/` — Realignment phase mockup
- `stitch/phase_5_summary_phase/` — Summary phase mockup

---

## File Structure

```
frontend/src/
├── app/
│   ├── globals.css                 # REWRITE — new color tokens, typography, design system
│   ├── layout.tsx                  # REWRITE — Inter font, Material Symbols link, body classes
│   ├── page.tsx                    # Keep (redirect)
│   ├── auth/
│   │   ├── login/page.tsx          # REWRITE — match login mockup exactly
│   │   └── signup/page.tsx         # REWRITE — match login design language
│   └── session/
│       ├── layout.tsx              # REWRITE — sidebar + top nav + content well
│       └── page.tsx                # MODIFY — update phase routing with new components
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx             # NEW — 260px fixed sidebar matching mockup
│   │   ├── top-nav.tsx             # NEW — blurred top nav with phase tabs
│   │   └── content-well.tsx        # NEW — 720px centered content wrapper
│   ├── phases/
│   │   ├── input-phase.tsx         # REWRITE — mode grid, objective, constraint pills
│   │   ├── review-phase.tsx        # REWRITE — system prompt details, editor, metadata
│   │   ├── output-phase.tsx        # REWRITE — output card, eval section, suggestions
│   │   ├── realign-phase.tsx       # REWRITE — info banner, corrective workspace, analytics
│   │   └── summary-phase.tsx       # REWRITE — score hero, metrics, comparison, audit card
│   ├── shared/
│   │   ├── mode-grid.tsx           # NEW — 4x2 mode selection grid with expandable about
│   │   ├── constraint-pills.tsx    # NEW — full-width toggle pills (replaces multiselect chips)
│   │   ├── score-badge.tsx         # REWRITE — pill badges with green/amber/red
│   │   ├── eval-section.tsx        # NEW — Quality Scores + Scope Check layout
│   │   └── suggestions-list.tsx    # NEW — numbered suggestions with lightbulb icon
│   └── ui/                         # shadcn components (keep existing)
```

---

## Task 1: Design System — Color Tokens + Typography + CSS Foundation

**Files:**
- Rewrite: `frontend/src/app/globals.css`

This task replaces the default shadcn theme with the complete "Foundry Slate" design system color tokens from the mockup Tailwind config. Every color value comes from `stitch/phase_1_input_phase/code.html` lines 38-63.

- [ ] **Step 1: Replace globals.css with new design system**

Rewrite `frontend/src/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ========================================
   PROMPTMASTER ENGINE — DESIGN SYSTEM
   "The Architectural Monolith"
   ======================================== */

@theme inline {
  /* Font family */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --font-heading: "Inter", system-ui, sans-serif;

  /* shadcn semantic tokens (mapped to design system) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Radius scale */
  --radius-sm: 0.125rem;
  --radius-md: 0.25rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;

  /* Sidebar tokens */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  /* === Surface Hierarchy (Tonal Layering) === */
  --surface: #f7f9fb;
  --surface-container: #eceef0;
  --surface-container-low: #f2f4f6;
  --surface-container-lowest: #ffffff;
  --surface-container-high: #e6e8ea;
  --surface-container-highest: #e0e3e5;
  --surface-dim: #d8dadc;
  --surface-bright: #f7f9fb;

  /* === Text Colors === */
  --on-surface: #191c1e;
  --on-surface-variant: #434655;
  --outline: #737686;
  --outline-variant: #c3c6d7;

  /* === Primary === */
  --pm-primary: #004ac6;
  --pm-primary-container: #2563eb;
  --on-primary: #ffffff;
  --on-primary-container: #eeefff;
  --primary-fixed: #dbe1ff;

  /* === Error === */
  --pm-error: #ba1a1a;
  --error-container: #ffdad6;
  --on-error: #ffffff;
  --on-error-container: #93000a;

  /* === Secondary === */
  --pm-secondary: #495c95;
  --secondary-container: #acbfff;

  /* === Tertiary === */
  --pm-tertiary: #943700;
  --tertiary-container: #bc4800;

  /* === Inverse === */
  --inverse-surface: #2d3133;
  --inverse-on-surface: #eff1f3;

  /* === shadcn token mapping === */
  --background: #f7f9fb;
  --foreground: #191c1e;
  --card: #ffffff;
  --card-foreground: #191c1e;
  --popover: #ffffff;
  --popover-foreground: #191c1e;
  --primary: #004ac6;
  --primary-foreground: #ffffff;
  --secondary: #f2f4f6;
  --secondary-foreground: #191c1e;
  --muted: #eceef0;
  --muted-foreground: #434655;
  --accent: #f2f4f6;
  --accent-foreground: #191c1e;
  --destructive: #ba1a1a;
  --border: #e6e8ea;
  --input: #f2f4f6;
  --ring: #004ac6;
  --radius: 0.5rem;

  /* Sidebar */
  --sidebar: #f2f4f6;
  --sidebar-foreground: #191c1e;
  --sidebar-primary: #004ac6;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e6e8ea;
  --sidebar-accent-foreground: #191c1e;
  --sidebar-border: transparent;
  --sidebar-ring: #004ac6;
}

/* === Ambient Shadow Token === */
.shadow-ambient {
  box-shadow: 0px 4px 20px rgba(25, 28, 30, 0.04);
}

/* === Content Well === */
.content-well {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

/* === Editorial Typography === */
.text-display {
  font-size: 2.75rem;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.2;
}

.text-headline {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.text-title {
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.text-body {
  font-size: 0.875rem;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.6;
}

.text-label {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.4;
}

/* === Custom Scrollbar === */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #c3c6d7;
  border-radius: 3px;
}

/* === Material Symbols === */
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  display: inline-block;
  line-height: 1;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  white-space: nowrap;
  direction: ltr;
  vertical-align: middle;
}
```

- [ ] **Step 2: Verify CSS compiles**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -5
```

Expected: No CSS-related errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: design system — Foundry Slate color tokens, typography, CSS foundation"
```

---

## Task 2: Root Layout — Inter Font + Material Symbols

**Files:**
- Rewrite: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Rewrite layout.tsx**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PromptMaster Engine',
  description: 'Professional AI Workflow — Structured prompt engineering for aligned LLM outputs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-[var(--surface)] text-[var(--on-surface)] min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat: root layout with Inter font and Material Symbols"
```

---

## Task 3: Layout Shell — Sidebar + Top Nav + Content Well

**Files:**
- Create: `frontend/src/components/layout/sidebar.tsx`
- Create: `frontend/src/components/layout/top-nav.tsx`
- Create: `frontend/src/components/layout/content-well.tsx`
- Rewrite: `frontend/src/app/session/layout.tsx`

- [ ] **Step 1: Create sidebar component**

Write `frontend/src/components/layout/sidebar.tsx` matching the mockup exactly:
- Fixed 260px, h-screen, bg-slate-100 (surface-container-low)
- Brand: "PromptMaster Engine" heading + "Professional AI Workflow" subtitle
- "New Session" primary button with add icon
- Nav links: Dashboard (active), Library, Settings
- Bottom section: Model Selector, Pro Tier
- All icons use Material Symbols (`<span className="material-symbols-outlined">icon_name</span>`)
- Active nav item: bg-slate-200 text-blue-700 rounded-lg
- Inactive: text-slate-600 hover:bg-slate-200/50

```typescript
'use client';

import { useSessionStore } from '@/stores/session-store';

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const resetSession = useSessionStore((s) => s.resetSession);

  return (
    <aside className="w-[260px] h-screen flex flex-col p-4 gap-y-4 bg-slate-100">
      {/* Brand */}
      <div className="px-2 mb-4">
        <h1 className="text-lg font-semibold tracking-tighter text-slate-900">
          PromptMaster Engine
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">
          Professional AI Workflow
        </p>
      </div>

      {/* New Session */}
      <button
        onClick={() => { resetSession(); onNavigate?.(); }}
        className="w-full bg-[var(--pm-primary-container)] text-white py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 mb-4"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        New Session
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 bg-slate-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined">dashboard</span>
          Dashboard
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined">folder_open</span>
          Library
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined">settings</span>
          Settings
        </a>
      </nav>

      {/* Bottom section */}
      <div className="mt-auto pt-4 space-y-1">
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined">smart_toy</span>
          Model Selector
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 text-slate-600 text-sm font-medium hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined">verified</span>
          Pro Tier
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create top-nav component**

Write `frontend/src/components/layout/top-nav.tsx`:
- Fixed, w-[calc(100%-260px)], h-14, bg-white/80 backdrop-blur-md
- Border-bottom: border-slate-200/50
- Phase tabs: "Phase: Input", "Review", "Output", "Realignment", "Summary"
- Active tab: text-blue-600 border-b-2 border-blue-600
- Right side: notification icon + "Save Session" button

```typescript
'use client';

import { useSessionStore } from '@/stores/session-store';
import type { Phase } from '@/types';

const PHASE_TABS: { key: Phase; label: string }[] = [
  { key: 'input', label: 'Phase: Input' },
  { key: 'review', label: 'Review' },
  { key: 'output', label: 'Output' },
  { key: 'realign', label: 'Realignment' },
  { key: 'summary', label: 'Summary' },
];

export function TopNav() {
  const phase = useSessionStore((s) => s.phase);

  return (
    <header className="fixed top-0 right-0 w-[calc(100%-260px)] h-14 bg-white/80 backdrop-blur-md z-40 border-b border-slate-200/50 flex items-center">
      <div className="flex justify-between items-center px-6 max-w-[720px] mx-auto w-full">
        <nav className="flex gap-6">
          {PHASE_TABS.map((tab) => (
            <span
              key={tab.key}
              className={`text-sm font-medium tracking-tight h-14 flex items-center transition-all duration-200 ${
                phase === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.key === 'input' ? tab.label : tab.label}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-slate-900 transition-colors">
            notifications
          </span>
          <button className="bg-[var(--pm-primary)] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-all">
            Save Session
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create content-well wrapper**

Write `frontend/src/components/layout/content-well.tsx`:

```typescript
interface ContentWellProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentWell({ children, className = '' }: ContentWellProps) {
  return (
    <div className={`content-well space-y-12 ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite session layout**

Rewrite `frontend/src/app/session/layout.tsx`:

```typescript
'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { TopNav } from '@/components/layout/top-nav';

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — fixed 260px */}
      <Sidebar />

      {/* Top Navigation */}
      <TopNav />

      {/* Main content canvas */}
      <main className="ml-[260px] pt-24 pb-20 px-8 flex-1">
        <div className="content-well">
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript + build**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/ frontend/src/app/session/layout.tsx
git commit -m "feat: layout shell — 260px sidebar, blurred top nav, 720px content well"
```

---

## Task 4: Login Page Redesign

**Files:**
- Rewrite: `frontend/src/app/auth/login/page.tsx`

- [ ] **Step 1: Rewrite login page matching mockup exactly**

The login page should match `stitch/login_page/screen.png`:
- Centered, max-width 420px, no navigation shell
- Brand: blue icon container (w-12 h-12, bg-primary-container, rounded-xl) with terminal icon
- Title: "PromptMaster Engine", subtitle: "Professional AI Workflow"
- Card: bg-white (surface-container-lowest), rounded-xl, shadow-ambient, p-8
- Labels: text-xs uppercase tracking-wider font-medium
- Inputs: bg-[var(--surface-container-low)] border-none rounded-lg px-4 py-3
- Focus: ring-2 ring-primary/40, bg changes to surface-container-lowest
- Submit button: bg-primary text-white w-full py-3 rounded-lg font-semibold
- Divider: "OR" text with tonal lines
- Google OAuth button: outlined with Google SVG
- Footer: "Don't have an account? Sign up"
- Decorative: fixed top-right Material Symbol "architecture" at 320px, opacity-5

Use the exact same HTML patterns from `stitch/login_page/code.html` but converted to React/JSX with the `useAuth` hook for interactivity.

- [ ] **Step 2: Verify renders**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/auth/login/page.tsx
git commit -m "feat: login page redesign — Architectural Monolith aesthetic"
```

---

## Task 5: Shared Components — Mode Grid, Constraint Pills, Score Badge, Eval Section

**Files:**
- Create: `frontend/src/components/shared/mode-grid.tsx`
- Create: `frontend/src/components/shared/constraint-pills.tsx`
- Rewrite: `frontend/src/components/evaluation/score-badge.tsx`
- Create: `frontend/src/components/shared/eval-section.tsx`
- Create: `frontend/src/components/shared/suggestions-list.tsx`

- [ ] **Step 1: Create mode-grid component**

A 4x2 grid of clickable mode cards matching `stitch/phase_1_input_phase/code.html` lines 158-210.

Each card:
- p-4 bg-white (surface-container-lowest) rounded-xl
- Selected: border-2 border-primary + shadow-ambient
- Unselected: hover:bg-[var(--surface-container-high)]
- Icon: Material Symbol, text-primary when selected, text-[var(--outline)] when not
- Title: text-sm font-semibold
- Description: text-[11px] text-on-surface-variant leading-tight

When selected, show expandable "About this mode" panel below the grid:
- bg-[var(--primary-fixed)]/30 p-5 rounded-xl border-l-4 border-[var(--pm-primary)]
- Label: text-xs font-bold text-[var(--pm-primary)] uppercase tracking-widest
- Description text: text-sm text-[var(--on-surface-variant)] leading-relaxed

Icons mapping (Material Symbols):
- architect: "architecture"
- critic: "rate_review"
- clarity: "lightbulb"
- coach: "sports"
- therapist: "psychology"
- cold_critic: "ac_unit"
- analyst: "analytics"
- custom: "tune"

- [ ] **Step 2: Create constraint-pills component**

Full-width toggle pill buttons matching mockup lines 234-253.

Grid: grid-cols-1 md:grid-cols-2 gap-2.
- Active pill: bg-[var(--pm-primary-container)] text-white px-4 py-3 rounded-xl, check_circle icon (FILL: 1)
- Inactive pill: bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] px-4 py-3 rounded-xl, add_circle icon (opacity-20)
- Click toggles between active/inactive
- Active pills are joined into the constraints/format textarea text

- [ ] **Step 3: Rewrite score-badge component**

Match mockup badge styling:
- High/Good: px-3 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-tighter
- Medium: bg-amber-100 text-amber-700
- Low/Bad: bg-red-100 text-red-700
- Drift polarity: Low=green (good), High=red (bad)

- [ ] **Step 4: Create eval-section component**

Two-section evaluation card matching `stitch/phase_3_output_evaluation_phase/code.html`:
- Card: bg-white rounded-xl shadow-ambient p-8
- Quality Scores heading: text-xs font-semibold uppercase tracking-widest text-slate-400
- Grid: grid-cols-2 gap-8
- Each dimension: ScoreBadge + title + description text
- Divider: pt-8 border-t border-slate-100
- Scope Check (Drift): same pattern but full-width, with progress bar (h-1.5 bg-[var(--surface-container-low)]) and explanatory note (text-[11px] italic)

- [ ] **Step 5: Create suggestions-list component**

Match mockup numbered suggestions:
- Container: bg-[var(--surface-container-low)] p-6 rounded-xl border border-slate-200/20
- Header with Material Symbol "lightbulb" (FILL: 1, text-primary) + "AI Suggested Refinements"
- Numbered items: "01", "02", etc. in text-primary font-bold
- Text: text-sm text-[var(--on-surface)] leading-relaxed

- [ ] **Step 6: Verify all components compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shared/ frontend/src/components/evaluation/
git commit -m "feat: shared components — mode grid, constraint pills, eval section, suggestions"
```

---

## Task 6: Phase Components Redesign (All 5 Phases)

**Files:**
- Rewrite: `frontend/src/components/phases/input-phase.tsx`
- Rewrite: `frontend/src/components/phases/review-phase.tsx`
- Rewrite: `frontend/src/components/phases/output-phase.tsx`
- Rewrite: `frontend/src/components/phases/realign-phase.tsx`
- Rewrite: `frontend/src/components/phases/summary-phase.tsx`

- [ ] **Step 1: Rewrite input-phase.tsx**

Match `stitch/phase_1_input_phase/screen.png` exactly:
1. Display heading: "Prompt Configuration" (text-display class)
2. Subtitle: "Define the persona, objective, and structural constraints..."
3. Mode Grid section with "Select Engine Mode" heading
4. Objective (2/3 width) + Audience select (1/3) in a 3-col grid
5. Preset Constraints section with toggle pills
6. Negative Constraints textarea
7. Output Format Specification textarea
8. Footer: token estimate + "Assemble Prompt" primary CTA with bolt icon

Flow order: Mode Selection → Objective/Audience → Constraints → Format → Assemble

- [ ] **Step 2: Rewrite review-phase.tsx**

Match `stitch/phase_2_review_phase/screen.png`:
1. Display heading: "Review Phase"
2. Subtitle
3. System Prompt in a `<details>` card (bg-white rounded-xl shadow-ambient)
4. User Prompt editor (large textarea, min-h-[320px], with Clear/Copy buttons)
5. Scaffolding toggle switch (custom toggle, not checkbox)
6. Action row: "Back to Input" (outlined) + "Execute" (primary with lightning icon)
7. Metadata grid: Prompt Metrics + Context Window cards

- [ ] **Step 3: Rewrite output-phase.tsx**

Match `stitch/phase_3_output_evaluation_phase/screen.png`:
1. Display heading: "Output & Evaluation"
2. AI Output card (bg-white rounded-xl shadow-ambient p-8) with copy/fullscreen buttons
3. Article content rendered as prose
4. Eval Section component (Quality Scores + Scope Check)
5. Suggestions List component
6. Iteration History (collapsible `<details>`)
7. Action row: "Refine Prompt" (outlined) + download icon button + "Finalize Session" (primary)

- [ ] **Step 4: Rewrite realign-phase.tsx**

Match `stitch/phase_4_realignment_phase/screen.png`:
1. Display heading: "Realignment"
2. Info banner with "Why Realignment is Needed" (bg-[var(--surface-container-low)], info icon)
3. Corrective Prompt workspace (bg-white rounded-xl shadow-ambient, large textarea)
4. Active point indicator dot + "ACTIVE POINT" label
5. Action row: "Back to Output" (outlined with arrow_back) + "Execute Realignment" (primary with bolt)
6. System Drift Analytics section (progress bars for Instruction Adherence and Clarity Index)

- [ ] **Step 5: Rewrite summary-phase.tsx**

Match `stitch/phase_5_summary_phase/screen.png`:
1. Header with "Evaluation Summary" + large score number (text-[3rem] font-extrabold text-primary)
2. Metric cards grid (3-col): Mode icon+label, Iterations count, Match percentage
3. Final Prompt Output section (bg-white rounded-xl shadow-ambient, prose content)
4. Download buttons: "Download Summary .txt" + "Download Session .json"
5. Iteration Comparison (collapsible details with 2-column select + text comparison)
6. Cold Critic Analysis card (dark bg-slate-900, white text, "Run Full Audit" button)
7. Footer actions: "Hard Reset" (text link) + "Start New Session" (primary CTA)

- [ ] **Step 6: Update session/page.tsx imports**

Ensure all phase imports point to the rewritten components.

- [ ] **Step 7: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/phases/ frontend/src/app/session/page.tsx
git commit -m "feat: redesign all 5 phase components to match mockup screens"
```

---

## Summary

| Task | Scope | Files |
|------|-------|-------|
| 1. CSS Design System | Color tokens, typography, shadows | globals.css |
| 2. Root Layout | Font, Material Symbols | layout.tsx |
| 3. Layout Shell | Sidebar, top nav, content well | 4 files |
| 4. Login Redesign | Full page rewrite | 1 file |
| 5. Shared Components | Mode grid, pills, badges, eval | 5 files |
| 6. Phase Redesign | All 5 phases rewritten | 6 files |
