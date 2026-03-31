# PromptMaster Engine — Design System

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

**Project:** PromptMaster Engine
**Generated:** 2026-03-31
**Category:** Enterprise SaaS — Structured AI Workflow Tool
**Style:** Trust & Authority — clean, spacious, confident
**Inspiration:** Linear, Vercel Dashboard, Notion

---

## Brand Identity

PromptMaster Engine is a structured AI interaction platform for professionals (analysts, auditors, lawyers, strategists). It is NOT a chatbot. The design must communicate:

- **Trust:** This is a serious tool for serious work
- **Clarity:** Every element has a purpose
- **Structure:** The workflow is deliberate, not freeform
- **Intelligence:** The system is doing sophisticated work behind the scenes

---

## Color Palette (SaaS General — Trust Blue)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#2563EB` | `blue-600` | Primary buttons, active states, links |
| Primary Hover | `#1D4ED8` | `blue-700` | Button hover states |
| Secondary | `#3B82F6` | `blue-500` | Secondary actions, highlights |
| Accent | `#EA580C` | `orange-600` | CTAs, important actions |
| Background | `#F8FAFC` | `slate-50` | Page background |
| Surface | `#FFFFFF` | `white` | Cards, panels, modals |
| Foreground | `#1E293B` | `slate-800` | Primary text |
| Muted | `#64748B` | `slate-500` | Secondary text, captions |
| Border | `#E2E8F0` | `slate-200` | Borders, dividers |
| Destructive | `#DC2626` | `red-600` | Errors, destructive actions |
| Ring | `#2563EB` | `blue-600` | Focus rings |

### Score Badge Colors

| State | Background | Text | Border | Usage |
|-------|-----------|------|--------|-------|
| Good | `#F0FDF4` | `#166534` | `#BBF7D0` | Alignment=High, Clarity=High, Drift=Low |
| Caution | `#FFFBEB` | `#92400E` | `#FDE68A` | Any=Medium |
| Bad | `#FEF2F2` | `#991B1B` | `#FECACA` | Alignment=Low, Clarity=Low, Drift=High |

### Tier Colors

| Tier | Color | Background |
|------|-------|-----------|
| 1 - Prompt Starter | `#9CA3AF` | `#F9FAFB` |
| 2 - Prompt Practitioner | `#2563EB` | `#EFF6FF` |
| 3 - Prompt Architect | `#7C3AED` | `#F5F3FF` |
| 4 - PromptMaster | `#D97706` | `#FFFBEB` |

---

## Typography

**Font:** Inter — minimal, clean, swiss, functional
**Fallback:** system-ui, -apple-system, sans-serif

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Page Title | 24px | 700 Bold | 1.2 |
| Section Heading | 18px | 600 SemiBold | 1.3 |
| Card Title | 16px | 600 SemiBold | 1.4 |
| Body | 14px | 400 Regular | 1.6 |
| Caption | 12px | 400 Regular | 1.5 |
| Badge | 11px | 600 SemiBold | 1 |
| Button | 14px | 500 Medium | 1 |

---

## Spacing (8dp system)

4, 8, 12, 16, 20, 24, 32, 40, 48px

## Border Radius

Buttons: 8px | Cards: 12px | Badges: 9999px | Inputs: 8px | Modals: 16px

## Shadows

Small: `0 1px 2px rgba(0,0,0,0.05)` — subtle cards
Medium: `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)` — elevated cards
Large: `0 4px 6px rgba(0,0,0,0.07)` — dropdowns, modals

---

## Layout

- Sidebar: 260px, white, border-right, fixed full-height
- Main content: max-width 720px, 32px padding desktop
- Breakpoints: 375 / 768 / 1024 / 1440

---

## Key UX Decisions (from client feedback)

### Mode Selection: Cards Above Objective

**Problem:** Professor confused about what modes mean. "About mode" section was at bottom — users gave up before scrolling to find it.

**Solution:** Mode selection displayed as a **grid of clickable cards** positioned ABOVE the objective textarea. Each card shows icon + name + tagline. When selected, an inline "About this mode" panel expands showing tone/description. This ensures the mode explanation is always visible when a mode is chosen.

**Flow order:** Examples → Mode Cards (with inline About) → Objective → Audience → Constraints/Format → Assemble

### Evaluation Display: Separated Drift

Quality Scores (Alignment + Clarity) in 2-column grid. Scope Check (Drift) full-width below with explanatory caption.

### Onboarding: Dismissable Welcome

3-step inline panel: Pick mode → Describe objective → Assemble. "Try an example" button. Auto-dismiss for returning users.

---

## Icons (Lucide, stroke 1.5px)

Architect: `Blocks` | Critic: `Search` | Clarity: `Sparkles` | Coach: `Heart`
Therapist: `Brain` | Cold Critic: `Snowflake` | Analyst: `BarChart3` | Custom: `Puzzle`

---

## Animation

Button hover: 150ms ease-out | Card hover: 200ms ease-out | Phase transition: 300ms ease-in-out
All respect `prefers-reduced-motion`.

---

## Anti-Patterns

- Emojis as icons
- AI purple/pink gradients
- Playful consumer design
- Placeholder-only labels
- Hidden mode explanations
- Instant state changes
- Low-contrast text
