# Smart Setup — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Source:** Sean Moran's emails — Email 6 (Apr 17), Email 7 (Apr 18), Email 14 (Apr 25). Plus Email 8 (Apr 21 third-party feedback) corroborating the onboarding-friction concern.
**Project:** C — third of three remaining projects (A = Conversation/Iteration Refactor, complete; B = Completion + State Continuity, complete; D = Output Polish, future).

---

## Problem

The current Input phase asks users to make many decisions upfront before they can generate anything: pick a mode from an 8-tile grid, pick an audience, write or pick constraint pills, write or pick format pills, optionally pin session facts, optionally pick a stack, write the objective. New users hesitate at this wall of choices. Sean Email 6:

> *"There are a lot of powerful controls visible upfront (modes, stacks, constraints, formats, etc.), and while that's great, it can create a moment of hesitation before the user even starts."*

His proposed shape (Email 7):

> *"Top: 'What do you want to do or figure out?' [input box]. Primary button: 'Generate Setup'. Then directly underneath (lighter / secondary): 'Or start with a template' with stacks like Research, Strategy, Decision, Writing, Debug. So the input is clearly the main path, and templates are just optional shortcuts rather than something the user has to decide upfront."*

And the underlying principle (Email 14):

> *"System-first by default, user control when needed. Visible but collapsible context: objective, mode, audience, and constraints should be visible (for transparency), but not always expanded."*

---

## Solution Summary

Replace the current Input phase with a three-zone layout:

1. **Hero zone (top, primary):** big objective input + **Generate Setup** primary button.
2. **Templates zone (below hero, secondary):** *"Or start with a template"* with the existing 5 stacks as small cards.
3. **Setup summary bar (appears after Generate Setup):** the suggested mode, audience, constraints, and output format render as click-to-edit chips. Each chip shows the suggestion plus a one-line rationale ("why this mode"). Click a chip → expands inline to its existing control.

A collapsed **Advanced** accordion below holds the granular controls (full mode grid, audience selector, constraint/format pill grids, session facts, stack selector). Power users can always open it.

The Generate Setup button calls a new `/api/generate-setup` endpoint that uses an LLM to infer mode + audience + constraints + format from the objective. The user can click Execute immediately (suggestion-as-is) or refine any chip first.

---

## Key Decisions

### Decision 1 — Replace, don't add a toggle

The current Input page is replaced with the new layout. We do **not** add a "Smart" / "Manual" toggle. Sean's whole point is reducing decision overhead — adding a toggle creates a new decision before the user gets started. Instead, the new layout puts the manual controls behind a single "Advanced" accordion, accessible to anyone who wants them.

### Decision 2 — Generate Setup is opt-in (stop at preview, do not auto-execute)

Clicking Generate Setup runs the LLM suggestion but **does not** generate the actual output. The user lands in the same Input phase with the summary bar populated. They can refine any chip, then click "Continue to Review" (or whatever the existing primary action is) to proceed to the Review phase exactly like today.

Sean's phrasing (Email 6): *"system assists first, user refines second"* — auto-executing would skip the refinement step.

### Decision 3 — Suggestion fields and rationales

Generate Setup returns five fields:

- `mode: ModeType` — one of the existing 8 mode IDs
- `audience: str` — one of the existing audience options or a free-text suggestion
- `constraints: str` — short suggested constraint paragraph
- `output_format: str` — short suggested format description
- `rationale: { mode: str, audience: str, constraints: str, output_format: str }` — one-line "why this" per field

Rationale strings are short (≤80 chars each), shown next to the chip in muted text. They give users transparency and confidence to accept the suggestion.

### Decision 4 — Templates row uses existing PROMPT_STACKS, click pre-fills inputs

The "Or start with a template" row renders the existing 5 stacks (Research, Strategy, Decision, Writing, Debug) from `frontend/src/lib/constants.ts:PROMPT_STACKS`. Clicking a stack pre-fills the inputs from that stack's `initial` config — same behavior as today. Templates do **not** call Generate Setup; they're a shortcut for users who already know the shape they want.

### Decision 5 — Summary bar chips are inline-editable

Each chip in the summary bar (Mode, Audience, Constraints, Format) displays the current value and a small chevron. Clicking expands the chip to show the existing control component for that field (e.g., `ModeGrid` for mode, `AudienceSelector` for audience, the `ConstraintPills` for constraints). The user picks a new value and the chip collapses back. This reuses every existing control unchanged — no new edit UIs.

