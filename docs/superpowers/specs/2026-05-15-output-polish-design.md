# Output Polish — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Source:** Sean Moran's emails — Email 6 (Apr 17, "Why this works"), Email 14 (Apr 25, "Audit → Action"). Plus a tutorial-refresh concern carried over from Projects A-C.
**Project:** D — final of the planned projects. (A complete, B complete, C complete.)

---

## Problem

Three loose ends after Projects A-C make the Output phase feel "almost there" instead of polished:

1. **The eval is correct but technical.** Three score badges (Alignment / Clarity / Drift) plus a fourth Completeness pill tell the *machine* version of "is this answer good?". A user lands on the page and has to translate scores into a plain-English read on their own answer. Sean Email 6:
   > *"adding a quick interpretation layer above [the eval], something like: 'Why this works' — Matches your goal, Clear structure, Stayed focused. Then the existing evaluation… remains exactly as-is underneath."*

2. **Self-Audit produces text the user reads, not actions the user takes.** Sean Email 14:
   > *"Audit → Action: Instead of just showing audit results, it should allow applying improvements directly… Apply All / Select Changes / Ignore."*

3. **The existing 8-step spotlight tutorial points at UI that no longer exists in the same shape.** Projects A-C replaced or moved several of the tutorial's anchor elements (the inline conversation bridge, the old mode grid layout, the Continue Document card, the chat panel). New users see broken or empty spotlight steps, and the powerful new features (Smart Setup, chat panel, Continue Document, completeness) aren't introduced at all.

---

## Solution Summary

Three coordinated changes to the Output phase, plus a tutorial refresh:

**1. "Why this works" interpretation, folded into the existing eval LLM call.**
The evaluator already returns alignment / drift / clarity / completeness. We add a fifth optional field `interpretation` containing a short label (*"Why this works"* / *"What to improve"*) and 3-4 plain-language bullets. Zero new LLM calls. Renders as a card above the existing Quality Scores card on the Output phase.

**2. Audit → Action: Self-Audit button produces a findings panel, not a critique iteration.**
The Output phase's Self-Audit Flow Trigger no longer creates a `trigger_source='self_audit'` iteration with a wall-of-text critique. Instead, a new `/api/audit-findings` endpoint returns a structured list of `AuditFinding { id, category, summary, suggested_change }`. The frontend renders the findings as an inline checklist with **Apply** and **Dismiss** buttons. Clicking Apply runs a new `/api/apply-audit` endpoint that produces a revised iteration with `trigger_source='applied_audit'` and the full pipeline (eval + suggestions + summary + completeness). The Summary-phase audit (`/api/run-self-audit`) is unaffected.

**3. Tutorial refresh.**
The existing 8-step tutorial is replaced with a 9-step tour that covers the post-A/B/C surfaces: Generate Setup, Recommended Approach chips, Advanced section, chat panel, Apply / Save actions, Continue Document, Why this works, Self-Audit findings. The tutorial provider auto-expands any collapsed target (Advanced accordion, chat panel, version history `<details>`) before highlighting the step's anchor.

---

## Key Decisions

### Decision 1 — "Why this works" generation: folded into existing eval call

Same pattern as `completeness` in Project B. The eval LLM call returns one extra optional field. Zero new LLM calls. Bullets are LLM-written (nuanced) rather than templated from scores. The section's label flips based on overall eval quality:

- **"Why this works"** when scores are strong (e.g., alignment=High, drift=Low, clarity=High, completeness=complete)
- **"What to improve"** when there's a clear weakness

The LLM judges and labels. Optional field — old saved sessions parse cleanly.

### Decision 2 — Audit → Action: ephemeral findings panel, no critique iteration

Clicking Self-Audit produces structured findings rendered inline (not a critique iteration). The audit itself doesn't show up in version history. Only the *applied* iteration (after the user clicks Apply) becomes a versioned checkpoint with `trigger_source='applied_audit'`. This matches Project A's "Apply to answer" / "Save as new version" mental model — system surfaces actionable suggestions, user applies them, a new iteration is the result.

### Decision 3 — Findings shape: minimal with category tag

```python
class AuditFinding(BaseModel):
    id: str
    category: str   # short tag: "Coverage", "Clarity", "Tone", "Logic gap", etc.
    summary: str    # one line — what's wrong
    suggested_change: str  # one line — what to do about it
```

