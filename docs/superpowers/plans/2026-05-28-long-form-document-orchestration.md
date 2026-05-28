# Long-Form Document Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an outline-first long-form document workflow (auto-detect, generate outline, auto-advance through sections with rolling continuity, finalize with eval) on top of the existing 5-phase session flow.

**Architecture:** Backend stays stateless — four new endpoints (`/api/detect-long-form`, `/api/generate-outline`, `/api/generate-section`, `/api/finalize-long-form`) in a new `routers/long_form.py`, reusing Project B's `continuity.py`, `_pipeline.build_iteration_with_full_pipeline`, and `OpenRouterClient.generate_with_meta`. Auto-advance loop runs on the frontend, persisting outline + section state to `sessions.data.long_form` (JSONB) between sections. Long-form sub-view renders inside the existing Output phase when `sessionStore.longForm` is present and active; Continue Document is hidden when long-form is active.

**Tech Stack:** Backend — FastAPI, Pydantic 2, pytest, asyncio. Frontend — Next.js 16 (App Router), Zustand, Tailwind v4, Material Symbols Outlined, Supabase JS SDK.

**Spec:** `docs/superpowers/specs/2026-05-28-long-form-document-orchestration-design.md`

**Prerequisite knowledge:**
- Backend tests run via `/root/code/PromptMaster/.venv/bin/python -m pytest` (NOT system pytest — PEP 668)
- Commits go direct to `main` (no PRs/branches per project convention)
- No client/stakeholder names in commit messages or code
- All user-facing UI copy must be plain English (no `state`, `trigger_source`, `snapshot`, etc. exposed)
- Continuity snapshot generation already exists in `backend/promptmaster/continuity.py` — REUSE, don't re-implement

---

## File Structure

**Backend — new files:**
- `backend/promptmaster/long_form.py` — pure functions: prompt builders + LLM-calling helpers for detect, outline, section
- `backend/routers/long_form.py` — FastAPI router exposing 4 endpoints
- `backend/tests/test_long_form_prompts.py` — unit tests for prompt builders and pure logic
- `backend/tests/test_long_form_router.py` — endpoint tests with mocked client

**Backend — modified files:**
- `backend/promptmaster/schemas.py` — add `OutlineSection`, `LongFormState`, `DetectLongFormResponse`, `GenerateOutlineResponse`, `GenerateSectionResponse`
- `backend/promptmaster/session_context.py` — add `"long_form_finalize"` to `_TRIGGER_LABELS`
- `backend/main.py` — register the new router

**Frontend — new files:**
- `frontend/src/components/long-form/state-pill.tsx` — top-of-output pill with current state + section progress
- `frontend/src/components/long-form/long-form-proposal.tsx` — "Plan It Out / Just Generate" card
- `frontend/src/components/long-form/outline-panel.tsx` — outline editor (review_outline state)
- `frontend/src/components/long-form/section-list.tsx` — sections list with per-section Regenerate/Retry
- `frontend/src/components/long-form/long-form-view.tsx` — top-level orchestrator owning the auto-advance loop

**Frontend — modified files:**
- `frontend/src/types/index.ts` — add `OutlineSection`, `LongFormState`, response types
- `frontend/src/lib/api/client.ts` — add `detectLongForm`, `generateOutline`, `generateSection`, `finalizeLongForm`
- `frontend/src/stores/session-store.ts` — add `longForm` slice + actions
- `frontend/src/components/phases/output-phase.tsx` — conditionally render `<LongFormView />`, hide Continue Document card when long-form active

---

## Task 1: Backend Schemas

**Files:**
- Modify: `backend/promptmaster/schemas.py`
- Test: `backend/tests/test_long_form_prompts.py` (new)

- [ ] **Step 1.1: Write failing tests for new schemas**

Append to or create `backend/tests/test_long_form_prompts.py`:

```python
"""Tests for long-form schemas and prompt builders."""
from __future__ import annotations

import pytest

from promptmaster.schemas import (
    DetectLongFormResponse,
    GenerateOutlineResponse,
    GenerateSectionResponse,
    LongFormState,
    OutlineSection,
)


def test_outline_section_defaults():
    section = OutlineSection(id="s1", title="Intro", abstract="Sets the stage.")
    assert section.status == "pending"
    assert section.content == ""
    assert section.revision == 0
    assert section.finish_reason is None
    assert section.error is None
    assert section.generated_at is None


def test_outline_section_all_fields_roundtrip():
    section = OutlineSection(
        id="s1",
        title="Body",
        abstract="The middle of the document.",
        status="complete",
        content="Generated prose here.",
        revision=2,
        finish_reason="stop",
        error=None,
        generated_at="2026-05-28T10:00:00Z",
    )
    assert section.model_dump()["status"] == "complete"
    assert OutlineSection(**section.model_dump()) == section


def test_long_form_state_defaults():
    state = LongFormState(state="outlining", started_at="2026-05-28T10:00:00Z")
    assert state.current_section_index == -1
    assert state.outline == []
    assert state.continuity_snapshot is None
    assert state.completed_at is None


def test_detect_response_required_fields():
    r = DetectLongFormResponse(is_long_form=True, suggested_section_count=10, reason="...")
    assert r.is_long_form is True
    assert r.suggested_section_count == 10


def test_generate_outline_response_holds_sections():
    r = GenerateOutlineResponse(outline=[
        OutlineSection(id="s1", title="A", abstract="a"),
        OutlineSection(id="s2", title="B", abstract="b"),
    ])
    assert len(r.outline) == 2


def test_generate_section_response_shape():
    from promptmaster.schemas import ContinuitySnapshot
    r = GenerateSectionResponse(
        content="prose",
        finish_reason="stop",
        new_snapshot=ContinuitySnapshot(),
    )
    assert r.finish_reason == "stop"
    assert r.new_snapshot is not None
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v`
Expected: ImportError / AttributeError on `OutlineSection`, `LongFormState`, etc.

- [ ] **Step 1.3: Implement the new schemas**

Open `backend/promptmaster/schemas.py`. Find the end of the file (where `Iteration.model_rebuild()` lives from Project B). Add the new schemas just BEFORE that `model_rebuild()` call. Use the existing `ContinuitySnapshot` type (already imported in this file).

```python
class OutlineSection(BaseModel):
    id: str
    title: str
    abstract: str = Field(default="", description="One-sentence description of what this section covers.")
    status: Literal["pending", "writing", "complete", "error"] = "pending"
    content: str = ""
    revision: int = 0
    finish_reason: str | None = None
    error: str | None = None
    generated_at: str | None = None


class LongFormState(BaseModel):
    state: Literal["outlining", "review_outline", "writing", "paused", "complete"]
    current_section_index: int = -1
    outline: list[OutlineSection] = Field(default_factory=list)
    continuity_snapshot: ContinuitySnapshot | None = None
    started_at: str
    completed_at: str | None = None


class DetectLongFormResponse(BaseModel):
    is_long_form: bool
    suggested_section_count: int = 0
    reason: str = ""


class GenerateOutlineResponse(BaseModel):
    outline: list[OutlineSection]


class GenerateSectionResponse(BaseModel):
    content: str
    finish_reason: str
    new_snapshot: ContinuitySnapshot
```

If `Literal` isn't already imported at the top, add: `from typing import Literal` (check existing imports — it's likely already there from Project B's `CompletenessResult`).

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v`
Expected: all 6 tests PASS.

- [ ] **Step 1.5: Run the full test suite to confirm no regressions**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/ -v`
Expected: all existing tests still PASS plus the 6 new ones.

- [ ] **Step 1.6: Commit**

```bash
git add backend/promptmaster/schemas.py backend/tests/test_long_form_prompts.py
git commit -m "feat(backend): add long-form schemas (OutlineSection, LongFormState, response types)"
```

---

## Task 2: Trigger Label

**Files:**
- Modify: `backend/promptmaster/session_context.py`

Quick task — add the new trigger source label so finalized long-form iterations show a human-readable label in summaries.

- [ ] **Step 2.1: Read existing _TRIGGER_LABELS dict**

Open `backend/promptmaster/session_context.py`. Find the `_TRIGGER_LABELS` dict (added in Project B).

- [ ] **Step 2.2: Add the new label**

Add `"long_form_finalize": "Long-form document finalized"` to the dict. Example diff:

