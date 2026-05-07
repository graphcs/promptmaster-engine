# Completion Detection + State Continuity — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Source:** Sean Moran's emails April 25 — Emails 10, 11, 12, 13 — plus Email 15 (output stability concerns)
**Project:** B — second of three remaining projects (Project A = Conversation/Iteration Refactor, complete; Project C = Smart Setup; Project D = Output Polish)

---

## Problem

Long structured outputs (BRDs, proposals, multi-section reports) fail in two distinct ways today:

1. **Mechanical cutoff.** The model hits its `max_tokens` ceiling and stops mid-sentence. The user sees a half-finished document and has to type "continue" themselves, hoping the model resumes coherently. Sean Email 12: *"users should not need to know how to prompt for continuation at all."*

2. **Soft completion / depth-collapse.** Even when the model has enough room, asking it to produce a 15-section BRD in one shot causes shallow front-loading, premature wrap-up at section 8, or off-topic drift in later sections. Sean Email 15: *"consistent structure and sectioning, strong alignment to the original objective, minimal drift across longer outputs."*

Both failure modes share the same fix: **chunked generation with structural awareness** — generate in pieces, detect when each piece is complete, and resume cleanly until the document is done. Sean Email 10 calls this layer *"critical for demos and usability."*

---

## Solution Summary

Two coordinated layers:

**Layer 1 — State Continuity.** When the user clicks Continue Document, the system generates a structured snapshot of what's been done (`completed_topics`, `current_topic`, `key_definitions`, `next_topic_hint`) and feeds it into the continuation prompt. The snapshot is stored on the resulting iteration for inspection.

**Layer 2 — Completion Detection + Continuation.** Every eval'd iteration's evaluation now includes a fourth dimension: `completeness` (status + reason). When status is `incomplete`, a **Continue Document** button appears between the output card and the Mode card. One click runs the snapshot + continuation pipeline and produces a new iteration with the merged content. No prompt-writing required from the user.

The two layers ship together — Layer 1 makes Layer 2's continuation prompts substantive instead of brittle.

---

## Key Decisions

The brainstorming round resolved six foundational questions. They're locked in here so the implementation plan can reference them.

### Decision 1 — Scope: both layers in a single spec

State Continuity and Completion+Continuation are coupled in practice. Layer 2 alone would produce continuation prompts with no structured context to draw on. Sean's email explicitly calls the *combination* demo-critical.

### Decision 2 — Completeness detection: LLM-judged via the existing eval call (free), with `finish_reason='length'` as a mechanical pre-filter

The existing `evaluator.evaluate_output()` already runs an LLM call that judges three dimensions (alignment, clarity, drift). We extend its prompt to ask for a fourth: completeness. Zero added LLM calls per iteration, no manual length threshold.

`finish_reason='length'` from the OpenRouter response is a free signal that the model literally hit its ceiling — that always overrides LLM judgment to `incomplete`.

### Decision 3 — Continue Document creates a new iteration with merged content

Continuation does not mutate the prior iteration's output (Project A's iterations are immutable checkpoints). Instead, it creates a new iteration with `trigger_source='continuation'` whose `output` is `previous_output + "\n\n" + continuation_text`. Eval / suggestions / summary all run on the merged output. Multi-continuation works naturally — each click produces one new linear version.

### Decision 4 — Continuity snapshot generated lazily on Continue click, stored on the new iteration

Snapshots are not generated eagerly on every iteration. Only when the user clicks Continue Document does a small `generate_json` LLM call produce the structured snapshot. The snapshot is then attached to the resulting continuation iteration as `Iteration.continuity_snapshot`.

If a continuation iteration is itself incomplete and the user clicks Continue again, a *fresh* snapshot is generated from that iteration's output. Snapshots are not chained or carried forward — each Continue recomputes.

### Decision 5 — No manual length threshold

Earlier brainstorming considered gating the completeness LLM call by output length (>500 tokens). Rejected: manual thresholds are fragile, hard to tune, and create invisible-to-the-user behavior. Folding completeness into the existing eval call sidesteps the problem entirely.

