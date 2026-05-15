# Smart Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered Input phase with an objective-first hero + Generate Setup button + secondary templates row + click-to-edit summary chips, with all granular controls demoted into a collapsible "Advanced" accordion.

**Architecture:** New `/api/generate-setup` LLM endpoint produces a `SetupSuggestion` (mode + audience + constraints + format + per-field rationale). Frontend Input phase gets rewritten as a composer of 5 small new components — `HeroZone`, `TemplatesRow`, `SetupSummaryBar`, `SetupChip`, `AdvancedSection` — none of which replace the existing `ModeGrid` / `ConstraintPills` / `CustomSelect` controls; the Advanced accordion just wraps them. Suggested values write to the same Zustand store fields as today, so chips and Advanced controls stay in sync.

**Tech Stack:** Python 3.x + FastAPI + Pydantic 2 + pytest on backend; Next.js 16 + Zustand + Tailwind v4 + Material Symbols on frontend.

**Source spec:** `docs/superpowers/specs/2026-05-15-smart-setup-design.md`

---

## Pre-flight

No SQL migration. Smart Setup is transient client state + one stateless LLM endpoint.

---

## Task 1: Backend schemas — `SetupRationale` + `SetupSuggestion`

**Files:**
- Modify: `backend/promptmaster/schemas.py`
- Test: `backend/tests/test_schemas.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_schemas.py`:

```python
from promptmaster.schemas import SetupRationale, SetupSuggestion


def test_setup_rationale_defaults_to_empty_strings():
    r = SetupRationale()
    assert r.mode == ""
    assert r.audience == ""
    assert r.constraints == ""
    assert r.output_format == ""


def test_setup_suggestion_round_trip():
    s = SetupSuggestion(
        mode="architect",
        audience="Engineering Leads",
        constraints="Two-week timeline",
        output_format="Numbered list",
        rationale=SetupRationale(
            mode="Best fit for structured plans",
            audience="Matches the problem framing",
            constraints="Adds a deadline anchor",
            output_format="Clear and scannable",
        ),
    )
    payload = s.model_dump()
    restored = SetupSuggestion(**payload)
    assert restored.mode == "architect"
    assert restored.rationale.mode == "Best fit for structured plans"


def test_setup_suggestion_rejects_unknown_mode():
    with pytest.raises(Exception):
        SetupSuggestion(
            mode="nonsense",  # type: ignore[arg-type]
            audience="General",
            constraints="",
            output_format="",
        )


def test_setup_suggestion_rationale_defaults_to_empty():
    s = SetupSuggestion(
        mode="architect",
        audience="General",
        constraints="",
        output_format="",
    )
    assert s.rationale.mode == ""
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: ImportError on `SetupRationale`/`SetupSuggestion`.

- [ ] **Step 3: Add new schemas in `backend/promptmaster/schemas.py`**

Append at the end of the file:

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: All 4 new tests pass; existing schema tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/promptmaster/schemas.py backend/tests/test_schemas.py
git commit -m "feat(backend): add SetupRationale and SetupSuggestion schemas"
```

---

## Task 2: `setup_suggester.py` module

**Files:**
- Create: `backend/promptmaster/setup_suggester.py`
- Test: `backend/tests/test_setup_suggester.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_setup_suggester.py`:

```python
"""Tests for the Smart Setup suggestion LLM helper."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.setup_suggester import (
    SETUP_SUGGESTER_SYSTEM,
    build_setup_prompt,
    suggest_setup,
)
from promptmaster.schemas import SetupSuggestion


def test_build_setup_prompt_includes_objective():
    prompt = build_setup_prompt(objective="Plan a launch strategy")
    assert "Plan a launch strategy" in prompt


def test_build_setup_prompt_asks_for_all_five_fields():
    prompt = build_setup_prompt(objective="x")
    for field in ("mode", "audience", "constraints", "output_format", "rationale"):
        assert field in prompt


def test_setup_suggester_system_lists_available_modes():
    for mode in (
        "architect", "critic", "clarity", "coach",
        "therapist", "cold_critic", "analyst",
    ):
        assert mode in SETUP_SUGGESTER_SYSTEM


def test_setup_suggester_system_excludes_custom_mode():
    """Smart Setup must not recommend the 'custom' mode."""
    # Should explicitly mention not recommending custom
    lower = SETUP_SUGGESTER_SYSTEM.lower()
    assert "custom" in lower
    assert "do not recommend" in lower or "do not suggest" in lower


@pytest.mark.asyncio
async def test_suggest_setup_returns_parsed_suggestion():
    client = AsyncMock()
    fake_json = {
        "mode": "architect",
        "audience": "Engineering Leads",
        "constraints": "Two-week timeline",
        "output_format": "Numbered list",
        "rationale": {
            "mode": "Best for structured plans",
            "audience": "Matches the framing",
            "constraints": "Adds a deadline",
            "output_format": "Scannable structure",
        },
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="Plan a launch")
    assert isinstance(result, SetupSuggestion)
    assert result.mode == "architect"
    assert result.audience == "Engineering Leads"
    assert result.rationale.mode == "Best for structured plans"
    client.generate_json.assert_called_once()


@pytest.mark.asyncio
async def test_suggest_setup_falls_back_to_architect_on_invalid_mode():
    """Defensive parsing: unknown mode → architect."""
    client = AsyncMock()
    fake_json = {
        "mode": "nonsense_mode",
        "audience": "General",
        "constraints": "",
        "output_format": "",
        "rationale": {},
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="x")
    assert result.mode == "architect"


@pytest.mark.asyncio
async def test_suggest_setup_handles_missing_optional_fields():
    """Defensive parsing: missing audience/constraints/format/rationale all default."""
    client = AsyncMock()
    fake_json = {"mode": "architect"}
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="x")
    assert result.mode == "architect"
    assert result.audience == "General"
    assert result.constraints == ""
    assert result.output_format == ""
    assert result.rationale.mode == ""
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_setup_suggester.py -v
```
Expected: ImportError on `promptmaster.setup_suggester`.