```python
_TRIGGER_LABELS = {
    "initial": "Initial generation",
    "realignment": "Realignment",
    "continuation": "Continued document",
    "long_form_finalize": "Long-form document finalized",
    # ... other existing entries
}
```

(If your local copy already has more keys, keep them; just add this one.)

- [ ] **Step 2.3: Commit**

```bash
git add backend/promptmaster/session_context.py
git commit -m "feat(backend): add long_form_finalize trigger label"
```

---

## Task 3: Long-Form Detect Logic

**Files:**
- Create: `backend/promptmaster/long_form.py`
- Test: `backend/tests/test_long_form_prompts.py` (append)

- [ ] **Step 3.1: Write failing tests for detect**

Append to `backend/tests/test_long_form_prompts.py`:

```python
from unittest.mock import AsyncMock
from promptmaster.long_form import build_detect_prompt, detect_long_form


def test_build_detect_prompt_includes_objective(basic_inputs):
    system, user = build_detect_prompt(basic_inputs)
    assert "objective" in user.lower()
    assert basic_inputs.objective in user


async def test_detect_returns_response_when_llm_says_long_form(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=(
        {"is_long_form": True, "suggested_section_count": 12, "reason": "Multi-section BRD"},
        {},
    ))
    result = await detect_long_form(client, model=None, inputs=basic_inputs)
    assert result.is_long_form is True
    assert result.suggested_section_count == 12
    assert "BRD" in result.reason


async def test_detect_returns_negative_when_llm_says_short(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=(
        {"is_long_form": False, "suggested_section_count": 0, "reason": "Short ask"},
        {},
    ))
    result = await detect_long_form(client, model=None, inputs=basic_inputs)
    assert result.is_long_form is False


async def test_detect_falls_back_to_negative_on_llm_error(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(side_effect=Exception("LLM down"))
    result = await detect_long_form(client, model=None, inputs=basic_inputs)
    assert result.is_long_form is False
    assert result.suggested_section_count == 0
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k detect`
Expected: ImportError on `long_form` module.

- [ ] **Step 3.3: Create the long_form module with detect**

Create `backend/promptmaster/long_form.py`:

```python
"""Long-form document orchestration: detect + outline + section helpers.

Pure functions and helpers used by routers/long_form.py.
Reuses promptmaster.continuity for snapshot regeneration.
"""

from __future__ import annotations

import logging

from .llm_client import OpenRouterClient
from .schemas import (
    ContinuitySnapshot,
    DetectLongFormResponse,
    OutlineSection,
    PMInput,
)

logger = logging.getLogger(__name__)


_DETECT_SYSTEM = (
    "You are a classifier. Given a user's writing request, decide if it is a "
    "long-form document (multi-section deliverable, paper, report, book chapter, "
    "BRD, white paper, proposal of more than a couple pages). Return JSON only."
)


def build_detect_prompt(inputs: PMInput) -> tuple[str, str]:
    """Build (system, user) prompts for the long-form classifier."""
    user = (
        f"Objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        "Return JSON with fields:\n"
        "- is_long_form: true if this needs multiple sections / pages; false for short asks\n"
        "- suggested_section_count: integer estimate of section count if long-form, else 0\n"
        "- reason: one short sentence explaining the call"
    )
    return _DETECT_SYSTEM, user


async def detect_long_form(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
) -> DetectLongFormResponse:
    """Classify whether the request is long-form. Falls back to negative on any error."""
    system, user = build_detect_prompt(inputs)
    try:
        result, _usage = await client.generate_json(
            prompt=user,
            system=system,
            temperature=0.1,
            max_tokens=200,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Long-form detect failed, defaulting to negative: {e}")
        return DetectLongFormResponse(is_long_form=False, suggested_section_count=0, reason="")

    return DetectLongFormResponse(
        is_long_form=bool(result.get("is_long_form", False)),
        suggested_section_count=int(result.get("suggested_section_count", 0) or 0),
        reason=str(result.get("reason", "")),
    )
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k detect`
Expected: 4 detect tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add backend/promptmaster/long_form.py backend/tests/test_long_form_prompts.py
git commit -m "feat(backend): add long-form detect classifier"
```

---

## Task 4: Outline Generation

**Files:**
- Modify: `backend/promptmaster/long_form.py`
- Test: `backend/tests/test_long_form_prompts.py` (append)

- [ ] **Step 4.1: Write failing tests for outline generation**

Append to `backend/tests/test_long_form_prompts.py`:

```python
from promptmaster.long_form import build_outline_prompt, generate_outline


def test_build_outline_prompt_includes_section_count(basic_inputs):
    system, user = build_outline_prompt(basic_inputs, suggested_section_count=8)
    assert "8" in user
    assert basic_inputs.objective in user


async def test_generate_outline_parses_sections(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=(
        {"outline": [
            {"title": "Intro", "abstract": "Sets the stage."},
            {"title": "Body", "abstract": "Develops the argument."},
            {"title": "Conclusion", "abstract": "Wraps up."},
        ]},
        {},
    ))
    sections = await generate_outline(client, model=None, inputs=basic_inputs, suggested_section_count=3)
    assert len(sections) == 3
    assert sections[0].title == "Intro"
    assert sections[0].status == "pending"
    assert sections[0].content == ""
    assert sections[0].revision == 0
    assert sections[0].id  # auto-generated, non-empty


async def test_generate_outline_assigns_unique_ids(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=(
        {"outline": [
            {"title": "A", "abstract": "a"},
            {"title": "B", "abstract": "b"},
        ]},
        {},
    ))
    sections = await generate_outline(client, model=None, inputs=basic_inputs, suggested_section_count=2)
    assert sections[0].id != sections[1].id


async def test_generate_outline_handles_malformed_response(basic_inputs):
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=({"outline": "not a list"}, {}))
    with pytest.raises(ValueError):
        await generate_outline(client, model=None, inputs=basic_inputs, suggested_section_count=3)
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k outline`
Expected: ImportError on `build_outline_prompt`, `generate_outline`.

- [ ] **Step 4.3: Add outline generation to long_form.py**

Append to `backend/promptmaster/long_form.py`:

```python
import uuid


_OUTLINE_SYSTEM = (
    "You design clear, well-scoped outlines for long-form documents. "
    "Each section title is concrete and non-overlapping. Each abstract is a "
    "single sentence describing what that section covers. Return JSON only."
)


def build_outline_prompt(inputs: PMInput, suggested_section_count: int) -> tuple[str, str]:
    """Build (system, user) prompts for outline generation."""
    user = (
        f"Objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n"
        f"Target section count: {suggested_section_count} (use this as a guide; "
        "adjust if the objective genuinely needs more or fewer).\n\n"
        "Return JSON with one field:\n"
        '- outline: array of {"title": string, "abstract": string}\n\n'
        "Each abstract must be ONE short sentence (≤20 words) describing what that "
        "section will cover. Titles must be concrete and non-overlapping."
    )
    return _OUTLINE_SYSTEM, user


async def generate_outline(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    suggested_section_count: int,
) -> list[OutlineSection]:
    """Generate an outline. Returns OutlineSection[] with auto-assigned ids and default fields."""
    system, user = build_outline_prompt(inputs, suggested_section_count)
    result, _usage = await client.generate_json(
        prompt=user,
        system=system,
        temperature=0.4,
        max_tokens=2048,
        model=model,
    )
    raw_outline = result.get("outline")
    if not isinstance(raw_outline, list):
        raise ValueError(f"generate_outline expected list, got {type(raw_outline).__name__}")

    sections: list[OutlineSection] = []
    for raw in raw_outline:
        if not isinstance(raw, dict):
            continue
        sections.append(OutlineSection(
            id=str(uuid.uuid4()),
            title=str(raw.get("title", "Untitled")),
            abstract=str(raw.get("abstract", "")),
        ))
    return sections
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k outline`
Expected: 4 outline tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add backend/promptmaster/long_form.py backend/tests/test_long_form_prompts.py
git commit -m "feat(backend): add outline generation with auto-assigned section ids"
```

---

## Task 5: Section Generation

**Files:**
- Modify: `backend/promptmaster/long_form.py`
- Test: `backend/tests/test_long_form_prompts.py` (append)

- [ ] **Step 5.1: Write failing tests for section generation**

Append to `backend/tests/test_long_form_prompts.py`:

```python
from promptmaster.long_form import build_section_prompt, generate_section
from promptmaster.schemas import ContinuitySnapshot


def test_build_section_prompt_includes_target_section(basic_inputs):
    outline = [
        OutlineSection(id="s1", title="Intro", abstract="Sets the stage."),
        OutlineSection(id="s2", title="Body", abstract="Develops the argument."),
        OutlineSection(id="s3", title="Conclusion", abstract="Wraps up."),
    ]
    system, user = build_section_prompt(
        inputs=basic_inputs,
        outline=outline,
        section_index=1,
        prior_snapshot=None,
        prev_section_content="",
    )
    assert "Body" in user
    assert "Develops the argument" in user
    assert "Intro" in user  # full outline visible
    assert "Conclusion" in user  # full outline visible


def test_build_section_prompt_includes_prev_section_when_present(basic_inputs):
    outline = [
        OutlineSection(id="s1", title="Intro", abstract="Sets the stage."),
        OutlineSection(id="s2", title="Body", abstract="Develops the argument."),
    ]
    system, user = build_section_prompt(
        inputs=basic_inputs,
        outline=outline,
        section_index=1,
        prior_snapshot=ContinuitySnapshot(
            completed_topics=["Intro"],
            current_topic=None,
            key_definitions=["AI workflow"],
            next_topic_hint="Body",
        ),
        prev_section_content="The previous section's prose here.",
    )
    assert "The previous section's prose here." in user
    assert "AI workflow" in user
    assert "Intro" in user


async def test_generate_section_returns_content_and_snapshot(basic_inputs):
    client = AsyncMock()
    client.generate_with_meta = AsyncMock(return_value=("Generated body prose.", {}, "stop"))
    # Mock the snapshot generation by patching the imported function
    client.generate_json = AsyncMock(return_value=(
        {"completed_topics": ["Intro", "Body"], "current_topic": None, "key_definitions": [], "next_topic_hint": "Conclusion"},
        {},
    ))

    outline = [
        OutlineSection(id="s1", title="Intro", abstract="x", status="complete", content="Intro prose."),
        OutlineSection(id="s2", title="Body", abstract="y"),
    ]
    result = await generate_section(
        client=client,
        model=None,
        inputs=basic_inputs,
        outline=outline,
        section_index=1,
        prior_snapshot=None,
        prev_section_content="Intro prose.",
    )
    assert result.content == "Generated body prose."
    assert result.finish_reason == "stop"
    assert result.new_snapshot.next_topic_hint == "Conclusion"


async def test_generate_section_propagates_length_finish_reason(basic_inputs):
    client = AsyncMock()
    client.generate_with_meta = AsyncMock(return_value=("Truncated...", {}, "length"))
    client.generate_json = AsyncMock(return_value=(
        {"completed_topics": [], "current_topic": "Body", "key_definitions": [], "next_topic_hint": None},
        {},
    ))
    outline = [OutlineSection(id="s1", title="Body", abstract="y")]
    result = await generate_section(
        client=client,
        model=None,
        inputs=basic_inputs,
        outline=outline,
        section_index=0,
        prior_snapshot=None,
        prev_section_content="",
    )
    assert result.finish_reason == "length"
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k section`
Expected: ImportError on `build_section_prompt`, `generate_section`.

- [ ] **Step 5.3: Add section generation to long_form.py**

Append to `backend/promptmaster/long_form.py`:

```python
from .continuity import generate_continuity_snapshot
from .conversation import _shared_system
from .schemas import GenerateSectionResponse


def _format_outline_for_prompt(outline: list[OutlineSection], current_index: int) -> str:
    """Render outline as a numbered list with a marker on the section being written."""
    lines = []
    for i, section in enumerate(outline):
        marker = " ← WRITING NOW" if i == current_index else ""
        lines.append(f"{i + 1}. {section.title}{marker}\n   {section.abstract}")
    return "\n".join(lines)


def _format_snapshot_for_prompt(snapshot) -> str:
    if snapshot is None:
        return "(no prior sections)"
    parts = []
    if snapshot.completed_topics:
        parts.append(f"Completed topics: {', '.join(snapshot.completed_topics)}")
    if snapshot.key_definitions:
        parts.append(f"Key definitions: {'; '.join(snapshot.key_definitions)}")
    if snapshot.next_topic_hint:
        parts.append(f"Next topic hint: {snapshot.next_topic_hint}")
    return "\n".join(parts) if parts else "(no prior context recorded)"


_SECTION_INSTRUCTION = (
    "LONG-FORM EXECUTION MODE: You are writing ONE section of a multi-section "
    "document. Write only the section indicated below. Do NOT outline, do NOT "
    "summarize what other sections will cover, do NOT include meta commentary. "
    "Write the actual prose for this section in the style and tone of the mode."
)


def build_section_prompt(
    inputs: PMInput,
    outline: list[OutlineSection],
    section_index: int,
    prior_snapshot,
    prev_section_content: str,
) -> tuple[str, str]:
    """Build (system, user) prompts for one section's generation."""
    target = outline[section_index]
    outline_text = _format_outline_for_prompt(outline, section_index)
    snapshot_text = _format_snapshot_for_prompt(prior_snapshot)

    system = _shared_system(inputs, [], _SECTION_INSTRUCTION)
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"FULL OUTLINE:\n{outline_text}\n\n"
        f"PRIOR CONTEXT:\n{snapshot_text}\n\n"
        f"IMMEDIATELY PREVIOUS SECTION (for tonal/stylistic anchoring; do NOT repeat):\n"
        f"{prev_section_content or '(none — this is the first section)'}\n\n"
        f"WRITE SECTION {section_index + 1}: {target.title}\n"
        f"This section covers: {target.abstract}\n\n"
        "Write only the prose for this section. Do not include the section title or "
        "number; just the body content. Stay focused on what this section's abstract says."
    )
    return system, user


async def generate_section(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    outline: list[OutlineSection],
    section_index: int,
    prior_snapshot,
    prev_section_content: str,
) -> GenerateSectionResponse:
    """Generate one section's content + regenerate the rolling continuity snapshot."""
    system, user = build_section_prompt(
        inputs=inputs,
        outline=outline,
        section_index=section_index,
        prior_snapshot=prior_snapshot,
        prev_section_content=prev_section_content,
    )

    content, _usage, finish_reason = await client.generate_with_meta(
        prompt=user,
        system=system,
        temperature=0.7,
        max_tokens=4096,
        model=model,
    )

    # Build cumulative "all completed sections + this one" string for snapshot grounding
    completed_so_far = "\n\n".join(
        s.content for s in outline[:section_index] if s.status == "complete" and s.content
    )
    merged_for_snapshot = (completed_so_far + "\n\n" + content).strip() if completed_so_far else content

    new_snapshot = await generate_continuity_snapshot(
        client=client,
        model=model,
        inputs=inputs,
        previous_output=merged_for_snapshot,
    )

    return GenerateSectionResponse(
        content=content,
        finish_reason=finish_reason,
        new_snapshot=new_snapshot,
    )
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_prompts.py -v -k section`
Expected: 4 section tests PASS.