### Decision 6 — Continue Document button placement: inline primary CTA between Generated Output card and Mode card

Maximally discoverable. Card title "Continue Document", reason as one short italic line ("Stopped mid-Section 7: Risk Analysis."), primary button. Renders only when `currentIteration?.evaluation?.completeness?.status === 'incomplete'`.

---

## Architecture

### Mental Model

```
                       ┌─────────────────────────────────────────────┐
User clicks Execute    │                                             │
─────►  Generate ──────► finish_reason='length'?  ──► YES ──► force  │
                       │  NO ─►                              completeness=incomplete
                       │                                             │
                       └────────►  Eval LLM call (extended) ─────────┘
                                  Returns: alignment, clarity, drift, completeness

                       ┌─────────────────────────────────────────────┐
                       │ Iteration created with eval + summary +     │
                       │ suggestions. If completeness === incomplete │
                       │ → render Continue Document button.          │
                       └─────────────────────────────────────────────┘

User clicks Continue Document
  │
  ▼
┌─ Generate continuity snapshot ──┐    (1 small LLM call, generate_json)
│  completed_topics, current_topic,│
│  key_definitions, next_topic_hint│
└──────────────────────────────────┘
  │
  ▼
Build continuation prompt (PMInput + snapshot + previous output + "do not repeat")
  │
  ▼
Generate continuation text  (1 LLM call, generate_with_meta — captures finish_reason)
  │
  ▼
merged_output = previous_output + "\n\n" + continuation_text
  │
  ▼
Run eval + suggestions + summary on merged output (3 LLM calls in parallel)
  │
  ▼
New iteration:
  - trigger_source='continuation'
  - continuity_snapshot=<snapshot from step 1>
  - output=merged_output
  - evaluation incl. completeness (forced incomplete if continuation also hit length)
  │
  ▼
appendIteration() → active version auto-advances → chat panel switches to new version
```

### Layer Responsibilities

| Layer | Lives in | Responsibility |
|---|---|---|
| Pre-filter | `routers/engine.py`, `routers/conversation.py`, `routers/continuation.py` | Override `evaluation.completeness` to `incomplete` when `finish_reason='length'` |
| Completeness LLM judgment | `promptmaster/evaluator.py` | Extended prompt asks for a 4th dimension. Returns COMPLETE / INCOMPLETE + reason |
| State continuity snapshot | `promptmaster/continuity.py` | Lazy LLM call. Returns structured snapshot. Stored on continuation iteration |
| Continuation orchestration | `routers/continuation.py` | Snapshot → continuation prompt → generate → merge → pipeline (eval + suggestions + summary) |
| UI surfaces | `eval-section.tsx`, `output-phase.tsx` | Render 4th completeness pill + Continue Document card |

---

## Data Model

### Backend Schema Changes (`backend/promptmaster/schemas.py`)

```python
class CompletenessResult(BaseModel):
    status: Literal["complete", "incomplete"]
    reason: str = ""


class EvaluationResult(BaseModel):
    alignment: DimensionScore
    drift: DimensionScore
    clarity: DimensionScore
    completeness: CompletenessResult | None = Field(
        default=None,
        description="LLM/mechanical judgment of structural completeness. Optional for backward compat with old saved sessions.",
    )

    @property
    def needs_realignment(self) -> bool:
        return self.alignment.score == "Low" or self.drift.score == "High"


class ContinuitySnapshot(BaseModel):
    """Snapshot of progress used to build a continuation prompt.

    Generated lazily when the user clicks Continue Document.
    Stored on the resulting continuation iteration for later inspection.
    """
    completed_topics: list[str] = Field(default_factory=list)
    current_topic: str | None = Field(default=None)
    key_definitions: list[str] = Field(default_factory=list)
    next_topic_hint: str | None = Field(default=None)


class Iteration(BaseModel):
    # ...existing fields...
    continuity_snapshot: ContinuitySnapshot | None = Field(
        default=None,
        description="Snapshot used to build this iteration's continuation prompt. Set on continuation iterations only.",
    )
```