LLM instructed to surface the 3-7 most impactful findings (cap at 7). Category is open-ended free text from the LLM (not a closed enum) — keeps the surface flexible without enum-maintenance overhead.

### Decision 4 — Apply / Dismiss two-button layout, default-all-checked

Sean's three-action framing (Apply All / Select Changes / Ignore) collapses cleanly into two buttons:

- **Apply** — applies every checked finding (default: all checked → "Apply All" behavior).
- **Dismiss** — closes the panel, no action ("Ignore" behavior).

To "Select Changes": user unchecks the findings they want to skip, then clicks Apply.

Each finding's row has a checkbox, category chip, summary, and suggested-change italic line.

### Decision 5 — Tutorial refresh: 9 steps, auto-expand collapsed targets

The tutorial provider gains an `expandTargetIfCollapsed` capability: each step config can declare its target element and whether to programmatically expand any collapsed ancestor (Advanced `<details>`, chat panel toggle, version-history `<details>`) before highlighting the anchor. Without this, half the new tour points at elements that aren't on-screen.

### Decision 6 — Out of scope: Suggestions, Summary-phase audit, custom modes

- **Suggestions** (the existing list below the eval) stays as text. Sean's "Apply All / Select / Ignore" pattern could extend here, but suggestions are typically coaching-style ("try X next") rather than fix-style. Distinct enough to defer.
- **Summary-phase audit** (`/api/run-self-audit`) stays unchanged. Different surface, different intent (whole-session retrospective).
- **Custom modes** (user-defined personas) deferred to a future Project E.

---

## Architecture

### "Why this works" data flow

```
Generate output → Eval LLM call (now returns 5 fields, not 4) →
   { alignment, drift, clarity, completeness, interpretation } →
   Iteration created with all 5 fields →
   Output phase renders WhyThisWorks card above EvalSection
```

### Audit → Action data flow

```
User clicks Self-Audit button
       │
       ▼
POST /api/audit-findings  (1 LLM call, generate_json)
   Request: { inputs, current_output, iteration_history, model }
   Response: { findings: AuditFinding[] }
       │
       ▼
AuditFindingsPanel renders inline (below Generated Output card,
above Mode card). Each finding is a checkbox row.

User toggles checkboxes (optional). Clicks Apply.
       │
       ▼
POST /api/apply-audit  (1 generation + 3 parallel pipeline = 4 LLM calls)
   Request: { inputs, source_iteration, findings: AuditFinding[],
              iteration_number, iteration_history, model }
   LLM generation: "Original output: X. Address these findings: [list].
                   Produce a revised version aligned with the objective."
   Pipeline: eval + suggestions + summary in parallel
   Response: { iteration, suggestions }
       │
       ▼
appendIteration() — new version with trigger_source='applied_audit'
Active version auto-advances. Findings panel disappears.
```

### Tutorial refresh

```
TutorialProvider holds step list + currentStep state
For each step:
  - target: CSS selector or data-tutorial attribute
  - title: short heading
  - body: 1-2 sentence explainer
  - expandTarget?: () => void  // optional, expand any collapsed ancestor
On step entry:
  - If expandTarget defined, call it BEFORE locating the anchor
  - Locate the anchor element, position spotlight overlay
  - Render step body in a tooltip beside the anchor
On step exit: collapse-target-back is NOT done — leave it open if the user opened it during the tour (better UX, less jarring)
```

---

## Data Model

### Backend Schema Changes (`backend/promptmaster/schemas.py`)

```python
class WhyThisWorks(BaseModel):
    """Plain-language interpretation of an output's eval."""
    label: Literal["Why this works", "What to improve"]
    bullets: list[str] = Field(default_factory=list)


class EvaluationResult(BaseModel):
    alignment: DimensionScore
    drift: DimensionScore
    clarity: DimensionScore
    completeness: CompletenessResult | None = Field(default=None)
    interpretation: WhyThisWorks | None = Field(default=None)   # NEW, optional


class AuditFinding(BaseModel):
    """One actionable finding produced by the audit LLM call."""
    id: str
    category: str
    summary: str
    suggested_change: str
```

`interpretation` is optional (`| None = None`) for backward compatibility with old saved sessions.

### Frontend Types (`frontend/src/types/index.ts`)