- [ ] **Step 5.5: Run all long-form tests + full suite for regression check**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/ -v`
Expected: all PASS (existing tests + ~14 new ones from Tasks 1, 3, 4, 5).

- [ ] **Step 5.6: Commit**

```bash
git add backend/promptmaster/long_form.py backend/tests/test_long_form_prompts.py
git commit -m "feat(backend): add per-section generation with rolling continuity snapshot"
```

---

## Task 6: Long-Form Router

**Files:**
- Create: `backend/routers/long_form.py`
- Test: `backend/tests/test_long_form_router.py` (new)

- [ ] **Step 6.1: Write failing tests for the router**

Create `backend/tests/test_long_form_router.py`:

```python
"""Endpoint tests for routers/long_form.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from deps import get_client


@pytest.fixture
def client_for_app():
    """FastAPI TestClient with dependency override."""
    mock = AsyncMock()
    app.dependency_overrides[get_client] = lambda: mock
    yield TestClient(app), mock
    app.dependency_overrides.clear()


def _basic_inputs_dict():
    return {
        "objective": "Plan a launch strategy for an internal tool.",
        "audience": "Engineering leads",
        "constraints": "Two-week timeline",
        "output_format": "Numbered list",
        "mode": "architect",
    }


def test_detect_endpoint_returns_classifier_result(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_json = AsyncMock(return_value=(
        {"is_long_form": True, "suggested_section_count": 8, "reason": "Multi-section plan"},
        {},
    ))
    r = api_client.post("/api/detect-long-form", json={"inputs": _basic_inputs_dict()})
    assert r.status_code == 200
    body = r.json()
    assert body["is_long_form"] is True
    assert body["suggested_section_count"] == 8


def test_generate_outline_endpoint_returns_sections(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_json = AsyncMock(return_value=(
        {"outline": [
            {"title": "Intro", "abstract": "a"},
            {"title": "Body", "abstract": "b"},
        ]},
        {},
    ))
    r = api_client.post("/api/generate-outline", json={
        "inputs": _basic_inputs_dict(),
        "suggested_section_count": 2,
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body["outline"]) == 2
    assert body["outline"][0]["title"] == "Intro"
    assert body["outline"][0]["status"] == "pending"


def test_generate_section_endpoint_returns_content_and_snapshot(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_with_meta = AsyncMock(return_value=("Section prose.", {}, "stop"))
    mock_llm.generate_json = AsyncMock(return_value=(
        {"completed_topics": ["Body"], "current_topic": None, "key_definitions": [], "next_topic_hint": None},
        {},
    ))
    r = api_client.post("/api/generate-section", json={
        "inputs": _basic_inputs_dict(),
        "outline": [
            {"id": "s1", "title": "Body", "abstract": "b"},
        ],
        "section_index": 0,
        "prior_snapshot": None,
        "prev_section_content": "",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["content"] == "Section prose."
    assert body["finish_reason"] == "stop"
    assert "new_snapshot" in body


def test_finalize_endpoint_returns_iteration_with_eval(client_for_app):
    api_client, mock_llm = client_for_app

    # Mock the parallel calls: evaluator (generate_json), suggestions (generate), summary (generate)
    mock_llm.generate_json = AsyncMock(return_value=(
        {
            "alignment": {"score": "High", "explanation": "On target."},
            "clarity": {"score": "High", "explanation": "Clear."},
            "drift": {"score": "Low", "explanation": "Focused."},
            "completeness": {"status": "complete", "reason": ""},
        },
        {},
    ))
    mock_llm.generate = AsyncMock(return_value=("- Suggestion 1\n- Suggestion 2", {}))

    r = api_client.post("/api/finalize-long-form", json={
        "inputs": _basic_inputs_dict(),
        "merged_content": "Full merged document content.",
        "outline": [
            {"id": "s1", "title": "A", "abstract": "a", "status": "complete", "content": "Full merged document content."},
        ],
        "iteration_number": 1,
        "iteration_history": [],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["iteration"]["trigger_source"] == "long_form_finalize"
    assert body["iteration"]["output"] == "Full merged document content."
    assert body["iteration"]["evaluation"]["alignment"]["score"] == "High"
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_router.py -v`
Expected: import/route errors — the router doesn't exist yet.

- [ ] **Step 6.3: Create the router**

Create `backend/routers/long_form.py`:

```python
"""Long-form document orchestration endpoints.

Four endpoints (all stateless; orchestration loop runs on the frontend):
- POST /api/detect-long-form        — classifier (1 LLM call)
- POST /api/generate-outline        — outline generator (1 LLM call)
- POST /api/generate-section        — single section + snapshot (2 LLM calls)
- POST /api/finalize-long-form      — eval + suggestions + summary on merged content (3 parallel calls)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.continuity import generate_continuity_snapshot  # noqa: F401  (re-exported via long_form module)
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.long_form import (
    detect_long_form,
    generate_outline,
    generate_section,
)
from promptmaster.schemas import (
    ContinuitySnapshot,
    DetectLongFormResponse,
    GenerateOutlineResponse,
    GenerateSectionResponse,
    Iteration,
    OutlineSection,
    PMInput,
)
from promptmaster.session_context import _label_trigger
from routers._pipeline import build_iteration_with_full_pipeline

# Reuse the existing IterationFromConversationResponse shape
from routers.conversation import IterationFromConversationResponse

router = APIRouter(prefix="/api", tags=["long_form"])


# -------- request bodies --------

class DetectRequest(BaseModel):
    inputs: PMInput
    model: str = ""


class GenerateOutlineRequest(BaseModel):
    inputs: PMInput
    suggested_section_count: int = 8
    model: str = ""


class GenerateSectionRequest(BaseModel):
    inputs: PMInput
    outline: list[OutlineSection]
    section_index: int
    prior_snapshot: ContinuitySnapshot | None = None
    prev_section_content: str = ""
    model: str = ""


class FinalizeLongFormRequest(BaseModel):
    inputs: PMInput
    merged_content: str
    outline: list[OutlineSection]
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


# -------- endpoints --------

@router.post("/detect-long-form", response_model=DetectLongFormResponse)
async def api_detect_long_form(
    req: DetectRequest,
    client: OpenRouterClient = Depends(get_client),
):
    try:
        return await detect_long_form(client=client, model=req.model or None, inputs=req.inputs)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/generate-outline", response_model=GenerateOutlineResponse)