Both new fields are optional with `default=None` so old saved sessions parse cleanly.

### Frontend Type Changes (`frontend/src/types/index.ts`)

```typescript
export interface CompletenessResult {
  status: 'complete' | 'incomplete';
  reason: string;
}

export interface ContinuitySnapshot {
  completed_topics: string[];
  current_topic: string | null;
  key_definitions: string[];
  next_topic_hint: string | null;
}

export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
  completeness?: CompletenessResult | null;
}

export interface Iteration {
  // ...existing fields...
  continuity_snapshot?: ContinuitySnapshot | null;
}

export interface ContinueDocumentRequest {
  inputs: PMInput;
  incomplete_iteration: Iteration;
  iteration_number: number;
  iteration_history?: Iteration[];
  model?: string;
}
```

### Trigger Source Addition

Add to `_TRIGGER_LABELS` in `backend/promptmaster/session_context.py`:

```python
"continuation": "Continued document",
```

---

## Backend API

### New Endpoint

| Endpoint | Purpose | LLM calls |
|---|---|---|
| `POST /api/continue-document` | Snapshot + continuation + eval pipeline → new merged iteration | 5 (1 snapshot + 1 continuation + 3 parallel: eval + suggestions + summary) |

### Request / Response Shapes

```python
# In backend/routers/continuation.py
class ContinueDocumentRequest(BaseModel):
    inputs: PMInput
    incomplete_iteration: Iteration
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""

# Reuses IterationFromConversationResponse from conversation.py
# (which is { iteration, suggestions })
```

### LLM Client Extension (`backend/promptmaster/llm_client.py`)

```python
async def generate_with_meta(
    self,
    prompt: str,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 16384,
    json_mode: bool = False,
    model: str | None = None,
) -> tuple[str, dict[str, int], str]:
    """Like generate(), but also returns the OpenRouter finish_reason."""
```

The existing `generate()` is preserved as-is. Callers that need the finish_reason — `run-iteration`, `flow-trigger`, the three conversation endpoints, and the new continuation endpoint — switch to `generate_with_meta()`. All other call sites stay on the existing API.

### Continuity Module (`backend/promptmaster/continuity.py`)

```python
"""Snapshot generation and continuation prompt building."""

def build_snapshot_prompt(
    inputs: PMInput,
    previous_output: str,
) -> tuple[str, str]:
    """Return (system, user) prompts for the snapshot LLM call."""

async def generate_continuity_snapshot(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    previous_output: str,
) -> ContinuitySnapshot:
    """Run a small generate_json call. Return parsed snapshot."""

def build_continuation_prompt(
    inputs: PMInput,
    incomplete_iteration: Iteration,
    snapshot: ContinuitySnapshot,
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Return (system, user) prompts for the continuation generation."""
```

The continuation system prompt extends the shared scaffolding from `conversation._shared_system` (PromptMaster context + mode prompt + session history) with a CONTINUATION MODE instruction block that references the snapshot fields and the "do not repeat" rule.

### Evaluator Update (`backend/promptmaster/evaluator.py`)

Extend the eval prompt to ask the LLM to also judge completeness:

```
Also judge whether the output appears COMPLETE or INCOMPLETE.
- COMPLETE: the answer covers what the objective required, with appropriate
  depth across all expected sections/topics.
- INCOMPLETE: the answer stops mid-section, runs out of room, covers only
  some expected sections, or skips depth on later sections.

If INCOMPLETE, name where it stops in one short sentence
(e.g., "Stopped mid-Section 7: Risk Analysis.").
```

Response shape:

```json
{
  "alignment": { "score": "...", "explanation": "..." },
  "clarity":   { "score": "...", "explanation": "..." },
  "drift":     { "score": "...", "explanation": "..." },
  "completeness": { "status": "complete" | "incomplete", "reason": "..." }
}
```

Parsing tolerates both shapes (with and without `completeness`) so older eval responses still parse.

### Pre-filter Override Pattern