```typescript
export interface WhyThisWorks {
  label: 'Why this works' | 'What to improve';
  bullets: string[];
}

export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
  completeness?: CompletenessResult | null;
  interpretation?: WhyThisWorks | null;
}

export interface AuditFinding {
  id: string;
  category: string;
  summary: string;
  suggested_change: string;
}

export interface AuditFindingsRequest {
  inputs: PMInput;
  current_output: string;
  iteration_history?: Iteration[];
  model?: string;
}

export interface AuditFindingsResponse {
  findings: AuditFinding[];
}

export interface ApplyAuditRequest {
  inputs: PMInput;
  source_iteration: Iteration;
  findings: AuditFinding[];
  iteration_number: number;
  iteration_history?: Iteration[];
  model?: string;
}
```

### Zustand Store Additions

```typescript
// State
auditFindings: AuditFinding[] | null;       // null = no panel; [] = panel open with 0 findings
auditLoading: boolean;
applyAuditLoading: boolean;

// Actions
setAuditFindings: (f: AuditFinding[] | null) => void;
setAuditLoading: (b: boolean) => void;
setApplyAuditLoading: (b: boolean) => void;
```

### Trigger Source Addition

Add to `_TRIGGER_LABELS` in `backend/promptmaster/session_context.py`:

```python
"applied_audit": "Applied audit findings",
```

---

## Backend API

### Eval prompt extension

Extend `EVALUATOR_PROMPT` in `backend/promptmaster/evaluator.py` to also produce an `interpretation` field. The relevant prompt addition:

```
5. INTERPRETATION: In 3-4 short bullets (plain English, no jargon), explain
   why this output succeeds OR what to improve. Use "Why this works" as the
   label when the output is strong overall (alignment High, drift Low,
   clarity High, completeness Complete). Use "What to improve" when there's
   a clear weakness in any dimension.
   - bullets[0]: one short sentence (≤8 words) about the goal/alignment
   - bullets[1]: one short sentence about structure/clarity
   - bullets[2]: one short sentence about focus/drift
   - bullets[3] (optional): one short sentence about completeness or another
     standout property
   Each bullet should be self-contained — readable without the others.
```

Response shape gains `interpretation`:

```json
{
  "alignment": { ... },
  "drift": { ... },
  "clarity": { ... },
  "completeness": { ... },
  "interpretation": {
    "label": "Why this works" | "What to improve",
    "bullets": ["...", "...", "..."]
  }
}
```

Defensive parsing: missing or malformed interpretation → `None` (graceful degrade, no UI shown).

### New Endpoints

| Endpoint | Purpose | LLM calls |
|---|---|---|
| `POST /api/audit-findings` | Run audit, return structured findings | 1 (generate_json) |
| `POST /api/apply-audit` | Apply selected findings → new iteration with full pipeline | 4 (1 generation + 3 parallel) |

Both live in a new `backend/routers/audit.py`. Pattern matches `routers/continuation.py` from Project B.

### New Backend Module

`backend/promptmaster/audit_findings.py`:
- `build_audit_findings_prompt(inputs, current_output, iteration_history)` → `(system, user)` tuple
- `async generate_audit_findings(client, model, inputs, current_output, iterations)` → `list[AuditFinding]`
- `build_apply_audit_prompt(inputs, source_iteration, findings, iterations)` → `(system, user)` tuple

The audit prompt uses Cold Critic framing (consistent with the existing self-audit flow) but instructs the LLM to return JSON only — 3-7 findings, each with category/summary/suggested_change.

The apply-audit prompt: *"Here's the original output. Here are the audit findings to address. Produce a revised version that addresses each finding while preserving alignment with the original objective."*

### Pipeline Helper Reuse

`/api/apply-audit` reuses `build_iteration_with_full_pipeline` from `backend/routers/_pipeline.py` (Project B). No new helper needed.

### Self-Audit Button Behavior Change

Today: clicking Self-Audit in the Output phase calls `/api/flow-trigger` with `trigger='self_audit'`, producing a diagnostic iteration.

After Project D: Self-Audit calls `/api/audit-findings`, which writes findings to the store but does NOT create an iteration. The existing diagnostic branch in `routers/engine.py` for the `self_audit` trigger is **removed** (along with `challenge` and `reframe` — see below for those).