### Decision 6 — Existing controls move into "Advanced" accordion, collapsed by default

The current Input phase already has the following components:

- `ModeGrid` (mode picker)
- `CustomSelect` for audience
- `ConstraintPills` for constraints (with custom presets from Project A)
- `ConstraintPills` (reused) for format
- Session facts editor
- Stack selector

All of these continue to exist and are bound to the same Zustand store fields as today. They're moved into a single `<details>` block titled **"Advanced"**, collapsed by default. No behavior changes — just visibility.

### Decision 7 — No backend persistence for the suggestion

The setup suggestion is held in Zustand only. It's used to populate the summary bar and the underlying store fields. Once the user proceeds to Review phase, the rest of the flow doesn't care whether the values came from a suggestion or manual entry — they're just `objective`, `mode`, `audience`, `constraints`, `output_format` in the store like always.

---

## Architecture

### Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│  Hero Zone                                                  │
│                                                             │
│   "What do you want to do or figure out?"                   │
│   ┌─────────────────────────────────────────────┐           │
│   │ Big objective input (textarea, 3 rows)      │           │
│   └─────────────────────────────────────────────┘           │
│                                                             │
│   [ Generate Setup → ]                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Or start with a template                                   │
│                                                             │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─...│
│   │ Research │ │ Strategy │ │ Decision │ │ Writing  │ │ De.│
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─...│
└─────────────────────────────────────────────────────────────┘

After Generate Setup runs, ABOVE the hero:

┌─────────────────────────────────────────────────────────────┐
│  Recommended Approach                                       │
│                                                             │
│   [ Mode: Architect ▾ ]    Best fit for structured plans    │
│   [ Audience: Engineering Leads ▾ ]   Matches the problem...│
│   [ Constraints: Two-week timeline ▾ ]  Adds the deadline...│
│   [ Format: Numbered list ▾ ]   Clear and scannable         │
│                                                             │
│   Click any chip to refine.                                 │
└─────────────────────────────────────────────────────────────┘

(Hero zone with input + Generate Setup remains visible — user can re-run.)

┌─────────────────────────────────────────────────────────────┐
│  ▶ Advanced                                                  │  (collapsed)
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [ Continue to Review → ]  (primary action, bottom)         │
└─────────────────────────────────────────────────────────────┘
```

When a chip is clicked it expands inline (replacing the chip), shows the current control (mode grid, audience selector, etc.), the user picks a new value, and the chip collapses back showing the new value.

### Layer Responsibilities

| Layer | Lives in | Responsibility |
|---|---|---|
| Hero input + Generate Setup CTA | New `hero-zone.tsx` | Objective input + primary button |
| Templates row | New `templates-row.tsx` | Render PROMPT_STACKS as cards, handle stack-click pre-fill |
| Setup summary bar | New `setup-summary-bar.tsx` | Render 4 chips (mode/audience/constraints/format), expand on click |
| Inline chip editors | Reuse existing `ModeGrid`, `CustomSelect`, `ConstraintPills` | No changes |
| Advanced accordion | New `advanced-section.tsx` (or inline `<details>` block) | Wrap all existing controls |
| LLM suggestion | New `backend/promptmaster/setup_suggester.py` | `suggest_setup(objective)` → 5 fields + rationales |
| API endpoint | New `backend/routers/setup.py` | `POST /api/generate-setup` |

### What changes vs. stays

**Stays unchanged:**
- All existing controls (`ModeGrid`, `ConstraintPills`, `CustomSelect`, etc.)
- Zustand store fields for `objective`, `audience`, `constraints`, `outputFormat`, `mode`, etc.
- Review phase, Output phase, Realign phase, Summary phase
- Templates feature (we just surface the existing stacks differently)
- Tutorial system (out of scope; may need follow-up tuning)

**Changes:**
- `input-phase.tsx` is rewritten — new structure, but composes existing components
- New: `setup-suggester.py` backend module
- New: `/api/generate-setup` endpoint
- New: 3 frontend components for hero / templates / summary bar
- Zustand store gains a `setupSuggestion` cache (transient, per-session)

---

## Data Model

### Backend Schema (`backend/promptmaster/schemas.py`)

```python
class SetupRationale(BaseModel):
    """One-line 'why this' explanations for each suggested field."""
    mode: str = Field(default="")
    audience: str = Field(default="")
    constraints: str = Field(default="")
    output_format: str = Field(default="")