Every endpoint that creates an iteration with eval — `run-iteration`, `flow-trigger` (non-diagnostic branch), `apply-to-answer`, `save-as-new-version`, `continue-document` — runs the same override after eval returns:

```python
content, usage, finish_reason = await client.generate_with_meta(...)
# ...eval runs...
if finish_reason == "length" and evaluation is not None:
    evaluation = evaluation.model_copy(update={
        "completeness": CompletenessResult(
            status="incomplete",
            reason="Output reached the model's length limit.",
        )
    })
```

This is a small helper, likely in `routers/_pipeline.py` (which also gets the extracted `_build_iteration_with_full_pipeline` helper from `conversation.py`).

### Pipeline Helper Extraction

`_build_iteration_with_full_pipeline` currently lives in `backend/routers/conversation.py` and is used by the apply and save endpoints. Project B adds a third caller (continuation). Extract to `backend/routers/_pipeline.py` for shared use. Both `conversation.py` and `continuation.py` import it.

### Router Registration

`backend/main.py` adds:

```python
from routers.continuation import router as continuation_router
app.include_router(continuation_router)
```

---

## Frontend

### API Client (`frontend/src/lib/api/client.ts`)

```typescript
async continueDocument(req: ContinueDocumentRequest): Promise<IterationFromConversationResponse> {
  return apiFetch('/api/continue-document', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
```

### Zustand Store (`frontend/src/stores/session-store.ts`)

```typescript
// State
continuationLoading: boolean;

// Action
setContinuationLoading: (b: boolean) => void;
```

Kept separate from `chatLoading`. Both feed into the existing `anyLoading` derivation in `output-phase.tsx`.

### EvalSection Update (`frontend/src/components/shared/eval-section.tsx`)

Add a fourth pill alongside alignment / clarity / drift:

```
Alignment: High    Clarity: High    Drift: Low
Completeness: Incomplete
↳ Stopped mid-Section 7: Risk Analysis.
```

Visual treatment matching existing pills:
- `complete` → green pill (same as alignment=High)
- `incomplete` → amber pill (same as alignment=Medium)

Reason rendered as italic muted text below the pill.

### Continue Document Card (`frontend/src/components/phases/output-phase.tsx`)

Insert between the Generated Output card and the Mode-for-next-version card. Renders only when `currentIteration?.evaluation?.completeness?.status === 'incomplete'`:

```
┌─ Continue Document ─────────────────────────────────────┐
│  Stopped mid-Section 7: Risk Analysis.                  │
│                                                          │
│  [ Continue Document → ]                                 │
└──────────────────────────────────────────────────────────┘
```

Button text: **Continue Document →** (with `arrow_forward` material symbol). Loading state: spinner + **Continuing…**. Disabled when `anyLoading`.

Handler:

```typescript
async function handleContinueDocument() {
  if (!currentIteration) return;
  setContinuationLoading(true);
  setError(null);
  try {
    const res = await api.continueDocument({
      inputs: buildInputs(),
      incomplete_iteration: currentIteration,
      iteration_number: iterations.length + 1,
      iteration_history: iterations,
      model,
    });
    appendIteration(res.iteration, res.suggestions);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Continue document failed.');
  } finally {
    setContinuationLoading(false);
  }
}
```

`appendIteration()` from Project A handles auto-advance of `activeIterationNumber` and seeding an empty chat for the new version.

### `anyLoading` Update

```typescript
const anyLoading =
  realignLoading || refineLoading || flowLoading !== null ||
  continuationLoading;
```

### Iteration History Rows

Existing alignment / clarity / drift score badges already render in the iteration history `<details>` block. Add the completeness pill alongside the other three when present. Same row layout, no new component.

---

## Plain-Language Copy

Following the project's user-feedback memory ("plain English, no technical jargon"):