Wait, the existing Flow Triggers are: Challenge / Self-Audit / Reframe / Drift Alert / Refine: Shorter / etc. Only Self-Audit changes. Challenge and Reframe stay as diagnostic iterations — they're different kinds of meta-moves (counter-arguments, problem reframing), not "fixes you apply." Drift Alert stays. Refine variants stay.

### Removed Code

- The `"self_audit"` branch is removed from `is_diagnostic = req.trigger in ("challenge", "self_audit", "reframe")` in `routers/engine.py` because Self-Audit no longer flows through `/api/flow-trigger`. Updated check: `is_diagnostic = req.trigger in ("challenge", "reframe")`.
- Trigger label `"self_audit": "Self-Audit"` is retained in `_TRIGGER_LABELS` for backward compat (old saved sessions with self-audit iterations still render).
- `build_self_audit_response_prompt` in `flow_triggers.py` (if used only for the now-removed self_audit branch) can be removed. Check usage before deleting.

---

## Frontend

### New Components

```
frontend/src/components/output/
├── why-this-works-card.tsx       # 3-4 bullets above the eval, NEW
├── audit-findings-panel.tsx      # Findings checklist + Apply/Dismiss, NEW
└── audit-finding-row.tsx         # Single finding row, NEW

frontend/src/components/tutorial/
└── tutorial-provider.tsx         # Modify — refreshed step list + expandTarget capability
```

### `WhyThisWorksCard` interface

```typescript
interface WhyThisWorksCardProps {
  interpretation: WhyThisWorks;
}
```

Renders only when `currentIteration?.evaluation?.interpretation` is present. Placed above `EvalSection` in `output-phase.tsx`.

Visual treatment:
- White card with `shadow-ambient` and `rounded-2xl`
- Header: the `label` ("Why this works" / "What to improve") in bold tracking-widest
- 3-4 bullets rendered as a vertical list with a small icon (check_circle for "Why this works", auto_fix_high for "What to improve")
- Left accent border colored by label (emerald for positive, amber for improve)

### `AuditFindingsPanel` interface

```typescript
interface AuditFindingsPanelProps {
  findings: AuditFinding[];
  loading: 'apply' | null;       // 'apply' when apply-audit is in flight
  onApply: (selectedFindingIds: string[]) => void;
  onDismiss: () => void;
}
```

Renders only when `auditFindings` in store is non-null. Placed between Generated Output card and Mode card in `output-phase.tsx` (or between Generated Output card and the existing Continue Document card if both happen to apply).

Internal state: `Record<string, boolean>` of which findings are checked. Defaults all to `true`.

### `AuditFindingRow` interface

```typescript
interface AuditFindingRowProps {
  finding: AuditFinding;
  checked: boolean;
  onToggle: () => void;
}
```

Renders a checkbox + category chip + summary + suggested-change italic line.

### API Client Additions

```typescript
api.auditFindings(req: AuditFindingsRequest): Promise<AuditFindingsResponse>
api.applyAudit(req: ApplyAuditRequest): Promise<IterationFromConversationResponse>
```

(`IterationFromConversationResponse` from Project A — same `{ iteration, suggestions }` envelope. Reuse.)

### `output-phase.tsx` Modifications

1. Add `WhyThisWorksCard` render above `EvalSection`:
   ```tsx
   {currentIteration?.evaluation?.interpretation && (
     <WhyThisWorksCard interpretation={currentIteration.evaluation.interpretation} />
   )}
   ```

2. Add `AuditFindingsPanel` render between Generated Output and Mode card:
   ```tsx
   {auditFindings && (
     <AuditFindingsPanel
       findings={auditFindings}
       loading={applyAuditLoading ? 'apply' : null}
       onApply={(ids) => handleApplyAudit(ids)}
       onDismiss={() => setAuditFindings(null)}
     />
   )}
   ```

3. Replace the existing Self-Audit Flow Trigger handler:
   - Old: `handleFlowTrigger('self_audit')` → calls `/api/flow-trigger`
   - New: `handleAuditFindings()` → calls `/api/audit-findings`, writes result to `auditFindings` store