class SetupSuggestion(BaseModel):
    """Suggested PMInput fields produced by the Smart Setup LLM call."""
    mode: ModeType
    audience: str
    constraints: str
    output_format: str
    rationale: SetupRationale = Field(default_factory=SetupRationale)
```

### Frontend Types (`frontend/src/types/index.ts`)

```typescript
export interface SetupRationale {
  mode: string;
  audience: string;
  constraints: string;
  output_format: string;
}

export interface SetupSuggestion {
  mode: ModeType;
  audience: string;
  constraints: string;
  output_format: string;
  rationale: SetupRationale;
}

export interface GenerateSetupRequest {
  objective: string;
  model?: string;
}
```

### Zustand Store Additions (`frontend/src/stores/session-store.ts`)

```typescript
// State
setupSuggestion: SetupSuggestion | null;
setupLoading: boolean;
setupError: string | null;

// Actions
setSetupSuggestion: (s: SetupSuggestion | null) => void;
setSetupLoading: (b: boolean) => void;
setSetupError: (e: string | null) => void;
applySetupSuggestion: (s: SetupSuggestion) => void;  // also writes mode/audience/constraints/outputFormat into the store
```

`applySetupSuggestion` is a convenience helper that does both: set `setupSuggestion` and update the underlying input fields, so the summary bar AND the Advanced controls stay in sync.

---

## Backend API

### New Endpoint

| Endpoint | Purpose | LLM calls |
|---|---|---|
| `POST /api/generate-setup` | Suggest mode/audience/constraints/format from objective | 1 (generate_json) |

### Request / Response

```python
class GenerateSetupRequest(BaseModel):
    objective: str
    model: str = ""

class GenerateSetupResponse(BaseModel):
    suggestion: SetupSuggestion
```

### LLM Prompt Design

System prompt:

```
You are the Smart Setup layer of PromptMaster. Given a user's objective,
recommend the most fitting mode, audience, constraints, and output format
to produce a high-quality structured response.

Available modes:
- architect: Structure, systems, frameworks
- critic: Find weak points and contradictions
- clarity: Make complex ideas simple and crisp
- coach: Encouraging, action-oriented
- therapist: Reflective, empathetic, exploratory
- cold_critic: Brutally objective audit, no encouragement
- analyst: Evidence-based, data-aware reasoning
- custom: Reserved for user-defined modes — do NOT recommend custom

Available audiences (suggest the closest match or a short free-text tailored
to the objective):
General, Technical, Executive, Researcher, Engineering Leads, Marketers,
Educators, Students, Designers.

Constraints: a short paragraph describing scope limits, focus areas, or
deadlines. Be specific. If none apply, return an empty string.

Output format: a short phrase describing structure (e.g., "Numbered list
with 3-5 items", "Two-section memo: Findings / Recommendations",
"Markdown table"). If none clearly apply, return "Free-form prose".

Rationale: one line per field (≤80 chars) explaining why you picked it.
Be brief and useful, not generic.

Return JSON only.
```

User prompt:

```
Objective: {objective}

Recommend a setup. Return JSON in this exact shape:
{
  "mode": "architect|critic|clarity|coach|therapist|cold_critic|analyst",
  "audience": "...",
  "constraints": "...",
  "output_format": "...",
  "rationale": {
    "mode": "...",
    "audience": "...",
    "constraints": "...",
    "output_format": "..."
  }
}
```

### Defensive Parsing

- Mode must be one of the 8 IDs — fall back to `"architect"` if unknown.
- Audience defaults to `"General"` if missing.
- Constraints defaults to `""` if missing.
- Output format defaults to `""` if missing.
- Rationale defaults to empty strings.
- If the entire LLM call fails, return `502` and let the frontend show an error and offer Advanced as a fallback.

### New Module Layout

```
backend/promptmaster/
└── setup_suggester.py         # build_setup_prompt + suggest_setup

backend/routers/
└── setup.py                   # POST /api/generate-setup