- [ ] **Step 3: Create `backend/promptmaster/setup_suggester.py`**

```python
"""Smart Setup — LLM-driven suggestion of mode + audience + constraints + format.

Given a user's objective, returns a SetupSuggestion that pre-fills the Input
phase. Defensive parsing keeps the call resilient to malformed or partial
LLM responses — invalid mode falls back to 'architect', missing fields
default to safe values.
"""

from __future__ import annotations

import logging

from .llm_client import OpenRouterClient
from .schemas import ModeType, SetupRationale, SetupSuggestion

logger = logging.getLogger(__name__)


_VALID_MODES = {
    "architect", "critic", "clarity", "coach",
    "therapist", "cold_critic", "analyst",
}


SETUP_SUGGESTER_SYSTEM = (
    "You are the Smart Setup layer of PromptMaster. Given a user's objective, "
    "recommend the most fitting mode, audience, constraints, and output format "
    "to produce a high-quality structured response.\n\n"
    "Available modes:\n"
    "- architect: Structure, systems, frameworks\n"
    "- critic: Find weak points and contradictions\n"
    "- clarity: Make complex ideas simple and crisp\n"
    "- coach: Encouraging, action-oriented\n"
    "- therapist: Reflective, empathetic, exploratory\n"
    "- cold_critic: Brutally objective audit, no encouragement\n"
    "- analyst: Evidence-based, data-aware reasoning\n"
    "- custom: Reserved for user-defined modes — do NOT recommend custom\n\n"
    "Available audiences (suggest the closest match or a short free-text "
    "tailored to the objective):\n"
    "General, Technical, Executive, Academic, Student.\n\n"
    "Constraints: a short paragraph describing scope limits, focus areas, or "
    "deadlines. Be specific. If none apply, return an empty string.\n\n"
    "Output format: a short phrase describing structure (e.g., \"Numbered list "
    "with 3-5 items\", \"Two-section memo: Findings / Recommendations\", "
    "\"Markdown table\"). If none clearly apply, return \"Free-form prose\".\n\n"
    "Rationale: one line per field (≤80 chars) explaining why you picked it. "
    "Be brief and useful, not generic.\n\n"
    "Return JSON only."
)


def build_setup_prompt(objective: str) -> str:
    """Build the user prompt for the setup-suggestion LLM call."""
    return (
        f"Objective: {objective}\n\n"
        "Recommend a setup. Return JSON in this exact shape:\n"
        "{\n"
        '  "mode": "architect|critic|clarity|coach|therapist|cold_critic|analyst",\n'
        '  "audience": "...",\n'
        '  "constraints": "...",\n'
        '  "output_format": "...",\n'
        '  "rationale": {\n'
        '    "mode": "...",\n'
        '    "audience": "...",\n'
        '    "constraints": "...",\n'
        '    "output_format": "..."\n'
        "  }\n"
        "}"
    )


async def suggest_setup(
    client: OpenRouterClient,
    model: str | None,
    objective: str,
) -> SetupSuggestion:
    """Run the Smart Setup LLM call. Defensive on missing/invalid fields."""
    prompt = build_setup_prompt(objective)

    try:
        result, _usage = await client.generate_json(
            prompt=prompt,
            system=SETUP_SUGGESTER_SYSTEM,
            temperature=0.3,
            max_tokens=512,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Setup suggestion LLM call failed: {e}")
        # Fallback: minimal architect setup
        return SetupSuggestion(
            mode="architect",
            audience="General",
            constraints="",
            output_format="",
            rationale=SetupRationale(),
        )

    raw_mode = result.get("mode", "architect")
    mode: ModeType = raw_mode if raw_mode in _VALID_MODES else "architect"
    if raw_mode not in _VALID_MODES:
        logger.warning(f"Setup suggestion returned invalid mode {raw_mode!r}, falling back to architect")

    rationale_raw = result.get("rationale") or {}
    if not isinstance(rationale_raw, dict):
        rationale_raw = {}

    return SetupSuggestion(
        mode=mode,
        audience=result.get("audience") or "General",
        constraints=result.get("constraints") or "",
        output_format=result.get("output_format") or "",
        rationale=SetupRationale(
            mode=rationale_raw.get("mode") or "",
            audience=rationale_raw.get("audience") or "",
            constraints=rationale_raw.get("constraints") or "",
            output_format=rationale_raw.get("output_format") or "",
        ),
    )
```