4. Add `handleApplyAudit(selectedIds)`:
   ```typescript
   async function handleApplyAudit(selectedIds: string[]) {
     if (!currentIteration || !auditFindings) return;
     setApplyAuditLoading(true);
     setError(null);
     try {
       const selected = auditFindings.filter((f) => selectedIds.includes(f.id));
       const res = await api.applyAudit({
         inputs: buildInputs(),
         source_iteration: currentIteration,
         findings: selected,
         iteration_number: iterations.length + 1,
         iteration_history: iterations,
         model,
       });
       appendIteration(res.iteration, res.suggestions);
       setAuditFindings(null); // panel disappears
     } catch (err) {
       setError(err instanceof Error ? err.message : 'Apply audit failed.');
     } finally {
       setApplyAuditLoading(false);
     }
   }
   ```

5. Extend `anyLoading` to include `auditLoading` and `applyAuditLoading`.

### Tutorial Refresh

Modify `frontend/src/components/tutorial/tutorial-provider.tsx`:

1. Replace the step list with 9 new steps anchored on the post-A/B/C UI elements (see Tutorial Step List below).
2. Add an `expandTarget` capability: each step config can optionally declare a callback that programmatically expands the target's collapsed ancestor before positioning the spotlight.
3. The expand callback uses store actions where possible (e.g., `setChatPanelOpen(true)`) and direct DOM manipulation only when the target is inside a native `<details>` element (set `.open = true`).

The provider's step transition logic becomes:

```typescript
function goToStep(index: number) {
  const step = STEPS[index];
  step.expandTarget?.();  // expand any collapsed ancestor first
  // small timeout to let CSS transitions settle
  setTimeout(() => {
    setCurrentStep(index);
  }, 100);
}
```

### Tutorial Step List

Anchors are tagged with `data-tutorial="<key>"` attributes on the relevant DOM elements.

| # | Anchor | Title | Body | Expand action |
|---|---|---|---|---|
| 1 | `[data-tutorial="hero-objective"]` | **Start with your goal** | *"Describe what you want to do or figure out. The system builds the rest from here."* | none |
| 2 | `[data-tutorial="generate-setup"]` | **Let the system suggest** | *"Generate Setup recommends a mode, audience, constraints, and format from your objective."* | none |
| 3 | `[data-tutorial="recommended-approach"]` | **Refine if you want** | *"Click any chip to refine. Each shows what was picked and why."* | (auto-runs after Generate Setup) |
| 4 | `[data-tutorial="advanced-section"]` | **Full controls live here** | *"Open Advanced any time for direct control over mode, constraints, format, and more."* | open `<details>` |
| 5 | `[data-tutorial="continue-review"]` | **Continue to Review** | *"Once you're happy with the setup, continue to review the assembled prompt."* | none |
| 6 | `[data-tutorial="output-card"]` | **Your generated answer** | *"This is the structured output. Use the buttons below to iterate."* | (on Output phase) |
| 7 | `[data-tutorial="chat-panel"]` | **Chat about it** | *"The chat panel lets you ask follow-ups without affecting your version. Apply or Save as new version when you have something useful."* | `setChatPanelOpen(true)` |
| 8 | `[data-tutorial="why-this-works"]` | **Why this works** | *"This card translates the technical eval into plain language — quick read on what's strong or weak."* | none |
| 9 | `[data-tutorial="self-audit"]` | **Self-Audit → Apply** | *"Click Self-Audit and the system surfaces specific fixes you can apply directly."* | none |

Steps 6-9 only show on the Output phase. The tutorial state machine handles phase transitions: if the user is on Input phase, only steps 1-5 are reachable; arriving at Output phase enables 6-9.

### Plain-Language Copy

Following the project's user-feedback memory:

| Surface | Copy |
|---|---|
| Why-this-works card label | *"Why this works"* (positive) / *"What to improve"* (negative) |
| Audit panel header | **Audit findings** |
| Audit panel subhead | *"Pick which fixes to apply, then click Apply."* |
| Apply button | **Apply** (with spinner + **Applying…** when loading) |
| Dismiss button | **Dismiss** |
| Disabled tooltip | *"At least one finding must be checked."* (when no checkbox is on) |
| Empty findings | *"No issues found."* (panel auto-dismisses after 2s) |
| Tutorial step "Got it" | **Got it** |
| Tutorial step "Next" | **Next →** |
| Tutorial step "Skip" | **Skip tutorial** |

No technical jargon (no "trigger_source", "endpoint", "structured findings") surfaced to users.