backend/tests/
├── test_setup_suggester.py    # prompt content + parsing
└── test_setup_router.py       # endpoint shape + wiring
```

---

## Frontend

### New Components (`frontend/src/components/input/`)

```
input/
├── hero-zone.tsx             # Objective input + Generate Setup button
├── templates-row.tsx         # PROMPT_STACKS rendered as small cards
├── setup-summary-bar.tsx     # 4 chips with rationales, click-to-edit
├── setup-chip.tsx            # Single chip (label + value + chevron + expanded editor)
└── advanced-section.tsx      # <details> accordion wrapping existing controls
```

Each component is small, single-purpose, and presentational where possible. `setup-summary-bar` orchestrates the 4 chip slots; `setup-chip` is the reusable presentational unit.

### Component Interfaces

```typescript
interface HeroZoneProps {
  objective: string;
  onObjectiveChange: (v: string) => void;
  onGenerateSetup: () => void;
  loading: boolean;
}

interface TemplatesRowProps {
  onSelectStack: (stackId: string) => void;
}

interface SetupSummaryBarProps {
  suggestion: SetupSuggestion;
  // Each onEdit callback writes to store; chip components render the relevant editor
}

interface SetupChipProps<T> {
  label: string;          // "Mode", "Audience", etc.
  value: string;          // rendered display value
  rationale: string;      // muted text below chip
  expanded: boolean;
  onToggleExpand: () => void;
  children: React.ReactNode;  // the editor component to show when expanded
}