async def api_generate_outline(
    req: GenerateOutlineRequest,
    client: OpenRouterClient = Depends(get_client),
):
    try:
        outline = await generate_outline(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            suggested_section_count=req.suggested_section_count,
        )
        return GenerateOutlineResponse(outline=outline)
    except (OpenRouterError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/generate-section", response_model=GenerateSectionResponse)
async def api_generate_section(
    req: GenerateSectionRequest,
    client: OpenRouterClient = Depends(get_client),
):
    if req.section_index < 0 or req.section_index >= len(req.outline):
        raise HTTPException(status_code=400, detail=f"section_index {req.section_index} out of range")
    try:
        return await generate_section(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            outline=req.outline,
            section_index=req.section_index,
            prior_snapshot=req.prior_snapshot,
            prev_section_content=req.prev_section_content,
        )
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/finalize-long-form", response_model=IterationFromConversationResponse)
async def api_finalize_long_form(
    req: FinalizeLongFormRequest,
    client: OpenRouterClient = Depends(get_client),
):
    """Run eval + suggestions + summary on the pre-generated merged document.

    The merged content comes from the frontend (sum of all section.content).
    No regeneration here — just the pipeline pass.
    """
    if not req.merged_content.strip():
        raise HTTPException(status_code=400, detail="merged_content is empty")

    # Synthetic system/prompt text for the iteration record
    system_text = f"Long-form document with {len(req.outline)} sections."
    prompt_text = req.inputs.objective

    # active_iteration must exist for build_iteration_with_full_pipeline; use the last
    # iteration in history if any, else a synthetic initial iteration so the summary call
    # has a coherent "before" state to compare against.
    active = req.iteration_history[-1] if req.iteration_history else Iteration(
        iteration_number=0,
        prompt_sent="",
        system_prompt_used="",
        output="(no prior iteration — first long-form finalize)",
        mode=req.inputs.mode,
        evaluation=None,
        trigger_source="initial",
    )

    try:
        iteration, suggestions = await build_iteration_with_full_pipeline(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            output=req.merged_content,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="long_form_finalize",
            active_iteration=active,
            chat_history=[],
            iteration_history=req.iteration_history,
            user_action_label=_label_trigger("long_form_finalize"),
            finish_reason="stop",
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 6.4: Register the router in main.py**

Open `backend/main.py`. Find where existing routers are imported and included (likely near `from routers.continuation import router as continuation_router`). Add:

```python
from routers.long_form import router as long_form_router
```

And in the `app.include_router(...)` block:

```python
app.include_router(long_form_router)
```

- [ ] **Step 6.5: Run router tests to verify they pass**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/test_long_form_router.py -v`
Expected: all 4 endpoint tests PASS.

- [ ] **Step 6.6: Run full backend test suite**

Run: `/root/code/PromptMaster/.venv/bin/python -m pytest backend/tests/ -v`
Expected: all PASS — existing tests + 6 schema + 4 detect + 4 outline + 4 section + 4 router = ~22 new tests on top of Project B's 58.

- [ ] **Step 6.7: Commit**

```bash
git add backend/routers/long_form.py backend/main.py backend/tests/test_long_form_router.py
git commit -m "feat(backend): add long-form router with 4 endpoints (detect, outline, section, finalize)"
```

---

## Task 7: Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 7.1: Add the new types**

Open `frontend/src/types/index.ts`. Find the `ContinuitySnapshot` interface added in Project B. Add these new interfaces below it:

```typescript
export interface OutlineSection {
  id: string;
  title: string;
  abstract: string;
  status: 'pending' | 'writing' | 'complete' | 'error';
  content: string;
  revision: number;
  finish_reason: string | null;
  error: string | null;
  generated_at: string | null;
}

export type LongFormStateName =
  | 'outlining'
  | 'review_outline'
  | 'writing'
  | 'paused'
  | 'complete';

export interface LongFormState {
  state: LongFormStateName;
  current_section_index: number;
  outline: OutlineSection[];
  continuity_snapshot: ContinuitySnapshot | null;
  started_at: string;
  completed_at: string | null;
}

export interface DetectLongFormResponse {
  is_long_form: boolean;
  suggested_section_count: number;
  reason: string;
}

export interface GenerateOutlineResponse {
  outline: OutlineSection[];
}

export interface GenerateSectionResponse {
  content: string;
  finish_reason: string;
  new_snapshot: ContinuitySnapshot;
}
```

- [ ] **Step 7.2: Verify the frontend still builds**

Run from `frontend/`: `npm run build`
Expected: build succeeds. If TypeScript errors appear, fix the types (most likely a missing `ContinuitySnapshot` import — verify it's still exported above).

- [ ] **Step 7.3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add long-form TypeScript types"
```

---

## Task 8: Frontend API Client

**Files:**
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 8.1: Add the four new methods**

Open `frontend/src/lib/api/client.ts`. Find the existing `continueDocument` method (added in Project B). Add these methods next to it (inside the same exported `api` object or class — match existing style):

```typescript
async detectLongForm(req: { inputs: PMInput; model?: string }): Promise<DetectLongFormResponse> {
  return apiFetch('/api/detect-long-form', { method: 'POST', body: JSON.stringify(req) });
}

async generateOutline(req: {
  inputs: PMInput;
  suggested_section_count: number;
  model?: string;
}): Promise<GenerateOutlineResponse> {
  return apiFetch('/api/generate-outline', { method: 'POST', body: JSON.stringify(req) });
}

async generateSection(req: {
  inputs: PMInput;
  outline: OutlineSection[];
  section_index: number;
  prior_snapshot: ContinuitySnapshot | null;
  prev_section_content: string;
  model?: string;
}): Promise<GenerateSectionResponse> {
  return apiFetch('/api/generate-section', { method: 'POST', body: JSON.stringify(req) });
}

async finalizeLongForm(req: {
  inputs: PMInput;
  merged_content: string;
  outline: OutlineSection[];
  iteration_number: number;
  iteration_history: Iteration[];
  model?: string;
}): Promise<IterationFromConversationResponse> {
  return apiFetch('/api/finalize-long-form', { method: 'POST', body: JSON.stringify(req) });
}
```

Add to the imports at the top of the file:

```typescript
import type {
  // ... existing imports ...
  ContinuitySnapshot,
  DetectLongFormResponse,
  GenerateOutlineResponse,
  GenerateSectionResponse,
  OutlineSection,
} from '@/types';
```

(Leave existing imports intact; just add the missing ones.)

- [ ] **Step 8.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add long-form API client methods (detect, outline, section, finalize)"
```

---

## Task 9: Zustand Store Slice

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 9.1: Add the long-form state slice**

Open `frontend/src/stores/session-store.ts`. Find where existing state fields are declared (look for `chatLoading`, `continuationLoading` from Project B for placement reference).

Add to the imports at the top:

```typescript
import type { LongFormState, OutlineSection } from '@/types';
```

Add to the store state interface (or the type that describes the store):

```typescript
longForm: LongFormState | null;
longFormLoading: boolean;  // true while detect/outline/section/finalize calls are in flight
```

Add the action signatures to the store actions interface:

```typescript
setLongForm: (state: LongFormState | null) => void;
setLongFormStateName: (name: LongFormState['state']) => void;
updateOutline: (outline: OutlineSection[]) => void;
setSectionContent: (index: number, content: string, finish_reason: string) => void;
setSectionStatus: (index: number, status: OutlineSection['status'], error?: string | null) => void;
setSectionRegenerated: (index: number, content: string, finish_reason: string) => void;
setCurrentSectionIndex: (i: number) => void;
setContinuitySnapshot: (snapshot: LongFormState['continuity_snapshot']) => void;
clearLongForm: () => void;
setLongFormLoading: (loading: boolean) => void;
```

In the store implementation (the `create<...>((set) => ({ ... }))` block), add the initial state values:

```typescript
longForm: null,
longFormLoading: false,
```

And add the action implementations:

```typescript
setLongForm: (state) => set({ longForm: state }),
setLongFormStateName: (name) => set((s) => ({
  longForm: s.longForm ? { ...s.longForm, state: name } : s.longForm,
})),
updateOutline: (outline) => set((s) => ({
  longForm: s.longForm ? { ...s.longForm, outline } : s.longForm,
})),
setSectionContent: (index, content, finish_reason) => set((s) => {
  if (!s.longForm) return {};
  const outline = s.longForm.outline.map((sec, i) =>
    i === index
      ? { ...sec, content, finish_reason, status: 'complete' as const, generated_at: new Date().toISOString() }
      : sec
  );
  return { longForm: { ...s.longForm, outline } };
}),
setSectionStatus: (index, status, error = null) => set((s) => {
  if (!s.longForm) return {};
  const outline = s.longForm.outline.map((sec, i) =>
    i === index ? { ...sec, status, error: error ?? sec.error } : sec
  );
  return { longForm: { ...s.longForm, outline } };
}),
setSectionRegenerated: (index, content, finish_reason) => set((s) => {
  if (!s.longForm) return {};
  const outline = s.longForm.outline.map((sec, i) =>
    i === index
      ? {
          ...sec,
          content,
          finish_reason,
          status: 'complete' as const,
          revision: sec.revision + 1,
          generated_at: new Date().toISOString(),
          error: null,
        }
      : sec
  );
  return { longForm: { ...s.longForm, outline } };
}),
setCurrentSectionIndex: (i) => set((s) => ({
  longForm: s.longForm ? { ...s.longForm, current_section_index: i } : s.longForm,
})),
setContinuitySnapshot: (snapshot) => set((s) => ({
  longForm: s.longForm ? { ...s.longForm, continuity_snapshot: snapshot } : s.longForm,
})),
clearLongForm: () => set({ longForm: null }),
setLongFormLoading: (loading) => set({ longFormLoading: loading }),
```

If the store uses `persist` middleware (it does, per CLAUDE.md), the new fields will automatically persist to sessionStorage along with the rest of the state.

- [ ] **Step 9.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 9.3: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add long-form state slice to Zustand store"
```

---

## Task 10: State Pill Component

**Files:**
- Create: `frontend/src/components/long-form/state-pill.tsx`

- [ ] **Step 10.1: Create the component**

```tsx
'use client';

import type { LongFormState } from '@/types';

interface StatePillProps {
  state: LongFormState['state'];
  currentSectionIndex: number;
  totalSections: number;
}

export function StatePill({ state, currentSectionIndex, totalSections }: StatePillProps) {
  const { label, icon, tone } = getDisplay(state, currentSectionIndex, totalSections);

  const toneClasses = {
    info: 'bg-blue-50 text-blue-800',
    progress: 'bg-amber-50 text-amber-800',
    paused: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-50 text-emerald-800',
  }[tone];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${toneClasses}`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function getDisplay(
  state: LongFormState['state'],
  currentSectionIndex: number,
  totalSections: number,
): { label: string; icon: string; tone: 'info' | 'progress' | 'paused' | 'success' } {
  switch (state) {
    case 'outlining':
      return { label: 'Building outline…', icon: 'list_alt', tone: 'info' };
    case 'review_outline':
      return { label: 'Review outline', icon: 'edit_note', tone: 'info' };
    case 'writing': {
      const displayIndex = Math.max(1, currentSectionIndex + 1);
      return {
        label: `Writing section ${displayIndex} of ${totalSections}…`,
        icon: 'edit',
        tone: 'progress',
      };
    }
    case 'paused':
      return { label: 'Paused', icon: 'pause_circle', tone: 'paused' };
    case 'complete':
      return { label: 'Done', icon: 'check_circle', tone: 'success' };
  }
}
```

- [ ] **Step 10.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 10.3: Commit**

```bash
git add frontend/src/components/long-form/state-pill.tsx
git commit -m "feat(frontend): add state pill for long-form workflow"
```

---

## Task 11: Long-Form Proposal Card

**Files:**
- Create: `frontend/src/components/long-form/long-form-proposal.tsx`

- [ ] **Step 11.1: Create the component**

```tsx
'use client';

interface LongFormProposalProps {
  suggestedSectionCount: number;
  onPlanItOut: () => void;
  onJustGenerate: () => void;
  disabled?: boolean;
}

export function LongFormProposal({
  suggestedSectionCount,
  onPlanItOut,
  onJustGenerate,
  disabled = false,
}: LongFormProposalProps) {
  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-blue-700 text-2xl">auto_stories</span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--on-surface)]">
            This looks like a long-form document
          </h3>
          <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed">
            I can plan it section by section first for more coherent results
            {suggestedSectionCount > 0 ? ` (roughly ${suggestedSectionCount} sections)` : ''}. Or just generate it in one pass.
          </p>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onPlanItOut}
          disabled={disabled}
          className="px-4 py-2 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Plan It Out
        </button>
        <button
          onClick={onJustGenerate}
          disabled={disabled}
          className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Just Generate
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 11.3: Commit**

```bash
git add frontend/src/components/long-form/long-form-proposal.tsx
git commit -m "feat(frontend): add long-form proposal card"
```

---

## Task 12: Outline Panel

**Files:**
- Create: `frontend/src/components/long-form/outline-panel.tsx`

- [ ] **Step 12.1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import type { OutlineSection } from '@/types';

interface OutlinePanelProps {
  outline: OutlineSection[];
  editable: boolean;  // false while state === "outlining"
  onChange: (outline: OutlineSection[]) => void;
  onStartWriting: () => void;
  startDisabled: boolean;
}

export function OutlinePanel({
  outline,
  editable,
  onChange,
  onStartWriting,
  startDisabled,
}: OutlinePanelProps) {
  const updateSection = (id: string, patch: Partial<OutlineSection>) => {
    onChange(outline.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteSection = (id: string) => {
    onChange(outline.filter((s) => s.id !== id));
  };

  const addSection = () => {
    const newSection: OutlineSection = {
      id: crypto.randomUUID(),
      title: 'New section',
      abstract: '',
      status: 'pending',
      content: '',
      revision: 0,
      finish_reason: null,
      error: null,
      generated_at: null,
    };
    onChange([...outline, newSection]);
  };

  if (outline.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-ambient p-8 text-center text-sm text-[var(--on-surface-variant)]">
        Building outline…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--on-surface)] mb-1">Outline</h3>
        <p className="text-sm text-[var(--on-surface-variant)]">
          Review and edit before writing starts. Each section will be written one at a time.
        </p>
      </div>

      <ol className="space-y-4">
        {outline.map((section, i) => (
          <li key={section.id} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold">
              {i + 1}
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                disabled={!editable}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-200 rounded-md disabled:bg-slate-50 disabled:cursor-not-allowed"
                placeholder="Section title"
              />
              <textarea
                value={section.abstract}
                onChange={(e) => updateSection(section.id, { abstract: e.target.value })}
                disabled={!editable}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:cursor-not-allowed"
                placeholder="One-sentence description of what this section covers"
              />
            </div>
            {editable && (
              <button
                onClick={() => deleteSection(section.id)}
                className="flex-shrink-0 w-8 h-8 text-slate-400 hover:text-red-600"
                aria-label="Delete section"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            )}
          </li>
        ))}
      </ol>

      {editable && (
        <button
          onClick={addSection}
          className="text-sm font-semibold text-[var(--pm-primary)] hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add a section
        </button>
      )}

      <div className="pt-4 border-t border-slate-100">
        <button
          onClick={onStartWriting}
          disabled={startDisabled || !editable || outline.length === 0}
          className="px-6 py-2.5 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Writing
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 12.3: Commit**

```bash
git add frontend/src/components/long-form/outline-panel.tsx
git commit -m "feat(frontend): add outline panel editor for long-form"
```

---

## Task 13: Section List

**Files:**
- Create: `frontend/src/components/long-form/section-list.tsx`

- [ ] **Step 13.1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import type { OutlineSection } from '@/types';

interface SectionListProps {
  outline: OutlineSection[];
  currentSectionIndex: number;
  onRegenerate: (index: number) => void;
  onRetry: (index: number) => void;
  regenerateDisabled: boolean;
}

export function SectionList({
  outline,
  currentSectionIndex,
  onRegenerate,
  onRetry,
  regenerateDisabled,
}: SectionListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-ambient p-8 space-y-6">
      <h3 className="text-base font-semibold text-[var(--on-surface)]">Sections</h3>
      <ol className="space-y-4">
        {outline.map((section, i) => {
          const isCurrent = i === currentSectionIndex;
          const isOpen = expanded.has(section.id);
          return (
            <li
              key={section.id}
              className={`border-l-4 pl-4 py-2 ${
                section.status === 'complete'
                  ? 'border-emerald-300'
                  : section.status === 'writing' || isCurrent
                  ? 'border-amber-400'
                  : section.status === 'error'
                  ? 'border-red-400'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <SectionStatusIcon status={section.status} isCurrent={isCurrent} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => section.content && toggleExpand(section.id)}
                      disabled={!section.content}
                      className="text-left text-sm font-semibold text-[var(--on-surface)] hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {i + 1}. {section.title}
                    </button>
                    {section.status === 'complete' && (
                      <button
                        onClick={() => onRegenerate(i)}
                        disabled={regenerateDisabled}
                        className="text-xs font-semibold text-[var(--pm-primary)] hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        Regenerate
                      </button>
                    )}
                    {section.status === 'error' && (
                      <button
                        onClick={() => onRetry(i)}
                        className="text-xs font-semibold text-red-700 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--on-surface-variant)] mt-1">{section.abstract}</p>
                  {section.status === 'error' && section.error && (
                    <p className="text-xs text-red-700 mt-2">Couldn&apos;t generate this section. {section.error}</p>
                  )}
                  {isOpen && section.content && (
                    <div className="mt-3 text-sm text-[var(--on-surface)] whitespace-pre-wrap leading-relaxed">
                      {section.content}
                    </div>
                  )}
                  {section.finish_reason === 'length' && section.status === 'complete' && (
                    <p className="text-[11px] text-amber-700 italic mt-2">
                      This section may have been cut short. Regenerate if needed.
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SectionStatusIcon({
  status,
  isCurrent,
}: {
  status: OutlineSection['status'];
  isCurrent: boolean;
}) {
  if (status === 'complete') {
    return <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>;
  }
  if (status === 'writing' || isCurrent) {
    return <span className="material-symbols-outlined text-amber-500 text-lg animate-pulse">edit</span>;
  }
  if (status === 'error') {
    return <span className="material-symbols-outlined text-red-600 text-lg">error</span>;
  }
  return <span className="material-symbols-outlined text-slate-300 text-lg">radio_button_unchecked</span>;
}
```

- [ ] **Step 13.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

- [ ] **Step 13.3: Commit**

```bash
git add frontend/src/components/long-form/section-list.tsx
git commit -m "feat(frontend): add section list with per-section regenerate/retry"
```

---

## Task 14: Long-Form View (orchestrator)

**Files:**
- Create: `frontend/src/components/long-form/long-form-view.tsx`

- [ ] **Step 14.1: Create the orchestrator**

```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { updateSession } from '@/lib/supabase/sessions';
import { StatePill } from './state-pill';
import { OutlinePanel } from './outline-panel';
import { SectionList } from './section-list';

export function LongFormView() {
  const longForm = useSessionStore((s) => s.longForm);
  const longFormLoading = useSessionStore((s) => s.longFormLoading);
  const inputs = useSessionStore((s) => s.inputs);
  const sessionId = useSessionStore((s) => s.sessionId);
  const iterations = useSessionStore((s) => s.iterations);
  const model = useSessionStore((s) => s.selectedModel ?? '');

  const setLongForm = useSessionStore((s) => s.setLongForm);
  const setLongFormStateName = useSessionStore((s) => s.setLongFormStateName);
  const updateOutline = useSessionStore((s) => s.updateOutline);
  const setSectionContent = useSessionStore((s) => s.setSectionContent);
  const setSectionStatus = useSessionStore((s) => s.setSectionStatus);
  const setSectionRegenerated = useSessionStore((s) => s.setSectionRegenerated);
  const setCurrentSectionIndex = useSessionStore((s) => s.setCurrentSectionIndex);
  const setContinuitySnapshot = useSessionStore((s) => s.setContinuitySnapshot);
  const setLongFormLoading = useSessionStore((s) => s.setLongFormLoading);
  const addIteration = useSessionStore((s) => s.addIteration);

  const runningRef = useRef(false);

  const persistToSupabase = useCallback(async () => {
    if (!sessionId) return;
    const snapshot = useSessionStore.getState();
    await updateSession(sessionId, {
      long_form: snapshot.longForm,
      iterations: snapshot.iterations,
    });
  }, [sessionId]);

  const runAutoAdvance = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLongFormStateName('writing');
    setLongFormLoading(true);

    try {
      while (true) {
        const lf = useSessionStore.getState().longForm;
        if (!lf || lf.state === 'paused' || lf.state === 'complete') break;

        const nextIndex = Math.max(0, lf.current_section_index);
        if (nextIndex >= lf.outline.length) {
          // All sections done — finalize
          await finalize();
          break;
        }

        const section = lf.outline[nextIndex];
        if (section.status === 'complete') {
          setCurrentSectionIndex(nextIndex + 1);
          continue;
        }

        setSectionStatus(nextIndex, 'writing', null);
        const priorContent =
          nextIndex > 0 ? lf.outline[nextIndex - 1].content : '';

        try {
          const result = await api.generateSection({
            inputs,
            outline: lf.outline,
            section_index: nextIndex,
            prior_snapshot: lf.continuity_snapshot,
            prev_section_content: priorContent,
            model,
          });

          // If length, retry once with same params (no max_tokens raise from frontend —
          // the backend default is 4096; if we hit it we accept and surface to user)
          if (result.finish_reason === 'length') {
            const retry = await api.generateSection({
              inputs,
              outline: lf.outline,
              section_index: nextIndex,
              prior_snapshot: lf.continuity_snapshot,
              prev_section_content: priorContent,
              model,
            });
            setSectionContent(nextIndex, retry.content, retry.finish_reason);
            setContinuitySnapshot(retry.new_snapshot);
          } else {
            setSectionContent(nextIndex, result.content, result.finish_reason);
            setContinuitySnapshot(result.new_snapshot);
          }

          setCurrentSectionIndex(nextIndex + 1);
          await persistToSupabase();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          setSectionStatus(nextIndex, 'error', msg);
          setLongFormStateName('paused');
          await persistToSupabase();
          break;
        }
      }
    } finally {
      runningRef.current = false;
      setLongFormLoading(false);
    }
  }, [
    inputs,
    model,
    persistToSupabase,
    setContinuitySnapshot,
    setCurrentSectionIndex,
    setLongFormLoading,
    setLongFormStateName,
    setSectionContent,
    setSectionStatus,
  ]);

  const finalize = useCallback(async () => {
    const lf = useSessionStore.getState().longForm;
    if (!lf) return;
    const merged = lf.outline.map((s) => s.content).join('\n\n');
    try {
      const result = await api.finalizeLongForm({
        inputs,
        merged_content: merged,
        outline: lf.outline,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      addIteration(result.iteration);
      setLongFormStateName('complete');
      await persistToSupabase();
    } catch (e) {
      // Finalize failure: stay in writing, surface error via state
      setLongFormStateName('paused');
    }
  }, [addIteration, inputs, iterations, model, persistToSupabase, setLongFormStateName]);

  // Auto-start the loop when state transitions to "writing"
  useEffect(() => {
    if (longForm?.state === 'writing' && !runningRef.current) {
      runAutoAdvance();
    }
  }, [longForm?.state, runAutoAdvance]);

  const handleStartWriting = () => {
    setCurrentSectionIndex(0);
    setLongFormStateName('writing');
  };

  const handlePause = () => {
    setLongFormStateName('paused');
  };

  const handleResume = () => {
    setLongFormStateName('writing');
  };

  const handleRegenerate = useCallback(async (index: number) => {
    const lf = useSessionStore.getState().longForm;
    if (!lf) return;
    setLongFormLoading(true);
    try {
      const priorContent = index > 0 ? lf.outline[index - 1].content : '';
      const result = await api.generateSection({
        inputs,
        outline: lf.outline,
        section_index: index,
        prior_snapshot: lf.continuity_snapshot,
        prev_section_content: priorContent,
        model,
      });
      setSectionRegenerated(index, result.content, result.finish_reason);
      await persistToSupabase();
    } finally {
      setLongFormLoading(false);
    }
  }, [inputs, model, persistToSupabase, setLongFormLoading, useSessionStore]);

  const handleRetry = useCallback((index: number) => {
    setSectionStatus(index, 'pending', null);
    setCurrentSectionIndex(index);
    setLongFormStateName('writing');
  }, [setCurrentSectionIndex, setLongFormStateName, setSectionStatus]);

  if (!longForm) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StatePill
          state={longForm.state}
          currentSectionIndex={longForm.current_section_index}
          totalSections={longForm.outline.length}
        />
        {longForm.state === 'writing' && (
          <button
            onClick={handlePause}
            className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-200"
          >
            Pause
          </button>
        )}
        {longForm.state === 'paused' && (
          <button
            onClick={handleResume}
            disabled={longFormLoading}
            className="px-4 py-2 bg-[var(--pm-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Resume
          </button>
        )}
      </div>

      {(longForm.state === 'outlining' || longForm.state === 'review_outline') && (
        <OutlinePanel
          outline={longForm.outline}
          editable={longForm.state === 'review_outline'}
          onChange={updateOutline}
          onStartWriting={handleStartWriting}
          startDisabled={longFormLoading}
        />
      )}

      {(longForm.state === 'writing' || longForm.state === 'paused' || longForm.state === 'complete') && (
        <SectionList
          outline={longForm.outline}
          currentSectionIndex={longForm.current_section_index}
          onRegenerate={handleRegenerate}
          onRetry={handleRetry}
          regenerateDisabled={longForm.state === 'writing' || longFormLoading}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 14.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

If TypeScript complains about `addIteration`, `inputs`, `sessionId`, or `selectedModel` not existing on the store — check `src/stores/session-store.ts` for the actual names of those selectors. Adjust the destructuring in this file to match what the existing store exposes. (The store already has the equivalents — only the naming may differ slightly.)

If `updateSession` import fails, check `frontend/src/lib/supabase/sessions.ts` for the exact exported helper name. Adapt.

- [ ] **Step 14.3: Commit**

```bash
git add frontend/src/components/long-form/long-form-view.tsx
git commit -m "feat(frontend): add long-form orchestrator with auto-advance + pause/resume"
```

---

## Task 15: Output Phase Integration

**Files:**
- Modify: `frontend/src/components/phases/output-phase.tsx`

- [ ] **Step 15.1: Wire LongFormView + proposal card into output-phase**

Open `frontend/src/components/phases/output-phase.tsx`. The integration has three parts:

**Part A: Add imports at the top.**

```typescript
import { useState } from 'react';
import { LongFormView } from '@/components/long-form/long-form-view';
import { LongFormProposal } from '@/components/long-form/long-form-proposal';
import { api } from '@/lib/api/client';
import type { LongFormState } from '@/types';
```

(Adjust if `useState` is already imported.)

**Part B: Read long-form state from the store and add proposal state.**

Inside the component function, near the other `useSessionStore` selectors:

```typescript
const longForm = useSessionStore((s) => s.longForm);
const longFormLoading = useSessionStore((s) => s.longFormLoading);
const inputs = useSessionStore((s) => s.inputs);
const model = useSessionStore((s) => s.selectedModel ?? '');
const setLongForm = useSessionStore((s) => s.setLongForm);
const setLongFormStateName = useSessionStore((s) => s.setLongFormStateName);
const updateOutline = useSessionStore((s) => s.updateOutline);
const setLongFormLoading = useSessionStore((s) => s.setLongFormLoading);

const [proposalShown, setProposalShown] = useState<{ shown: boolean; suggestedCount: number }>({
  shown: false,
  suggestedCount: 0,
});
const [proposalSkipped, setProposalSkipped] = useState(false);
```

**Part C: Run detect-long-form once when the output phase mounts** (only if no long_form state exists yet, no iterations exist yet, and proposal hasn't been shown or skipped):

```typescript
useEffect(() => {
  if (longForm || iterations.length > 0 || proposalShown.shown || proposalSkipped) return;
  let cancelled = false;
  (async () => {
    try {
      const r = await api.detectLongForm({ inputs, model });
      if (cancelled) return;
      if (r.is_long_form) {
        setProposalShown({ shown: true, suggestedCount: r.suggested_section_count });
      } else {
        setProposalSkipped(true);
      }
    } catch {
      // Detect failure → fall back to today's flow silently
      if (!cancelled) setProposalSkipped(true);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [longForm, iterations.length, proposalShown.shown, proposalSkipped, inputs, model]);
```

**Part D: Handlers for the proposal card.**

```typescript
const handlePlanItOut = async () => {
  setLongFormLoading(true);
  const initialLongForm: LongFormState = {
    state: 'outlining',
    current_section_index: -1,
    outline: [],
    continuity_snapshot: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  setLongForm(initialLongForm);

  try {
    const r = await api.generateOutline({
      inputs,
      suggested_section_count: proposalShown.suggestedCount,
      model,
    });
    updateOutline(r.outline);
    setLongFormStateName('review_outline');
  } catch {
    setLongForm(null);
    setProposalSkipped(true);
  } finally {
    setLongFormLoading(false);
  }
};

const handleJustGenerate = () => {
  setProposalSkipped(true);
};
```

**Part E: Render the LongFormView when long-form is active, else the proposal card (if shown), else the existing single-output view. Hide the Continue Document card when long-form is active.**

In the JSX, replace the section that renders the existing output view with a conditional structure:

```tsx
{longForm ? (
  <LongFormView />
) : proposalShown.shown && !proposalSkipped ? (
  <LongFormProposal
    suggestedSectionCount={proposalShown.suggestedCount}
    onPlanItOut={handlePlanItOut}
    onJustGenerate={handleJustGenerate}
    disabled={longFormLoading}
  />
) : (
  // ... existing single-output rendering: Generated Output card, Eval card, Continue Document card, Mode cards, etc.
)}
```

For the existing `Continue Document` card specifically: it's already conditionally rendered when `currentIteration?.evaluation?.completeness?.status === 'incomplete'`. Add `&& !longForm` to that condition so it stays hidden in long-form mode:

```tsx
{currentIteration?.evaluation?.completeness?.status === 'incomplete' && !longForm && (
  <ContinueDocumentCard ... />
)}
```

(Use the actual existing component/JSX name from the file.)

- [ ] **Step 15.2: Verify build**

Run from `frontend/`: `npm run build`
Expected: build succeeds. If you get TypeScript errors about selector names not matching the store, adapt to the actual store field names (Task 9 added the actions; Tasks 1–8 of Project B added everything else).

- [ ] **Step 15.3: Commit**

```bash
git add frontend/src/components/phases/output-phase.tsx
git commit -m "feat(frontend): integrate long-form view + proposal into output phase"
```

---

## Task 16: Manual Smoke Verification

**Files:** none — this task is human-driven verification.

- [ ] **Step 16.1: Start backend**

In one terminal:
```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m uvicorn main:app --reload --port 8000
```

- [ ] **Step 16.2: Start frontend**

In another terminal:
```bash
cd /root/code/PromptMaster/frontend && npm run dev
```

- [ ] **Step 16.3: Golden path — 15-section BRD**

In the browser:
1. Start a new session.
2. Pick Architect mode (or any mode).
3. Set objective to: *"Generate a 15-section Business Requirements Document for a customer onboarding portal, covering executive summary, stakeholders, goals, scope, functional requirements, non-functional requirements, data model, integrations, UX flows, success metrics, risks, dependencies, timeline, governance, and appendix."*
4. Set audience to "Engineering and product leadership."
5. Click Execute.
6. **Verify:** in the Output phase, the proposal card appears with "Plan It Out / Just Generate" buttons.
7. Click "Plan It Out."
8. **Verify:** state pill shows "Building outline…", then "Review outline" once the outline arrives. The outline has ~15 sections, each with a one-sentence abstract.
9. Edit one section title and one abstract. Add a new section. Delete a section.
10. Click "Start Writing."
11. **Verify:** state pill shows "Writing section 1 of N…", then "Writing section 2 of N…" etc. Each section appears in the section list as it completes.
12. After 2–3 sections, click "Pause."
13. **Verify:** state pill shows "Paused." Auto-advance halts.
14. Refresh the browser page.
15. **Verify:** session reloads with the same outline + completed sections + Paused state.
16. Click "Resume."
17. **Verify:** auto-advance picks up at the next pending section.
18. Wait for completion.
19. **Verify:** state pill shows "Done." Eval card appears below with Alignment / Clarity / Drift / Completeness. Iteration count incremented.

- [ ] **Step 16.4: Edge case — per-section Regenerate**

Click "Regenerate" on a completed section.
**Verify:** that section's content updates; section's revision indicator bumps (if surfaced visually); other sections untouched. State pill stays at "Done."

- [ ] **Step 16.5: Edge case — Skip path**

Start a new session with the same long-form objective. When the proposal appears, click "Just Generate."
**Verify:** proposal disappears, the existing single-output flow runs (one big generation, single eval card, Continue Document button reappears if completeness=incomplete).

- [ ] **Step 16.6: Edge case — short objective**

Start a new session with objective: *"Write a one-paragraph welcome email."*
**Verify:** no proposal card appears; existing single-output flow runs as today.

- [ ] **Step 16.7: Edge case — backwards compatibility**

Open a saved session created BEFORE Phase C-1.
**Verify:** renders today's flow with no long-form artifacts visible. No console errors about missing `long_form` field.

- [ ] **Step 16.8: Edge case — section error path**

In browser DevTools, throttle network to offline mid-Writing. Wait for a section to fail.
**Verify:** that section shows "error" state with Retry button. State pill goes to "Paused." Restore network, click Retry on the errored section. **Verify:** section retries and continues from there.

- [ ] **Step 16.9: Commit final smoke notes (optional)**

If you adjusted any code during smoke, commit the fixes:
```bash
git add -p
git commit -m "fix(frontend): smoke test adjustments from Phase C-1"
```

---

## Self-Review Checklist

Run this checklist against the spec before declaring complete.

| Spec requirement | Implementing task |
|------------------|-------------------|
| Detect long-form on Execute | Task 15 (output-phase useEffect) + Task 6 (endpoint) + Task 3 (detect logic) |
| Outline-first workflow | Task 6 (generate-outline endpoint) + Task 4 (logic) + Task 12 (OutlinePanel) |
| 4 states + Paused | Task 1 (schema) + Task 10 (state pill labels) + Task 14 (state transitions) |
| Section-by-section serial auto-advance | Task 14 (runAutoAdvance loop) |
| Per-section grounding (outline + snapshot + prev) | Task 5 (build_section_prompt) + Task 14 (call args) |
| Continuity snapshot rolling | Task 5 (generate_section regenerates after each) + Task 14 (sets snapshot in store) |
| Persistence to sessions.data JSONB | Task 14 (persistToSupabase between sections) + Task 9 (store slice persisted via persist middleware) |
| Continue Document hidden in long-form mode | Task 15 Part E (`&& !longForm` guard) |
| Per-section Regenerate button | Task 13 (SectionList button) + Task 14 (handleRegenerate) |
| Pause / Resume only | Task 14 (handlers) + Task 13 (state pill) |
| Eval at Complete on merged doc | Task 6 (finalize endpoint) + Task 14 (finalize handler) |
| Backwards compat (absent long_form field) | Task 7 (optional types) + Task 9 (defaults) + Task 15 (conditional render) |
| Section error → Retry | Task 13 (Retry button) + Task 14 (handleRetry) |
| `finish_reason="length"` auto-retry once | Task 14 (runAutoAdvance length branch) |
| Plain-language UI copy | Task 10 (state pill labels) + Task 11 (proposal text) + Task 13 (error copy) — no `state` / `trigger_source` / `snapshot` exposed |
| Backend stateless (loop on frontend) | Task 14 (loop in long-form-view) + Task 6 (endpoints accept all state as inputs) |

If any row has no implementing task, add one.