| Surface | Copy |
|---|---|
| Card title | **Continue Document** |
| Reason line | *italic, the LLM's reason verbatim, e.g., "Stopped mid-Section 7: Risk Analysis."* |
| Primary button | **Continue Document →** |
| Loading | spinner + **Continuing…** |
| Eval pill (incomplete) | **Completeness: Incomplete** |
| Eval pill (complete) | **Completeness: Complete** |
| Disabled tooltip | *"Another action is in progress…"* (when `anyLoading` blocks) |
| Network error | *"Couldn't reach the server. Try again?"* (existing pattern) |

Not used: "continuation pipeline", "snapshot", "iteration", "trigger_source", "completion check". Internal terms stay internal.

---

## Edge Cases

| Case | Behavior |
|---|---|
| Old saved session, eval has no `completeness` field | Parses cleanly. No Continue button. |
| LLM eval returns malformed completeness JSON | Graceful degrade: `completeness=None`. Other dimensions unaffected. |
| Continuation iteration is itself incomplete | New iteration's eval shows `completeness=incomplete`. Continue button reappears. User clicks again. |
| User clicks Continue while chat / Apply / Save in flight | Continue button disabled (`anyLoading` covers all). |
| Diagnostic flow trigger (Challenge / Self-Audit / Reframe) | No eval → no completeness → Continue button never appears. |
| Realignment iteration completes incompletely | Same eval pipeline runs; completeness set; Continue available. |
| Anonymous user | Works the same. Supabase isn't involved in the continuation flow. |
| Network / LLM error during continuation | `OpenRouterError → 502` standard. Error surfaces in `setError`. UI unblocks. |
| `finish_reason='length'` + LLM eval says complete | Pre-filter wins. Forced to incomplete. |
| First iteration (no history) is incomplete | Continue Document still works. Snapshot generates from the cut-off output. Continuation prompt has empty session history but the rest is complete. |

---

## Out of Scope

Explicitly deferred. Each could become its own future spec:

- **Auto-continuation.** System never continues without user click. Avoids runaway cost; preserves agency.
- **Context compression.** Sean Email 11 mentions passing a structured summary instead of full prior output. We pass the full output. Add compression later if telemetry shows token cost is painful for multi-continuation flows.
- **Document-type picker / structured templates.** Sean Email 10 references "BRD = 15 sections" as an example. We rely on the LLM to judge completeness against the user's stated objective rather than hardcoding a template library.
- **Section-boundary parsing.** Continuation prompt asks the LLM to "continue from where it trails off." We don't programmatically locate the last sentence/section break.
- **Continue badge in the version selector dropdown.** Nice-to-have polish; defer.
- **Telemetry on continuation usage.** Add when there's a question to answer.
- **Snapshot inspection UI.** `Iteration.continuity_snapshot` is stored but not rendered. Available in the data layer for debugging or future features.
- **Cross-session learning.** Sean Email 5 explicitly deferred.

---

## Testing Strategy

Backend (TDD per project convention):

- `test_continuity.py` — snapshot prompt builder includes objective/audience/constraints/previous output; continuation prompt builder includes snapshot fields, previous output, "do not repeat" directive
- `test_continuation_router.py` — request shape, route registration, prompt builders called correctly, snapshot attached to result iteration, `trigger_source='continuation'`
- `test_evaluator_completeness.py` — extended eval prompt asks for completeness; response parsing handles both shapes (with/without completeness); `finish_reason='length'` override forces incomplete
- `test_schemas.py` extensions — round-trip `CompletenessResult` and `ContinuitySnapshot`; old `EvaluationResult` JSON without completeness parses; `Iteration.continuity_snapshot` defaults to None

Frontend:

- `npm run build` clean (TypeScript strict, no `any`/`unknown` in new code)
- Manual smoke: long-objective generation → confirm completeness pill renders → click Continue → verify new version appears with merged content + new eval

Total expected backend test count after Project B: ~45 (up from 32 after Project A).

---

## Migration

No SQL migration. The continuation flow has no Supabase touch — chat persistence from Project A is the only Supabase-backed surface. Iterations persist via the existing JSONB session save path; the new optional fields (`completeness`, `continuity_snapshot`) ride along automatically.

---

## Open Questions Remaining

None. All design decisions resolved during brainstorming.