interface AdvancedSectionProps {
  // Reads everything from store directly; no props
}
```

### `input-phase.tsx` Rewrite

Replaces the current 618-line file with a ~150-line composer:

```tsx
'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { HeroZone } from '@/components/input/hero-zone';
import { TemplatesRow } from '@/components/input/templates-row';
import { SetupSummaryBar } from '@/components/input/setup-summary-bar';
import { AdvancedSection } from '@/components/input/advanced-section';
import { ContinueToReviewButton } from '@/components/input/continue-to-review-button';
// ... store reads + handlers (handleGenerateSetup, handleSelectStack, handleContinue)
```

The full `OutputPhase` and other phases are unchanged. Only the Input phase is rewritten.

### API Client (`frontend/src/lib/api/client.ts`)

```typescript
async generateSetup(req: GenerateSetupRequest): Promise<{ suggestion: SetupSuggestion }> {
  return apiFetch('/api/generate-setup', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
```

### Store Wiring

`applySetupSuggestion` writes:
- `setupSuggestion = s`
- `mode = s.mode`
- `audience = s.audience`
- `constraints = s.constraints`
- `outputFormat = s.output_format`

so both views (summary bar reads `setupSuggestion`, Advanced controls read `mode`/`audience`/etc.) reflect the suggestion.

When the user edits a chip and picks a different mode (or whatever), the chip's editor calls the existing `setMode` (or `setAudience`, etc.) action. The summary bar derives display values from those store fields, so changes propagate naturally.

The chip-level rationale text (`suggestion.rationale.mode`, etc.) only stays accurate while the user hasn't overridden the field. Once the user changes a field, we keep showing the original rationale (it's still useful context: "the system suggested X for these reasons; you've now picked Y") — alternative would be to clear the rationale on edit, but that loses information.

---

## Plain-Language Copy

| Surface | Copy |
|---|---|
| Hero heading | **What do you want to do or figure out?** |
| Hero placeholder | *"Describe your goal — a problem to solve, a document to write, a decision to make…"* |
| Generate Setup button | **Generate Setup →** |
| Generate Setup loading | spinner + **Setting up…** |
| Templates section header | **Or start with a template** |
| Summary bar header | **Recommended Approach** |
| Summary bar instruction | *"Click any chip to refine."* |
| Chip label format | `<Field name>: <value>` (e.g., "Mode: Architect") |
| Continue button | **Continue to Review →** |
| Advanced accordion | **Advanced** |
| Empty state | (when objective is blank) Generate Setup button is disabled with tooltip *"Type your objective first"* |
| Error state | red banner: *"Couldn't generate a setup. Open Advanced below to set it up manually."* |

No technical jargon (no "PMInput", "trigger_source", "JSON", "endpoint" surfaced to users).

---

## Data Flow Walkthroughs

### Flow 1 — Smart Setup happy path

1. User opens new session. Lands on Input phase. Hero zone shows empty objective input.
2. User types objective. Generate Setup button enables.
3. User clicks Generate Setup.
4. `setSetupLoading(true)`. Button shows "Setting up…".
5. Frontend calls `api.generateSetup({ objective, model })`.
6. Backend runs 1 LLM call, returns `SetupSuggestion`.
7. Frontend calls `applySetupSuggestion(s)` — writes to store.
8. Summary bar renders above hero with 4 chips and rationales.
9. User reads, optionally clicks a chip to refine, then clicks **Continue to Review**.
10. Existing Review phase flow takes over.

### Flow 2 — Template path (skip Generate Setup)

1. User opens new session.
2. User clicks "Strategy" template card in the templates row.
3. Stack's `initial` config writes to store (mode, objective_placeholder, constraints, output_format).
4. Hero objective field is pre-filled with the placeholder; user edits it.
5. Summary bar appears showing the stack's pre-filled values (no rationales — no LLM call ran). Chip rationales are empty muted text or absent.
6. User clicks Continue to Review.

### Flow 3 — Advanced fallback (Generate Setup error)

1. User clicks Generate Setup; LLM call fails.
2. Error banner: *"Couldn't generate a setup. Open Advanced below to set it up manually."*
3. User opens Advanced accordion, picks mode + audience + constraints + format manually.
4. User clicks Continue to Review.

### Flow 4 — Refine a single suggested field

1. After Generate Setup runs, user clicks the **Mode** chip in the summary bar.
2. Chip expands inline showing the existing `ModeGrid` component, with the current mode highlighted.
3. User picks a different mode.
4. `setMode(newMode)` runs. Chip collapses, showing the new value.
5. The mode rationale text remains visible (it's still informative context).

### Flow 5 — Resume an existing session

1. User opens an existing session via the sidebar.
2. Existing `loadSession` action runs — populates objective, mode, audience, etc.
3. Phase resumes wherever it was (likely past Input).
4. Smart Setup state isn't restored (transient) — but the user is past Input anyway, so it doesn't matter.

---

## Edge Cases

| Case | Behavior |
|---|---|
| Empty objective + Generate Setup clicked | Button disabled. No call. |
| Objective ≤ 5 chars | Button enabled but warning tooltip *"Add a few more words for a better suggestion"*. Call still runs. |
| LLM returns invalid mode | Defensive parser falls back to `"architect"`. Rationale notes the fallback. |
| LLM returns malformed JSON entirely | `OpenRouterError → 502`. Frontend shows error banner. |
| User clicks Generate Setup twice rapidly | Second click ignored if `setupLoading=true`. |
| User edits objective after running Generate Setup | Suggestion stays visible. Re-running Generate Setup overwrites. |
| User picks a template, then clicks Generate Setup | Generate Setup overwrites the template's pre-filled values. |
| User opens Advanced after running Generate Setup | All controls reflect the suggestion. Editing Advanced controls also updates the summary bar (shared store). |
| User has unfinished work (objective filled, then closes tab) | Existing sessionStorage persistence covers this — `setupSuggestion` is included. |
| Anonymous user | Works the same. No Supabase touch. |
| Network/LLM error during Generate Setup | Standard error path. UI unblocks. Advanced is the fallback. |

---

## Out of Scope

Explicitly deferred:

- **"Why this works" interpretation above eval scores** — Project D
- **Audit → Action workflow** — Project D
- **Custom modes (user-defined personas)** — separate future spec
- **Cross-session learning of user setup preferences** — Sean's Email 5 already deferred
- **Tutorial updates for the new flow** — out of scope for Project C; existing tutorial may need light tuning in a follow-up
- **Live re-suggestion as user types** — Generate Setup only runs on explicit click
- **Suggestion history / "show me previous suggestions"** — out of scope
- **Backend persistence of suggestions** — transient only

---

## Testing Strategy

Backend (TDD per project convention):

- `test_setup_suggester.py` — prompt builder includes objective, asks for all 5 fields; defensive parsing handles missing/invalid mode, missing rationale, malformed JSON; valid suggestion round-trips
- `test_setup_router.py` — request shape, route registration, endpoint returns `{ suggestion }` envelope

Total expected backend test count after Project C: ~63 (up from 58 after Project B).

Frontend:
- `npm run build` clean (TypeScript strict, no `any`/`unknown` in new code)
- Manual smoke: type objective → Generate Setup → confirm chips appear → click chip → confirm editor expands → pick new value → chip updates
- Template path smoke: click Strategy card → confirm prefill → continue
- Advanced fallback: simulate error or test by typing manually → confirm Continue still works

---

## Migration

No SQL migration. Smart Setup uses transient client state and one new stateless endpoint. No Supabase changes.

---

## Open Questions Remaining

None. All design decisions resolved per the brainstorming pass.