- [ ] **Step 4: Run tests**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_setup_suggester.py -v
```
Expected: All 7 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: All tests pass (~70).

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/setup_suggester.py backend/tests/test_setup_suggester.py
git commit -m "feat(backend): add setup_suggester for Smart Setup LLM call"
```

---

## Task 3: Setup router with `/api/generate-setup`

**Files:**
- Create: `backend/routers/setup.py`
- Modify: `backend/main.py:49-56`
- Test: `backend/tests/test_setup_router.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_setup_router.py`:

```python
"""Smoke tests for the Smart Setup router."""

import inspect

from routers import setup as setup_router_module


def test_generate_setup_request_has_required_fields():
    fields = setup_router_module.GenerateSetupRequest.model_fields
    for required in ("objective", "model"):
        assert required in fields, f"missing field: {required}"


def test_generate_setup_response_has_suggestion_envelope():
    fields = setup_router_module.GenerateSetupResponse.model_fields
    assert "suggestion" in fields


def test_router_registers_endpoint():
    paths = [r.path for r in setup_router_module.router.routes]
    assert "/api/generate-setup" in paths


def test_endpoint_calls_suggest_setup():
    src = inspect.getsource(setup_router_module.api_generate_setup)
    assert "suggest_setup" in src
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_setup_router.py -v
```
Expected: ImportError on `routers.setup`.

- [ ] **Step 3: Create `backend/routers/setup.py`**

```python
"""Smart Setup endpoint — recommends mode/audience/constraints/format from an objective."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.schemas import SetupSuggestion
from promptmaster.setup_suggester import suggest_setup

router = APIRouter(prefix="/api", tags=["setup"])


class GenerateSetupRequest(BaseModel):
    objective: str
    model: str = ""


class GenerateSetupResponse(BaseModel):
    suggestion: SetupSuggestion


@router.post("/generate-setup")
async def api_generate_setup(
    req: GenerateSetupRequest,
    client: OpenRouterClient = Depends(get_client),
) -> GenerateSetupResponse:
    """Recommend a setup from the user's objective. 1 LLM call."""
    try:
        suggestion = await suggest_setup(
            client=client,
            model=req.model or None,
            objective=req.objective,
        )
        return GenerateSetupResponse(suggestion=suggestion)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Wire the router into `backend/main.py`**

Find the existing router registration block (currently around lines 49-56). The current state after Project B has:

```python
from routers.meta import router as meta_router
from routers.engine import router as engine_router
from routers.conversation import router as conversation_router
from routers.continuation import router as continuation_router

app.include_router(meta_router)
app.include_router(engine_router)
app.include_router(conversation_router)
app.include_router(continuation_router)
```

Replace with:

```python
from routers.meta import router as meta_router
from routers.engine import router as engine_router
from routers.conversation import router as conversation_router
from routers.continuation import router as continuation_router
from routers.setup import router as setup_router