---

## Edge Cases

| Case | Behavior |
|---|---|
| Old saved session — eval has no `interpretation` field | Parses cleanly. WhyThisWorksCard not rendered. |
| LLM eval returns malformed interpretation JSON | Graceful degrade: `interpretation = None`. Other eval dimensions unaffected. |
| Audit returns 0 findings | Panel briefly shows *"No issues found."*, auto-dismisses after 2s. |
| Audit returns >7 findings | LLM is instructed to cap at 7; if it doesn't, the panel just renders all of them (no enforcement at the boundary — the LLM's behavior is the contract). |
| User clicks Self-Audit while audit panel is open | Re-runs, replaces the panel contents. |
| User clicks Apply with zero findings checked | Apply button is disabled. Tooltip explains. |
| User clicks Continue Document or Chat Apply while audit panel is open | Other actions are disabled while `auditLoading` / `applyAuditLoading` is true. When idle, other actions still work; opening another panel auto-dismisses the audit panel (or both can coexist — the cleaner choice is dismiss on any non-audit action). **Choice: dismiss on any other action.** |
| User changes active version while audit panel is open | Audit panel is dismissed. Findings were tied to the previous active version. |
| Network error during `/api/audit-findings` | Standard error path: setError, panel doesn't open. |
| Network error during `/api/apply-audit` | setError, findings panel stays open so user can retry. |
| Tutorial step's target element doesn't exist (e.g., chat panel not yet visible) | Provider falls back to a center-of-screen tooltip with the step body, anchored to the viewport. Logs a warning. |
| User opens the tutorial mid-session (existing iteration, no Smart Setup run) | Tutorial still walks through all 9 steps. Step 3 ("Refine if you want") notes that suggestions appear after Generate Setup; user can mentally skip if they already configured manually. |

---

## Out of Scope

Explicitly deferred:

- **Suggestions panel apply pattern.** Sean's email implied any "side interaction" could get the Apply All / Select / Ignore treatment. We're applying it to Self-Audit only for now. Suggestions stay as text.
- **Summary-phase audit (`/api/run-self-audit`).** Different surface, different intent (whole-session retrospective). Unchanged.
- **Custom modes (user-defined personas).** Significant scope — future Project E.
- **Cross-session learning of which findings users tend to dismiss/apply.** Telemetry idea; future.
- **Highlighting which part of the output a finding targets.** Spec's "AuditFinding" had this as Option C — rejected as over-engineered for first cut.
- **Tutorial step branching based on user role / experience.** Single linear tour.
- **Tutorial replay from Settings.** Existing replay-from-sidebar mechanism is preserved.

---

## Testing Strategy

Backend (TDD):

- `test_evaluator_interpretation.py` — extended eval prompt asks for interpretation; response parsing handles present/missing/malformed; label is one of the two allowed values
- `test_audit_findings.py` — audit prompt builder includes objective/output, asks for JSON; defensive parsing handles missing/malformed/empty findings
- `test_apply_audit.py` — prompt builder includes findings and original output; instruction to revise while preserving objective
- `test_audit_router.py` — request/response shapes, route registration, behavior tests with TestClient + mocked client (both endpoints)
- `test_schemas.py` extensions — `WhyThisWorks`, `AuditFinding` round-trip; `EvaluationResult.interpretation` optional for back compat

Expected total backend tests after Project D: ~90 (up from 75 after Project C).

Frontend:

- `npm run build` clean (TypeScript strict, no `any`/`unknown` in new code)
- Manual smoke:
  - Generate an output with a real LLM — confirm WhyThisWorksCard renders above eval with label and 3-4 bullets
  - Click Self-Audit — confirm findings panel appears with category chips, checkboxes, Apply/Dismiss buttons
  - Uncheck one finding, click Apply — confirm new iteration created with `trigger_source='applied_audit'`, eval/suggestions/summary all present, findings panel disappears
  - Refresh tutorial (replay) — confirm each step's anchor is visible (no broken steps), and steps 4/7 auto-expand the Advanced section / chat panel respectively

---

## Migration

No SQL migration. All changes ride along the existing JSONB session save path via new optional fields (`interpretation`) and a new transient store field (`auditFindings`).

---

## Open Questions Remaining

None. All design decisions resolved per the brainstorming pass.