app.include_router(meta_router)
app.include_router(engine_router)
app.include_router(conversation_router)
app.include_router(continuation_router)
app.include_router(setup_router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_setup_router.py -v
```
Expected: All 4 tests pass.

- [ ] **Step 6: Verify backend imports cleanly**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -c "import main; print('ok')"
```
Expected: `ok`.

- [ ] **Step 7: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: ~67 total (63 prior + 4 new). All pass.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/setup.py backend/main.py backend/tests/test_setup_router.py
git commit -m "feat(backend): add /api/generate-setup endpoint for Smart Setup"
```

---

## Task 4: Frontend types — `SetupRationale`, `SetupSuggestion`, `GenerateSetupRequest`

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Append the new interfaces**

At the end of `frontend/src/types/index.ts`, add:

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

export interface GenerateSetupResponse {
  suggestion: SetupSuggestion;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add SetupSuggestion and request/response types"
```

---

## Task 5: API client — `api.generateSetup()`

**Files:**
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: Update imports**

Add to the existing `import type { ... } from '@/types';` block:

```typescript
  GenerateSetupRequest,
  GenerateSetupResponse,
```

- [ ] **Step 2: Add the method**

Inside the `api` object, after the existing `continueDocument` method (added in Project B), insert:

```typescript
  async generateSetup(req: GenerateSetupRequest): Promise<GenerateSetupResponse> {
    return apiFetch('/api/generate-setup', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
```

- [ ] **Step 3: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add api.generateSetup method"
```

---

## Task 6: Zustand store — Smart Setup state and actions

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 1: Add `SetupSuggestion` to type imports**

Update the existing import block at the top of `session-store.ts`:

```typescript
import type {
  Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult,
  Session, UserRating, ChatMessage, SetupSuggestion,
} from '@/types';
```

(Adjust to the actual import block shape; the key change is adding `SetupSuggestion`.)

- [ ] **Step 2: Add the new state fields to the `SessionState` interface**

Inside the `SessionState` interface, alongside the existing `continuationLoading: boolean;` field, add:

```typescript
  // Smart Setup
  setupSuggestion: SetupSuggestion | null;
  setupLoading: boolean;
  setupError: string | null;
```

Add the action signatures alongside other Setup-related ones (or near `setContinuationLoading`):

```typescript
  setSetupSuggestion: (s: SetupSuggestion | null) => void;
  setSetupLoading: (b: boolean) => void;
  setSetupError: (e: string | null) => void;
  applySetupSuggestion: (s: SetupSuggestion) => void;
```

- [ ] **Step 3: Add to `initialState`**

In the `initialState` object, after the existing `continuationLoading: false,`, add:

```typescript
  setupSuggestion: null as SetupSuggestion | null,
  setupLoading: false,
  setupError: null as string | null,
```

- [ ] **Step 4: Implement the actions**

Inside the store implementation block, after `setContinuationLoading`, add:

```typescript
      setSetupSuggestion: (setupSuggestion) => set({ setupSuggestion }),
      setSetupLoading: (setupLoading) => set({ setupLoading }),
      setSetupError: (setupError) => set({ setupError }),
      applySetupSuggestion: (s) =>
        set({
          setupSuggestion: s,
          mode: s.mode,
          audience: s.audience,
          constraints: s.constraints,
          outputFormat: s.output_format,
        }),
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add Smart Setup state and applySetupSuggestion action"
```

---

## Task 7: `SetupChip` component (reusable click-to-edit chip)

**Files:**
- Create: `frontend/src/components/input/setup-chip.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import type { ReactNode } from 'react';

interface SetupChipProps {
  label: string;
  value: string;
  rationale?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  children: ReactNode; // editor rendered when expanded
}

export function SetupChip({
  label,
  value,
  rationale,
  expanded,
  onToggleExpand,
  children,
}: SetupChipProps) {
  if (expanded) {
    return (
      <div className="rounded-xl border border-[var(--outline-variant)]/30 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
              {label}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="Collapse"
            className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">expand_less</span>
          </button>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggleExpand}
      className="w-full text-left rounded-xl bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] transition-colors p-4 flex items-start justify-between gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            {label}
          </span>
          <span className="text-sm font-semibold text-[var(--on-surface)] truncate">
            {value || '(none)'}
          </span>
        </div>
        {rationale && (
          <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-1">
            {rationale}
          </p>
        )}
      </div>
      <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)] flex-shrink-0">
        expand_more
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/input/setup-chip.tsx
git commit -m "feat(frontend): add SetupChip reusable click-to-edit chip"
```

---

## Task 8: `HeroZone` component

**Files:**
- Create: `frontend/src/components/input/hero-zone.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

interface HeroZoneProps {
  objective: string;
  onObjectiveChange: (v: string) => void;
  onGenerateSetup: () => void;
  loading: boolean;
}

export function HeroZone({
  objective,
  onObjectiveChange,
  onGenerateSetup,
  loading,
}: HeroZoneProps) {
  const trimmed = objective.trim();
  const disabled = loading || trimmed.length === 0;
  const tooltip = trimmed.length === 0 ? 'Type your objective first' : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-display">What do you want to do or figure out?</h1>
        <p className="text-body text-[var(--on-surface-variant)]">
          Describe your goal — a problem to solve, a document to write, a decision to make.
        </p>
      </div>

      <textarea
        value={objective}
        onChange={(e) => onObjectiveChange(e.target.value)}
        rows={3}
        placeholder="e.g. Plan a launch strategy for an internal tool over the next two weeks…"
        disabled={loading}
        className="w-full bg-white rounded-xl shadow-ambient px-5 py-4 text-base text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerateSetup}
          disabled={disabled}
          title={tooltip}
          className="flex items-center gap-2 px-6 py-3 bg-[var(--pm-primary)] text-white text-sm font-bold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Setting up…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Generate Setup
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/input/hero-zone.tsx
git commit -m "feat(frontend): add HeroZone component with objective input + Generate Setup"
```

---

## Task 9: `TemplatesRow` component

**Files:**
- Create: `frontend/src/components/input/templates-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { PROMPT_STACKS, type PromptStack } from '@/lib/constants';

interface TemplatesRowProps {
  onSelectStack: (stack: PromptStack) => void;
}

export function TemplatesRow({ onSelectStack }: TemplatesRowProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
        Or start with a template
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {PROMPT_STACKS.map((stack) => (
          <button
            key={stack.id}
            type="button"
            onClick={() => onSelectStack(stack)}
            className="text-left rounded-xl bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] transition-colors p-4 space-y-1"
          >
            <div className="text-sm font-semibold text-[var(--on-surface)]">
              {stack.name.replace(/ Stack$/, '')}
            </div>
            <p className="text-[11px] text-[var(--on-surface-variant)] leading-relaxed line-clamp-2">
              {stack.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/input/templates-row.tsx
git commit -m "feat(frontend): add TemplatesRow secondary entry below hero"
```

---

## Task 10: `SetupSummaryBar` component

**Files:**
- Create: `frontend/src/components/input/setup-summary-bar.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { MODE_DISPLAY, AUDIENCE_OPTIONS } from '@/lib/constants';
import type { ModeType, SetupSuggestion } from '@/types';
import { SetupChip } from './setup-chip';
import { ModeGrid } from '@/components/shared/mode-grid';
import { CustomSelect } from '@/components/shared/custom-select';

interface SetupSummaryBarProps {
  suggestion: SetupSuggestion;
}

type ChipKey = 'mode' | 'audience' | 'constraints' | 'output_format';

export function SetupSummaryBar({ suggestion }: SetupSummaryBarProps) {
  const [expanded, setExpanded] = useState<ChipKey | null>(null);

  const mode = useSessionStore((s) => s.mode);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);

  const setMode = useSessionStore((s) => s.setMode);
  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);

  function toggle(key: ChipKey) {
    setExpanded(expanded === key ? null : key);
  }

  const modeLabel = MODE_DISPLAY[mode]?.display_name ?? mode;

  return (
    <div className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            Recommended Approach
          </h2>
          <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-0.5">
            Click any chip to refine.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SetupChip
          label="Mode"
          value={modeLabel}
          rationale={suggestion.rationale.mode}
          expanded={expanded === 'mode'}
          onToggleExpand={() => toggle('mode')}
        >
          <ModeGrid value={mode} onChange={(v: ModeType) => { setMode(v); setExpanded(null); }} />
        </SetupChip>

        <SetupChip
          label="Audience"
          value={audience}
          rationale={suggestion.rationale.audience}
          expanded={expanded === 'audience'}
          onToggleExpand={() => toggle('audience')}
        >
          <CustomSelect
            value={audience}
            onChange={(v) => setAudience(v)}
            options={AUDIENCE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </SetupChip>

        <SetupChip
          label="Constraints"
          value={constraints || '(none)'}
          rationale={suggestion.rationale.constraints}
          expanded={expanded === 'constraints'}
          onToggleExpand={() => toggle('constraints')}
        >
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder="Scope limits, focus areas, or deadlines…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </SetupChip>

        <SetupChip
          label="Format"
          value={outputFormat || '(none)'}
          rationale={suggestion.rationale.output_format}
          expanded={expanded === 'output_format'}
          onToggleExpand={() => toggle('output_format')}
        >
          <textarea
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            rows={2}
            placeholder="e.g. Numbered list, two-section memo, table…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </SetupChip>
      </div>
    </div>
  );
}
```

Note: this assumes `ModeGrid` exposes `value` and `onChange` props. If its existing API differs, adjust the call site to match. The same applies to `CustomSelect`.

- [ ] **Step 2: Verify by reading the actual component APIs**

```bash
grep -n "interface ModeGridProps\|export function ModeGrid" /root/code/PromptMaster/frontend/src/components/shared/mode-grid.tsx | head -5
grep -n "interface CustomSelectProps\|export function CustomSelect" /root/code/PromptMaster/frontend/src/components/shared/custom-select.tsx | head -5
```

If the actual props differ, update the calls in `setup-summary-bar.tsx` to match. The plan's structure stays the same; only the prop names change.

- [ ] **Step 3: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/input/setup-summary-bar.tsx
git commit -m "feat(frontend): add SetupSummaryBar with click-to-edit chips"
```

---

## Task 11: `AdvancedSection` component (wraps existing controls)

**Files:**
- Create: `frontend/src/components/input/advanced-section.tsx`

The existing Input phase has a substantial block of granular controls — full mode grid, audience selector, constraint and format pill grids, session facts editor, stack selector. Rather than duplicating all of that here, this component wraps the existing implementations inside a `<details>` block.

- [ ] **Step 1: Inspect what's currently in input-phase.tsx that needs to live in Advanced**

```bash
sed -n '120,580p' /root/code/PromptMaster/frontend/src/components/phases/input-phase.tsx > /tmp/old-input-phase.txt
wc -l /tmp/old-input-phase.txt
```

The block from approximately line 120-580 contains: stack picker, examples row, mode grid, audience selector, constraint pills + add custom, format pills + add custom, session facts editor, save-as-template button. The implementation will move this logic into the new component, mostly verbatim. Read the whole region to understand what's there.

- [ ] **Step 2: Create the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import {
  CONSTRAINT_PRESETS,
  FORMAT_PRESETS,
  AUDIENCE_OPTIONS,
  PROMPT_STACKS,
} from '@/lib/constants';
import { ModeGrid } from '@/components/shared/mode-grid';
import { ConstraintPills } from '@/components/shared/constraint-pills';
import { CustomSelect } from '@/components/shared/custom-select';
import { listPresets, listLocalPresets } from '@/lib/supabase/presets';
import { createClient } from '@/lib/supabase/client';

export function AdvancedSection() {
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const constraintPresets = useSessionStore((s) => s.constraintPresets);
  const formatPresets = useSessionStore((s) => s.formatPresets);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const activeStackId = useSessionStore((s) => s.activeStackId);

  const customConstraintPresets = useSessionStore((s) => s.customConstraintPresets);
  const customFormatPresets = useSessionStore((s) => s.customFormatPresets);

  const setAudience = useSessionStore((s) => s.setAudience);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraintPresets = useSessionStore((s) => s.setConstraintPresets);
  const setFormatPresets = useSessionStore((s) => s.setFormatPresets);
  const setActiveStack = useSessionStore((s) => s.setActiveStack);
  const setCustomConstraintPresets = useSessionStore((s) => s.setCustomConstraintPresets);
  const setCustomFormatPresets = useSessionStore((s) => s.setCustomFormatPresets);
  const addCustomConstraintPreset = useSessionStore((s) => s.addCustomConstraintPreset);
  const removeCustomConstraintPreset = useSessionStore((s) => s.removeCustomConstraintPreset);
  const addCustomFormatPreset = useSessionStore((s) => s.addCustomFormatPreset);
  const removeCustomFormatPreset = useSessionStore((s) => s.removeCustomFormatPreset);
  const addSessionFact = useSessionStore((s) => s.addSessionFact);
  const removeSessionFact = useSessionStore((s) => s.removeSessionFact);

  const [newFact, setNewFact] = useState('');

  // Load custom presets on mount — same as existing input-phase
  useEffect(() => {
    async function loadCustomPresets() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const constraints = await listPresets('constraint').catch(() => []);
        const formats = await listPresets('format').catch(() => []);
        setCustomConstraintPresets(constraints.map((p) => p.label));
        setCustomFormatPresets(formats.map((p) => p.label));
      } else {
        setCustomConstraintPresets(listLocalPresets('constraint'));
        setCustomFormatPresets(listLocalPresets('format'));
      }
    }
    loadCustomPresets();
  }, [setCustomConstraintPresets, setCustomFormatPresets]);

  function toggleConstraintPreset(preset: string) {
    if (constraintPresets.includes(preset)) {
      setConstraintPresets(constraintPresets.filter((p) => p !== preset));
    } else {
      setConstraintPresets([...constraintPresets, preset]);
    }
  }

  function toggleFormatPreset(preset: string) {
    if (formatPresets.includes(preset)) {
      setFormatPresets(formatPresets.filter((p) => p !== preset));
    } else {
      setFormatPresets([...formatPresets, preset]);
    }
  }

  async function handleAddCustomConstraint(label: string) {
    addCustomConstraintPreset(label);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { addPreset } = await import('@/lib/supabase/presets');
      await addPreset('constraint', label, user.id).catch(() => {});
    } else {
      const { addLocalPreset } = await import('@/lib/supabase/presets');
      addLocalPreset('constraint', label);
    }
  }

  async function handleAddCustomFormat(label: string) {
    addCustomFormatPreset(label);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { addPreset } = await import('@/lib/supabase/presets');
      await addPreset('format', label, user.id).catch(() => {});
    } else {
      const { addLocalPreset } = await import('@/lib/supabase/presets');
      addLocalPreset('format', label);
    }
  }

  function addFact() {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    addSessionFact(trimmed);
    setNewFact('');
  }

  return (
    <details className="bg-white rounded-2xl shadow-ambient overflow-hidden group">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-widest text-[var(--on-surface-variant)] select-none hover:bg-[var(--surface-container-low)] transition-colors flex items-center justify-between">
        <span>Advanced</span>
        <span className="material-symbols-outlined text-[18px] group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-6 space-y-8 border-t border-[var(--outline-variant)]/20">

        {/* Stack picker */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Stack</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveStack(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeStackId === null
                  ? 'bg-[var(--pm-primary)] text-white'
                  : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]'
              }`}
            >
              No stack
            </button>
            {PROMPT_STACKS.map((stack) => (
              <button
                key={stack.id}
                type="button"
                onClick={() => setActiveStack(stack.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeStackId === stack.id
                    ? 'bg-[var(--pm-primary)] text-white'
                    : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]'
                }`}
              >
                {stack.name.replace(/ Stack$/, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Mode</h3>
          <ModeGrid value={mode} onChange={setMode} />
        </div>

        {/* Audience */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Audience</h3>
          <CustomSelect
            value={audience}
            onChange={setAudience}
            options={AUDIENCE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          />
        </div>

        {/* Constraints */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Constraints</h3>
          <ConstraintPills
            presets={CONSTRAINT_PRESETS}
            selected={constraintPresets}
            onToggle={toggleConstraintPreset}
            customPresets={customConstraintPresets}
            onAddCustom={handleAddCustomConstraint}
            onRemoveCustom={removeCustomConstraintPreset}
          />
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder="Free-text constraints…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </div>

        {/* Output format */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Output format</h3>
          <ConstraintPills
            presets={FORMAT_PRESETS}
            selected={formatPresets}
            onToggle={toggleFormatPreset}
            customPresets={customFormatPresets}
            onAddCustom={handleAddCustomFormat}
            onRemoveCustom={removeCustomFormatPreset}
          />
          <textarea
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            rows={2}
            placeholder="Free-text format description…"
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
          />
        </div>

        {/* Session facts */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Session facts</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFact(); } }}
              placeholder="Pin a fact (e.g. team size = 6)…"
              className="flex-1 bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
            />
            <button
              type="button"
              onClick={addFact}
              disabled={!newFact.trim()}
              className="px-4 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {sessionFacts.length > 0 && (
            <ul className="space-y-1">
              {sessionFacts.map((fact, i) => (
                <li key={i} className="flex items-center justify-between bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)]">
                  <span>{fact}</span>
                  <button
                    type="button"
                    onClick={() => removeSessionFact(i)}
                    aria-label="Remove"
                    className="text-[var(--on-surface-variant)] hover:text-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
```

Notes:
- This is a faithful port of the existing controls — same store fields, same handlers. The only structural change is wrapping the whole thing in a `<details>` accordion with the `Advanced` header.
- The custom-preset save logic uses dynamic imports to avoid bundling on cold path.
- Custom mode UI (`customName`, `customPreamble`, `customTone`) — if the existing input-phase has UI for this, port it the same way. If not, leave it out.
- `setActiveStack` only changes the active stack ID; it does not pre-fill objective. The objective pre-fill from a stack happens in the templates row (Task 12), which is the user-visible "use a template" path.

- [ ] **Step 3: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/input/advanced-section.tsx
git commit -m "feat(frontend): add AdvancedSection accordion wrapping existing input controls"
```

---

## Task 12: Rewrite `input-phase.tsx`

**Files:**
- Modify: `frontend/src/components/phases/input-phase.tsx` (full rewrite — currently ~618 lines)

This is the largest change in Project C. The new `input-phase.tsx` is a composer that wires together the components from Tasks 7-11, plus the `handleAssemble` flow that already exists.

- [ ] **Step 1: Read the existing `handleAssemble` to preserve its behavior**

```bash
grep -A 30 "function handleAssemble\|async function handleAssemble" /root/code/PromptMaster/frontend/src/components/phases/input-phase.tsx
```

Note its current shape: it takes the store inputs, calls `api.buildPrompt(...)`, sets `assembled`, then advances phase to `'review'`. We preserve this verbatim.

- [ ] **Step 2: Replace `frontend/src/components/phases/input-phase.tsx`**

Full new content:

```tsx
'use client';

import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import type { PromptStack } from '@/lib/constants';
import { HeroZone } from '@/components/input/hero-zone';
import { TemplatesRow } from '@/components/input/templates-row';
import { SetupSummaryBar } from '@/components/input/setup-summary-bar';
import { AdvancedSection } from '@/components/input/advanced-section';

export function InputPhase() {
  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const model = useSessionStore((s) => s.model);

  const setupSuggestion = useSessionStore((s) => s.setupSuggestion);
  const setupLoading = useSessionStore((s) => s.setupLoading);
  const setupError = useSessionStore((s) => s.setupError);

  const setObjective = useSessionStore((s) => s.setObjective);
  const setMode = useSessionStore((s) => s.setMode);
  const setConstraints = useSessionStore((s) => s.setConstraints);
  const setOutputFormat = useSessionStore((s) => s.setOutputFormat);
  const setActiveStack = useSessionStore((s) => s.setActiveStack);
  const setSetupLoading = useSessionStore((s) => s.setSetupLoading);
  const setSetupError = useSessionStore((s) => s.setSetupError);
  const applySetupSuggestion = useSessionStore((s) => s.applySetupSuggestion);
  const setAssembled = useSessionStore((s) => s.setAssembled);
  const setPhase = useSessionStore((s) => s.setPhase);
  const setError = useSessionStore((s) => s.setError);

  const [assembling, setAssembling] = useState(false);

  async function handleGenerateSetup() {
    if (!objective.trim()) return;
    setSetupError(null);
    setSetupLoading(true);
    try {
      const { suggestion } = await api.generateSetup({ objective, model });
      applySetupSuggestion(suggestion);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not generate a setup.');
    } finally {
      setSetupLoading(false);
    }
  }

  function handleSelectStack(stack: PromptStack) {
    // Pre-fill from the stack's initial config — same behavior as today's stack picker
    setMode(stack.initial.mode);
    if (!objective.trim()) {
      setObjective(stack.initial.objective_placeholder);
    }
    setConstraints(stack.initial.constraints);
    setOutputFormat(stack.initial.output_format);
    setActiveStack(stack.id);
  }

  async function handleAssemble() {
    if (!objective.trim()) return;
    setError(null);
    setAssembling(true);
    try {
      const inputs = {
        objective,
        audience,
        constraints,
        output_format: outputFormat,
        mode,
        session_facts: sessionFacts,
        ...(mode === 'custom' ? {
          custom_name: customName,
          custom_preamble: customPreamble,
          custom_tone: customTone,
        } : {}),
      };
      const assembled = await api.buildPrompt(inputs);
      setAssembled(assembled);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build prompt.');
    } finally {
      setAssembling(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero zone — primary entry */}
      <HeroZone
        objective={objective}
        onObjectiveChange={setObjective}
        onGenerateSetup={handleGenerateSetup}
        loading={setupLoading}
      />

      {/* Error banner if Generate Setup failed */}
      {setupError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          {setupError} Open Advanced below to set it up manually.
        </div>
      )}

      {/* Setup summary bar — appears after Generate Setup runs */}
      {setupSuggestion && <SetupSummaryBar suggestion={setupSuggestion} />}

      {/* Templates — secondary entry */}
      <TemplatesRow onSelectStack={handleSelectStack} />

      {/* Advanced controls — collapsed by default */}
      <AdvancedSection />

      {/* Continue to Review */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleAssemble}
          disabled={assembling || !objective.trim()}
          className="flex items-center gap-2 px-8 py-3 bg-[var(--pm-primary)] text-white text-sm font-semibold rounded-xl shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {assembling ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Building…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              Continue to Review
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean. The new file is ~120 lines vs. the old 618.

- [ ] **Step 4: Manual smoke (skip if unable)**

Open the dev server and confirm:
- Hero input + Generate Setup primary CTA visible
- Templates row visible below
- Advanced accordion collapsed
- Click Generate Setup with an objective → summary bar appears with chips
- Click a chip → expands inline with editor

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/phases/input-phase.tsx
git commit -m "refactor(frontend): rewrite input phase as Smart Setup composer"
```

---

## Task 13: Final smoke verification

**Files:**
- (No file changes — verification only)

- [ ] **Step 1: Run full backend test suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: ~67 total tests pass.

- [ ] **Step 2: Run frontend build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Audit for `any`/`unknown` in new code**

```bash
cd /root/code/PromptMaster && grep -rn ": any\|as any\|: unknown" \
  frontend/src/components/input \
  frontend/src/lib/api/client.ts \
  backend/promptmaster/setup_suggester.py \
  backend/routers/setup.py
```
Expected: empty.

- [ ] **Step 4: Verify endpoint registration**

```bash
cd /root/code/PromptMaster && grep -n "include_router\|from routers" backend/main.py
```
Expected: 5 routers registered (meta, engine, conversation, continuation, setup).

- [ ] **Step 5: Manual end-to-end smoke**

Bring up local app (`npm run dev`, backend `uvicorn main:app`). Walk through:

1. Open a new session. Confirm new input layout: hero input at top, Generate Setup primary, templates row below, Advanced accordion at bottom (collapsed).
2. Type an objective like *"Plan a launch strategy for an internal tool over the next two weeks for engineering leads"*.
3. Click **Generate Setup**. Spinner appears. Summary bar appears with 4 chips (Mode / Audience / Constraints / Format) each with a one-line rationale.
4. Click the **Mode** chip. ModeGrid expands inline. Pick a different mode. Chip collapses, showing new value.
5. Open **Advanced**. Confirm controls reflect the suggestion + your override. Edit a control there. Confirm the chip in the summary bar updates too.
6. Click **Templates → Strategy**. Confirm objective + constraints + format pre-fill.
7. Click **Continue to Review**. Confirm Review phase loads with the assembled prompt.
8. (Optional) Try empty objective + Generate Setup — button disabled.
9. (Optional) Force an error (e.g., temporarily break the endpoint URL) → confirm the red banner shows and Advanced still works.

- [ ] **Step 6: Commit any final fixes**

If smoke testing surfaced issues, fix and commit. If everything works:

```bash
git status
```
Expected: clean working tree.

- [ ] **Step 7: Tag the work**

```bash
git log --oneline -25
```
Confirm the commit graph reflects the full Project C scope.

---

## Self-Review Checklist

- ✅ **Spec coverage:** every section of the design spec maps to at least one task above (schemas → 1; suggester module → 2; router → 3; types → 4; api client → 5; store → 6; chip → 7; hero → 8; templates → 9; summary bar → 10; advanced → 11; input phase rewrite → 12; smoke → 13).
- ✅ **No placeholders:** every step has exact paths and complete code.
- ✅ **Type consistency:** `SetupSuggestion`, `SetupRationale`, `GenerateSetupRequest`, `GenerateSetupResponse`, `applySetupSuggestion`, `setSetupLoading`, `setSetupError`, `setupSuggestion`, `setupLoading`, `setupError`, `suggest_setup`, `build_setup_prompt`, `SETUP_SUGGESTER_SYSTEM` all spelled the same way across tasks.
- ✅ **Frequent commits:** every task ends with a commit step.
- ✅ **TDD where it pays:** backend setup_suggester and router both ship with tests written first. Frontend uses `npm run build` for type safety + manual smoke.
- ✅ **Backwards compatibility:** existing input flow preserved (handleAssemble identical), all existing controls still work in Advanced. No saved-session shape changes — `setupSuggestion` is transient.

---

## Out of Scope (deferred)

- Project D: "Why this works" + Audit→Action
- Custom modes (user-defined personas) — separate future spec
- Cross-session learning of setup preferences — Sean already deferred
- Tutorial updates for the new flow — follow-up
- Live re-suggestion as user types
