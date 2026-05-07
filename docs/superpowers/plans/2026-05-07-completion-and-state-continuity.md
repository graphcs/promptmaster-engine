# Completion Detection + State Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when long outputs are incomplete (LLM-judged or mechanically cut off) and let the user click one button to continue cleanly from where it stopped, with structured state-continuity context.

**Architecture:** Extend the existing eval call to also judge `completeness` (free, no extra LLM call); use OpenRouter's `finish_reason='length'` as a free mechanical pre-filter; add a lazy-snapshot LLM call when the user clicks Continue Document; create a new `/api/continue-document` endpoint that produces a merged continuation iteration with `trigger_source='continuation'`; show a primary "Continue Document" CTA inline on the Output phase whenever `completeness.status === 'incomplete'`.

**Tech Stack:** Python 3.x + FastAPI + Pydantic 2 + httpx + pytest on backend; Next.js 16 + Zustand + Tailwind v4 + Material Symbols on frontend.

**Source spec:** `docs/superpowers/specs/2026-05-07-completion-and-state-continuity-design.md`

---

## Pre-flight

No SQL migration needed. The continuation flow has no Supabase touch — all changes ride along the existing JSONB session save path via two new optional fields (`EvaluationResult.completeness`, `Iteration.continuity_snapshot`).

---

## Task 1: Schema additions — `CompletenessResult`, `ContinuitySnapshot`, extend `EvaluationResult` and `Iteration`

**Files:**
- Modify: `backend/promptmaster/schemas.py`
- Test: `backend/tests/test_schemas.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_schemas.py`:

```python
from promptmaster.schemas import CompletenessResult, ContinuitySnapshot, EvaluationResult, DimensionScore


def test_completeness_result_round_trip():
    cr = CompletenessResult(status="incomplete", reason="Stopped mid-Section 7.")
    payload = cr.model_dump()
    restored = CompletenessResult(**payload)
    assert restored.status == "incomplete"
    assert restored.reason == "Stopped mid-Section 7."


def test_completeness_result_rejects_invalid_status():
    with pytest.raises(Exception):
        CompletenessResult(status="partial", reason="x")  # type: ignore[arg-type]


def test_continuity_snapshot_defaults_are_empty():
    snap = ContinuitySnapshot()
    assert snap.completed_topics == []
    assert snap.current_topic is None
    assert snap.key_definitions == []
    assert snap.next_topic_hint is None


def test_continuity_snapshot_round_trips_full():
    snap = ContinuitySnapshot(
        completed_topics=["Executive Summary", "Goals"],
        current_topic="Risk Analysis",
        key_definitions=["MVP defined as Phase-1 launch"],
        next_topic_hint="Continue Risk Analysis",
    )
    payload = snap.model_dump()
    restored = ContinuitySnapshot(**payload)
    assert restored.completed_topics == ["Executive Summary", "Goals"]
    assert restored.current_topic == "Risk Analysis"


def test_evaluation_result_completeness_optional_for_back_compat():
    # Old saved sessions have eval JSON without completeness — must still parse
    legacy_payload = {
        "alignment": {"score": "High", "explanation": "."},
        "drift": {"score": "Low", "explanation": "."},
        "clarity": {"score": "High", "explanation": "."},
    }
    er = EvaluationResult(**legacy_payload)
    assert er.completeness is None


def test_evaluation_result_with_completeness():
    er = EvaluationResult(
        alignment=DimensionScore(score="High", explanation="."),
        drift=DimensionScore(score="Low", explanation="."),
        clarity=DimensionScore(score="High", explanation="."),
        completeness=CompletenessResult(status="complete", reason=""),
    )
    assert er.completeness is not None
    assert er.completeness.status == "complete"


def test_iteration_continuity_snapshot_defaults_none():
    from promptmaster.schemas import Iteration
    iter_ = Iteration(
        iteration_number=1,
        prompt_sent="x",
        system_prompt_used="y",
        output="z",
        mode="architect",
    )
    assert iter_.continuity_snapshot is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: ImportError or AttributeError for `CompletenessResult`, `ContinuitySnapshot`, and `EvaluationResult.completeness` / `Iteration.continuity_snapshot`.

- [ ] **Step 3: Add new schemas in `backend/promptmaster/schemas.py`**

After the existing `DimensionScore` class and before `EvaluationResult`, insert:

```python
class CompletenessResult(BaseModel):
    """Structural completeness judgment for an iteration's output."""
    status: Literal["complete", "incomplete"]
    reason: str = Field(default="", description="Short explanation when incomplete.")
```

Replace the existing `EvaluationResult` class body with:

```python
class EvaluationResult(BaseModel):
    """Result from the evaluator LLM call."""
    alignment: DimensionScore = Field(..., description="Does output match the stated objective?")
    drift: DimensionScore = Field(..., description="Does output introduce irrelevant content?")
    clarity: DimensionScore = Field(..., description="Is the output structured and unambiguous?")
    completeness: CompletenessResult | None = Field(
        default=None,
        description="Structural completeness — set by extended eval call. Optional for backward compat with old saved sessions.",
    )

    @property
    def needs_realignment(self) -> bool:
        """Realignment triggers if Alignment < Medium OR Drift > Medium."""
        return self.alignment.score == "Low" or self.drift.score == "High"
```

After the existing `ChatMessage` class (or wherever you prefer at the end of the file), append:

```python
class ContinuitySnapshot(BaseModel):
    """Snapshot of progress used to build a continuation prompt.

    Generated lazily when the user clicks Continue Document.
    Stored on the resulting continuation iteration for inspection.
    """
    completed_topics: list[str] = Field(default_factory=list, description="Short phrases naming each section/topic already covered.")
    current_topic: str | None = Field(default=None, description="Where the previous output trails off, if mid-section.")
    key_definitions: list[str] = Field(default_factory=list, description="Terms or constraints established earlier that the continuation must respect.")
    next_topic_hint: str | None = Field(default=None, description="What to write next, if the structure makes it obvious.")
```

Update `Iteration` to add `continuity_snapshot` (insert after `summary`):

```python
class Iteration(BaseModel):
    """Record of a single generate-evaluate cycle."""
    iteration_number: int = Field(..., ge=1)
    prompt_sent: str = Field(..., description="The prompt text sent to LLM")
    system_prompt_used: str = Field(default="", description="System prompt used")
    output: str = Field(..., description="LLM response text")
    mode: ModeType = Field(...)
    evaluation: EvaluationResult | None = Field(default=None)
    trigger_source: str | None = Field(
        default=None,
        description="Where this iteration came from: 'initial', 'refine', 'realignment', 'challenge', 'self_audit', 'drift_alert', 'refine_shorter', etc.",
    )
    user_rating: Literal["positive", "negative"] | None = Field(
        default=None,
        description="User's explicit rating of this iteration — 'positive' (strong) or 'negative' (poor), or None if unrated.",
    )
    summary: str | None = Field(
        default=None,
        description="Brief LLM-generated summary of what changed from the previous version. None for the first iteration.",
    )
    continuity_snapshot: ContinuitySnapshot | None = Field(
        default=None,
        description="Snapshot used to build this iteration's continuation prompt. Set on continuation iterations only.",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: All 7 new tests pass; existing 4 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/promptmaster/schemas.py backend/tests/test_schemas.py
git commit -m "feat(backend): add CompletenessResult, ContinuitySnapshot schemas + optional fields"
```

---

## Task 2: Extend `OpenRouterClient` with `generate_with_meta()`

**Files:**
- Modify: `backend/promptmaster/llm_client.py`
- Test: `backend/tests/test_llm_client_meta.py` (new)

The existing `_single_request()` already extracts `finish_reason` (line ~191) but discards it after the function returns. We'll change `_single_request` to return a 3-tuple, keep `generate()` discarding the third element to preserve its public signature, and add `generate_with_meta()` returning the full 3-tuple.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_client_meta.py`:

```python
"""Tests for OpenRouterClient.generate_with_meta()."""

from unittest.mock import AsyncMock, patch

import pytest

from promptmaster.llm_client import OpenRouterClient


@pytest.mark.asyncio
async def test_generate_with_meta_returns_finish_reason():
    """generate_with_meta returns (content, usage, finish_reason) tuple."""
    client = OpenRouterClient(api_key="test-key")
    fake_response_data = {
        "choices": [
            {
                "message": {"content": "Hello world"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }

    fake_response = AsyncMock()
    fake_response.status_code = 200
    fake_response.json = lambda: fake_response_data
    fake_response.raise_for_status = lambda: None

    with patch.object(client._client, "post", return_value=fake_response):
        content, usage, finish_reason = await client.generate_with_meta(
            prompt="hi", system="you are helpful"
        )

    assert content == "Hello world"
    assert usage["tokens_in"] == 10
    assert usage["tokens_out"] == 5
    assert finish_reason == "stop"

    await client.close()


@pytest.mark.asyncio
async def test_generate_with_meta_propagates_length_finish_reason():
    """When the LLM hits max_tokens, finish_reason='length' must surface."""
    client = OpenRouterClient(api_key="test-key")
    fake_response_data = {
        "choices": [
            {
                "message": {"content": "Partial response that was cut..."},
                "finish_reason": "length",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 16384},
    }

    fake_response = AsyncMock()
    fake_response.status_code = 200
    fake_response.json = lambda: fake_response_data
    fake_response.raise_for_status = lambda: None

    with patch.object(client._client, "post", return_value=fake_response):
        content, usage, finish_reason = await client.generate_with_meta(prompt="hi")

    assert finish_reason == "length"

    await client.close()


@pytest.mark.asyncio
async def test_existing_generate_still_returns_two_tuple():
    """Existing generate() must keep its (content, usage) signature unchanged."""
    client = OpenRouterClient(api_key="test-key")
    fake_response_data = {
        "choices": [
            {
                "message": {"content": "Hello"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 2},
    }
    fake_response = AsyncMock()
    fake_response.status_code = 200
    fake_response.json = lambda: fake_response_data
    fake_response.raise_for_status = lambda: None

    with patch.object(client._client, "post", return_value=fake_response):
        result = await client.generate(prompt="hi")

    assert isinstance(result, tuple)
    assert len(result) == 2  # Must still be 2-tuple
    content, usage = result
    assert content == "Hello"

    await client.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_llm_client_meta.py -v
```
Expected: AttributeError on `generate_with_meta`.

- [ ] **Step 3: Modify `backend/promptmaster/llm_client.py`**

Change `_single_request` to return a 3-tuple. Find this section (around line 200-208):

```python
            elapsed = time.monotonic() - t0
            logger.info(f"LLM response: {usage_stats['tokens_in']:,} in / {usage_stats['tokens_out']:,} out ({elapsed:.1f}s)")

            return content, usage_stats
```

Replace with:

```python
            elapsed = time.monotonic() - t0
            logger.info(f"LLM response: {usage_stats['tokens_in']:,} in / {usage_stats['tokens_out']:,} out ({elapsed:.1f}s)")

            return content, usage_stats, finish_reason
```

Update its return type signature (line ~170):

```python
    async def _single_request(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        attempt: int,
    ) -> tuple[str, dict[str, int], str]:
        """Execute a single HTTP request."""
```

Modify `generate()` to discard the new third element (around line 91-94):

```python
        for attempt in range(1, _RETRY_MAX_ATTEMPTS + 1):
            try:
                content, usage_stats, _finish_reason = await self._single_request(payload, headers, attempt)
                return content, usage_stats
```

Add a new `generate_with_meta()` method right after `generate()` and before `generate_json()`. The full method:

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
        """Like generate(), but also returns the OpenRouter finish_reason.

        Returns:
            Tuple of (response_content, usage_stats, finish_reason).
            finish_reason is one of: "stop", "length", "content_filter", "tool_calls", "unknown".
        """
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/graphcs/promptmaster-engine",
            "X-Title": "PromptMaster Engine",
        }

        last_error: Exception | None = None

        for attempt in range(1, _RETRY_MAX_ATTEMPTS + 1):
            try:
                content, usage_stats, finish_reason = await self._single_request(payload, headers, attempt)
                return content, usage_stats, finish_reason
            except OpenRouterError as e:
                if not self._is_retryable(e) or attempt == _RETRY_MAX_ATTEMPTS:
                    if attempt == _RETRY_MAX_ATTEMPTS:
                        last_error = e
                        break
                    raise
                last_error = e
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(f"Retryable error (attempt {attempt}/{_RETRY_MAX_ATTEMPTS}), retrying in {delay:.1f}s: {e}")
                await asyncio.sleep(delay)

        raise last_error or OpenRouterError("All retry attempts failed")
```

Modify `generate_json()` (around line 123-130) — its internal call to `generate()` is fine because `generate()` still returns 2-tuple. No change needed there.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_llm_client_meta.py -v
```
Expected: All 3 tests pass.

- [ ] **Step 5: Run full backend suite for regression check**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: All tests pass (no regression).

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/llm_client.py backend/tests/test_llm_client_meta.py
git commit -m "feat(backend): add OpenRouterClient.generate_with_meta returning finish_reason"
```

---

## Task 3: Extend the evaluator to judge completeness

**Files:**
- Modify: `backend/promptmaster/evaluator.py`
- Test: `backend/tests/test_evaluator_completeness.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_evaluator_completeness.py`:

```python
"""Tests for the extended evaluator that judges completeness."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.evaluator import EVALUATOR_PROMPT, evaluate_output
from promptmaster.schemas import EvaluationResult


def test_evaluator_prompt_asks_for_completeness():
    rendered = EVALUATOR_PROMPT.format(
        objective="x",
        audience="y",
        constraints="z",
        output_format="lists",
        mode="architect",
        output="some output",
        session_history="(none)",
    )
    assert "completeness" in rendered.lower()
    assert "complete" in rendered.lower() and "incomplete" in rendered.lower()


@pytest.mark.asyncio
async def test_evaluate_output_parses_completeness_when_present(basic_inputs):
    """Eval LLM returns completeness alongside the three existing dimensions."""
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "High", "explanation": "On topic."},
        "drift": {"score": "Low", "explanation": "Focused."},
        "clarity": {"score": "High", "explanation": "Clear."},
        "completeness": {"status": "incomplete", "reason": "Stopped mid-Section 7."},
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result: EvaluationResult = await evaluate_output(
        client=client, inputs=basic_inputs, output="some output"
    )
    assert result.completeness is not None
    assert result.completeness.status == "incomplete"
    assert "Section 7" in result.completeness.reason


@pytest.mark.asyncio
async def test_evaluate_output_handles_missing_completeness_gracefully(basic_inputs):
    """When the LLM omits completeness, eval result still parses with completeness=None."""
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "High", "explanation": "."},
        "drift": {"score": "Low", "explanation": "."},
        "clarity": {"score": "High", "explanation": "."},
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result = await evaluate_output(
        client=client, inputs=basic_inputs, output="some output"
    )
    assert result.completeness is None


@pytest.mark.asyncio
async def test_evaluate_output_handles_invalid_completeness_gracefully(basic_inputs):
    """When LLM returns malformed completeness JSON, set to None instead of crashing."""
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "High", "explanation": "."},
        "drift": {"score": "Low", "explanation": "."},
        "clarity": {"score": "High", "explanation": "."},
        "completeness": {"status": "kinda_done", "reason": "x"},  # invalid status
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result = await evaluate_output(
        client=client, inputs=basic_inputs, output="some output"
    )
    # Other dimensions intact, completeness gracefully None
    assert result.alignment.score == "High"
    assert result.completeness is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_evaluator_completeness.py -v
```
Expected: 4 fails — first because the prompt doesn't yet mention completeness, others because eval doesn't parse the new field.

- [ ] **Step 3: Update `backend/promptmaster/evaluator.py`**

Replace the `EVALUATOR_PROMPT` constant. The full new value (find the current `EVALUATOR_PROMPT = """..."""` block and replace):

```python
EVALUATOR_PROMPT = """Evaluate the following AI-generated output against the original request.

ORIGINAL OBJECTIVE: {objective}
TARGET AUDIENCE: {audience}
CONSTRAINTS: {constraints}
REQUESTED FORMAT: {output_format}
MODE USED: {mode}

{session_history}

--- BEGIN CURRENT OUTPUT (the one you are evaluating) ---
{output}
--- END CURRENT OUTPUT ---

Evaluate along four dimensions. For the first three, assign "Low", "Medium", or "High" and provide exactly one sentence of explanation.

SCORING GUIDELINES (be consistent — do not change a score unless the output genuinely changed):
- "High" = strong, well-targeted output that clearly meets the bar. Award it confidently when earned. If the output addresses the objective, is well-structured, and stays on scope, it deserves "High."
- "Medium" = acceptable but with clear, specific room for improvement. You MUST name what is lacking.
- "Low" = significant problems — misses the objective, drifts off-topic, or is poorly structured.

IMPORTANT: Do not penalize stylistic variation. Focus on substance, not style.

1. ALIGNMENT: Does the output directly address the stated objective for the target audience?
   - Consider: Does it answer what was asked? Is it substantive enough? Does it match the audience's needs?
   - "High" = on-target and substantive. "Medium" = addresses the topic but misses key aspects. "Low" = misses the objective or is too vague/broad.

2. DRIFT: Did the output escape the PromptMaster scaffolding? Drift is the primary failure mode in AI interactions.
   - Signs of drift: covering topics NOT asked for, breaking character from the selected mode ({mode}), becoming generic when specificity was needed, padding with filler, fixating on tangents, or losing the mode's required tone.
   - "Low" = focused and stays within scope (this is GOOD). "Medium" = mostly focused but includes unnecessary content. "High" = significant scope deviation or off-topic material.

3. CLARITY: Is the output well-structured, unambiguous, and complete?
   - Consider the mode's expected output style: {mode} mode has specific structural expectations.
   - "High" = clear, well-organized, easy to follow. "Medium" = understandable but could be tighter. "Low" = confusing, vague, or incomplete.

4. COMPLETENESS: Does the output appear structurally complete given the objective?
   - "complete" = the answer covers what the objective required, with appropriate depth across all expected sections/topics. The output reads as a finished response.
   - "incomplete" = the answer stops mid-section, runs out of room, covers only some expected sections, skips depth on later sections, or leaves obvious gaps. If the user asked for a 15-section BRD and only 5 sections appear, mark INCOMPLETE.
   - If INCOMPLETE, name in one short sentence WHERE it stops or what's missing (e.g., "Stopped mid-Section 7: Risk Analysis." or "Only covers Sections 1-5 of an expected 15-section BRD.").

Return JSON in exactly this format:
{{
    "alignment": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "drift": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "clarity": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "completeness": {{"status": "complete|incomplete", "reason": "one short sentence (empty string if complete)"}}
}}"""
```

Update the imports at the top to include `CompletenessResult`:

```python
from .schemas import PMInput, EvaluationResult, DimensionScore, Iteration, CompletenessResult
```

Replace the `evaluate_output` function body — the changed portion is the result-building block. Find the current return and surrounding try/except (around lines 111-131), and replace with:

```python
    try:
        result_dict, _usage = await client.generate_json(
            prompt=prompt,
            system=EVALUATOR_SYSTEM,
            temperature=0.15,
            max_tokens=512,
            model=model,
        )

        # Parse completeness defensively — accept missing or malformed values gracefully.
        completeness: CompletenessResult | None = None
        comp_raw = result_dict.get("completeness")
        if isinstance(comp_raw, dict):
            try:
                completeness = CompletenessResult(**comp_raw)
            except Exception as comp_err:
                logger.warning(f"Invalid completeness in eval response, dropping: {comp_err}")
                completeness = None

        return EvaluationResult(
            alignment=DimensionScore(**result_dict.get("alignment", {"score": "Medium", "explanation": "Unable to evaluate"})),
            drift=DimensionScore(**result_dict.get("drift", {"score": "Medium", "explanation": "Unable to evaluate"})),
            clarity=DimensionScore(**result_dict.get("clarity", {"score": "Medium", "explanation": "Unable to evaluate"})),
            completeness=completeness,
        )
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        return EvaluationResult(
            alignment=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            drift=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            clarity=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            completeness=None,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_evaluator_completeness.py -v
```
Expected: All 4 tests pass.

- [ ] **Step 5: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/evaluator.py backend/tests/test_evaluator_completeness.py
git commit -m "feat(backend): extend evaluator to judge completeness as 4th dimension"
```

---

## Task 4: Add `continuation` trigger label and extract pipeline helper

**Files:**
- Modify: `backend/promptmaster/session_context.py:13-29`
- Create: `backend/routers/_pipeline.py`
- Modify: `backend/routers/conversation.py` (replace local helper with import + override on length cutoff)

This task achieves two related cleanups: (a) add the new trigger source label so summary lines render correctly; (b) move `_build_iteration_with_full_pipeline` into a shared module so the new continuation router can reuse it. We also add a small helper that overrides `evaluation.completeness` to `incomplete` whenever `finish_reason='length'`.

- [ ] **Step 1: Update `_TRIGGER_LABELS` in `backend/promptmaster/session_context.py`**

Replace the dict (currently lines 13-29):

```python
_TRIGGER_LABELS = {
    "initial": "initial run",
    "refine": "Refine Prompt",
    "realignment": "Realignment",
    "challenge": "Challenge This",
    "self_audit": "Self-Audit",
    "drift_alert": "Drift Alert",
    "refine_shorter": "Refine: Shorter",
    "refine_technical": "Refine: More technical",
    "refine_concrete": "Refine: More concrete",
    "refine_angle": "Refine: Different angle",
    "refine_cautious": "Refine: More cautious",
    "ask_questions": "Ask Questions follow-up",
    "conversation": "Conversation follow-up",  # legacy
    "apply_conversation": "Applied chat to answer",
    "refined_from_conversation": "New version from chat",
    "continuation": "Continued document",
}
```

- [ ] **Step 2: Create `backend/routers/_pipeline.py`**

```python
"""Shared helpers used by routers that create iterations.

Currently used by:
- routers/conversation.py (apply-to-answer, save-as-new-version)
- routers/continuation.py (continue-document)
"""

from __future__ import annotations

import asyncio
from typing import Awaitable

from promptmaster.evaluator import evaluate_output
from promptmaster.guidance import generate_suggestions
from promptmaster.llm_client import OpenRouterClient
from promptmaster.schemas import (
    ChatMessage,
    CompletenessResult,
    EvaluationResult,
    Iteration,
    PMInput,
)
from promptmaster.summaries import generate_summary


def force_incomplete_on_length(
    evaluation: EvaluationResult | None,
    finish_reason: str,
) -> EvaluationResult | None:
    """If the LLM hit max_tokens, force completeness=incomplete regardless of LLM judgment."""
    if finish_reason != "length" or evaluation is None:
        return evaluation
    return evaluation.model_copy(
        update={
            "completeness": CompletenessResult(
                status="incomplete",
                reason="Output reached the model's length limit.",
            )
        }
    )


async def build_iteration_with_full_pipeline(
    *,
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    output: str,
    iteration_number: int,
    system_text: str,
    prompt_text: str,
    trigger_source: str,
    active_iteration: Iteration,
    chat_history: list[ChatMessage],
    iteration_history: list[Iteration],
    user_action_label: str,
    finish_reason: str = "stop",
) -> tuple[Iteration, list[str]]:
    """Run eval + suggestions + summary in parallel, then assemble the iteration.

    If finish_reason='length', overrides evaluation.completeness to incomplete after
    the eval call returns. Returns (iteration, suggestions).
    """
    iteration_draft = Iteration(
        iteration_number=iteration_number,
        prompt_sent=prompt_text,
        system_prompt_used=system_text,
        output=output,
        mode=inputs.mode,
        evaluation=None,
        trigger_source=trigger_source,
    )

    eval_task: Awaitable[EvaluationResult] = evaluate_output(
        client, inputs, output, iterations=iteration_history, model=model
    )
    suggestions_task: Awaitable[list[str]] = generate_suggestions(
        client=client,
        inputs=inputs,
        output=output,
        iterations=iteration_history,
        model=model,
    )
    summary_task: Awaitable[str] = generate_summary(
        client=client,
        model=model,
        inputs=inputs,
        prev_iter=active_iteration,
        new_iter=iteration_draft,
        chat_history=chat_history,
        user_action=user_action_label,
    )

    evaluation, suggestions, summary = await asyncio.gather(
        eval_task, suggestions_task, summary_task
    )

    # Mechanical pre-filter: if model hit length, force incomplete regardless of LLM judgment
    evaluation = force_incomplete_on_length(evaluation, finish_reason)

    iteration = Iteration(
        iteration_number=iteration_number,
        prompt_sent=prompt_text,
        system_prompt_used=system_text,
        output=output,
        mode=inputs.mode,
        evaluation=evaluation,
        trigger_source=trigger_source,
        summary=summary,
    )
    return iteration, suggestions
```

- [ ] **Step 3: Update `backend/routers/conversation.py` to import from `_pipeline.py`**

Find the existing `_build_iteration_with_full_pipeline` function (in conversation.py) and remove it entirely. Add an import at the top of `conversation.py`:

```python
from routers._pipeline import build_iteration_with_full_pipeline, force_incomplete_on_length
```

Find the two callers — `api_apply_to_answer` and `api_save_as_new_version` — and replace each call to `_build_iteration_with_full_pipeline(...)` with `build_iteration_with_full_pipeline(...)` (drop the leading underscore).

For each of those endpoints, also switch the `await generate(...)` call to `await client.generate_with_meta(...)` to capture finish_reason. Then pass `finish_reason=finish_reason` into `build_iteration_with_full_pipeline`. The current `generate` import from `promptmaster.engine` stays in conversation.py for any other use, but the apply/save endpoints switch to direct client usage to capture finish_reason.

Concretely, `api_apply_to_answer` body becomes:

```python
@router.post("/apply-to-answer")
async def api_apply_to_answer(
    req: ApplyToAnswerRequest,
    client: OpenRouterClient = Depends(get_client),
) -> IterationFromConversationResponse:
    """Patch the active iteration's answer with conversation insights → new iteration."""
    try:
        model = req.model or None
        system_text, prompt_text = build_apply_to_answer_prompt(
            inputs=req.inputs,
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iterations=req.iteration_history,
        )
        output, _usage, finish_reason = await client.generate_with_meta(
            prompt=prompt_text,
            system=system_text,
            model=model,
        )
        iteration, suggestions = await build_iteration_with_full_pipeline(
            client=client,
            model=model,
            inputs=req.inputs,
            output=output,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="apply_conversation",
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iteration_history=req.iteration_history,
            user_action_label="Applied chat to answer",
            finish_reason=finish_reason,
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

Apply the same pattern to `api_save_as_new_version`. The `api_chat_message` endpoint stays unchanged — chat replies don't create iterations and don't need finish_reason handling.

- [ ] **Step 4: Verify imports**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -c "import main; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all existing tests pass. (`test_conversation_router.py` may need a tiny update if it inspects `_build_iteration_with_full_pipeline` by name; verify and adjust.)

If a test references the old name, replace `_build_iteration_with_full_pipeline` with `build_iteration_with_full_pipeline` in the test.

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/session_context.py backend/routers/_pipeline.py backend/routers/conversation.py backend/tests/
git commit -m "refactor(backend): extract iteration pipeline helper, add length-cutoff override"
```

---

## Task 5: Wire `finish_reason='length'` override into `engine.py` endpoints

**Files:**
- Modify: `backend/routers/engine.py` (run-iteration, flow-trigger)

This task makes `run-iteration` and `flow-trigger` capture `finish_reason` and override completeness when length-truncated. The flow-trigger diagnostic branch (challenge/self_audit/reframe) doesn't get eval, so it doesn't need this override.

- [ ] **Step 1: Update `api_run_iteration` in `backend/routers/engine.py`**

Add to imports at the top:

```python
from routers._pipeline import force_incomplete_on_length
```

Find the `api_run_iteration` function (around line 127). Replace the `output = await generate(...)` block with:

```python
        # Step 1: Generate output (must complete first) — capture finish_reason for completeness pre-filter
        output, _usage, finish_reason = await client.generate_with_meta(
            prompt=req.prompt_text,
            system=req.system_text,
            model=model,
        )
```

(The previous version called `from promptmaster.engine import generate` and used the helper — that's fine, we just bypass it here to capture finish_reason. Keep the existing `generate` import if other code uses it.)

After the `await asyncio.gather(...)` that produces `evaluation, suggestions[, summary]`, but before the final `Iteration(...)` construction, insert:

```python
        evaluation = force_incomplete_on_length(evaluation, finish_reason)
```

The full updated `api_run_iteration` (replace the entire function):

```python
@router.post("/run-iteration")
async def api_run_iteration(
    req: RunIterationRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run one generate-evaluate cycle. Generate first, then evaluate + suggestions + summary in parallel."""
    try:
        model = req.model or None
        history = req.iteration_history

        # Step 1: Generate output (must complete first) — capture finish_reason for completeness pre-filter
        output, _usage, finish_reason = await client.generate_with_meta(
            prompt=req.prompt_text,
            system=req.system_text,
            model=model,
        )

        iteration_draft = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=req.prompt_text,
            system_prompt_used=req.system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=None,
            trigger_source=req.source,
        )

        eval_task = evaluate_output(client, req.inputs, output, iterations=history, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            iterations=history,
            model=model,
        )

        if history and len(history) > 0:
            prev = history[-1]
            summary_task = generate_summary(
                client=client,
                model=model,
                inputs=req.inputs,
                prev_iter=prev,
                new_iter=iteration_draft,
                chat_history=[],
                user_action=_label_trigger(req.source),
            )
            evaluation, suggestions, summary = await asyncio.gather(
                eval_task, suggestions_task, summary_task
            )
        else:
            evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)
            summary = None

        # Pre-filter: force incomplete if model hit max_tokens
        evaluation = force_incomplete_on_length(evaluation, finish_reason)

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=req.prompt_text,
            system_prompt_used=req.system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
            trigger_source=req.source,
            summary=summary,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 2: Update `api_flow_trigger` (non-diagnostic branch only)**

Find `api_flow_trigger` (around line 171). Apply the same pattern: switch generation to `client.generate_with_meta()` capturing `finish_reason`, and call `force_incomplete_on_length(evaluation, finish_reason)` after the eval gather. The diagnostic branch (`is_diagnostic=True`) is unchanged — no eval, no completeness, no override needed there.

The full updated `api_flow_trigger`:

```python
@router.post("/flow-trigger")
async def api_flow_trigger(
    req: FlowTriggerRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run a one-click flow trigger (Challenge, Self-Audit, Drift Alert, Refine).

    Builds a pre-configured prompt from the book's Ch1 S13-S14 techniques,
    then runs the full pipeline: generate -> (evaluate || suggestions || summary).
    """
    try:
        model = req.model or None
        history = req.iteration_history

        system_text, prompt_text = build_flow_trigger_prompt(
            inputs=req.inputs,
            current_output=req.current_output,
            trigger=req.trigger,
            evaluation=req.evaluation,
            iterations=history,
        )

        output, _usage, finish_reason = await client.generate_with_meta(
            prompt=prompt_text,
            system=system_text,
            model=model,
        )

        is_diagnostic = req.trigger in ("challenge", "self_audit", "reframe")

        if is_diagnostic:
            iteration = Iteration(
                iteration_number=req.iteration_number,
                prompt_sent=prompt_text,
                system_prompt_used=system_text,
                output=output,
                mode=req.inputs.mode,
                evaluation=None,
                trigger_source=req.trigger,
            )
            return RunIterationResponse(iteration=iteration, suggestions=[])

        iteration_draft = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=prompt_text,
            system_prompt_used=system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=None,
            trigger_source=req.trigger,
        )

        eval_task = evaluate_output(client, req.inputs, output, iterations=history, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            iterations=history,
            model=model,
        )

        if history and len(history) > 0:
            prev = history[-1]
            summary_task = generate_summary(
                client=client,
                model=model,
                inputs=req.inputs,
                prev_iter=prev,
                new_iter=iteration_draft,
                chat_history=[],
                user_action=_label_trigger(req.trigger),
            )
            evaluation, suggestions, summary = await asyncio.gather(
                eval_task, suggestions_task, summary_task
            )
        else:
            evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)
            summary = None

        # Pre-filter: force incomplete if model hit max_tokens
        evaluation = force_incomplete_on_length(evaluation, finish_reason)

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=prompt_text,
            system_prompt_used=system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
            trigger_source=req.trigger,
            summary=summary,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 3: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass. (The existing engine tests still hold — they verify summary wiring, not the new finish_reason capture.)

- [ ] **Step 4: Commit**

```bash
git add backend/routers/engine.py
git commit -m "feat(backend): wire finish_reason override into run-iteration and flow-trigger"
```

---

## Task 6: Build the continuity module

**Files:**
- Create: `backend/promptmaster/continuity.py`
- Test: `backend/tests/test_continuity.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_continuity.py`:

```python
"""Tests for snapshot generation and continuation prompt building."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.continuity import (
    build_continuation_prompt,
    build_snapshot_prompt,
    generate_continuity_snapshot,
)
from promptmaster.schemas import ContinuitySnapshot, Iteration


# --- snapshot prompt ---

def test_snapshot_prompt_includes_objective_and_output(basic_inputs):
    system, user = build_snapshot_prompt(
        inputs=basic_inputs,
        previous_output="Section 1 done. Section 2 done. Section 3 in progress: lorem ipsum...",
    )
    assert basic_inputs.objective in user
    assert "Section 3 in progress" in user


def test_snapshot_prompt_asks_for_structured_fields(basic_inputs):
    _, user = build_snapshot_prompt(
        inputs=basic_inputs,
        previous_output="Some output",
    )
    for field in ("completed_topics", "current_topic", "key_definitions", "next_topic_hint"):
        assert field in user


# --- snapshot generation ---

@pytest.mark.asyncio
async def test_generate_continuity_snapshot_returns_parsed_snapshot(basic_inputs):
    client = AsyncMock()
    fake_json = {
        "completed_topics": ["Executive Summary", "Goals"],
        "current_topic": "Risk Analysis",
        "key_definitions": ["MVP = Phase 1 only"],
        "next_topic_hint": "Continue Risk Analysis with mitigation plans",
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    snap = await generate_continuity_snapshot(
        client=client, model=None, inputs=basic_inputs, previous_output="..."
    )
    assert isinstance(snap, ContinuitySnapshot)
    assert snap.completed_topics == ["Executive Summary", "Goals"]
    assert snap.current_topic == "Risk Analysis"
    client.generate_json.assert_called_once()


@pytest.mark.asyncio
async def test_generate_continuity_snapshot_handles_partial_json(basic_inputs):
    """Missing fields default to empty list/None — never crashes."""
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=({"completed_topics": ["a"]}, {}))
    snap = await generate_continuity_snapshot(
        client=client, model=None, inputs=basic_inputs, previous_output="..."
    )
    assert snap.completed_topics == ["a"]
    assert snap.current_topic is None
    assert snap.key_definitions == []
    assert snap.next_topic_hint is None


# --- continuation prompt ---

def test_continuation_prompt_includes_previous_output_and_no_repeat_directive(
    basic_inputs, basic_iteration
):
    snap = ContinuitySnapshot(
        completed_topics=["Section 1", "Section 2"],
        current_topic="Section 3",
        key_definitions=["scope = Phase 1"],
        next_topic_hint="Continue Section 3",
    )
    incomplete_iter = Iteration(
        iteration_number=2,
        prompt_sent="...",
        system_prompt_used="...",
        output="Section 1 done. Section 2 done. Section 3 in progress: lorem ipsum...",
        mode="architect",
    )
    system, user = build_continuation_prompt(
        inputs=basic_inputs,
        incomplete_iteration=incomplete_iter,
        snapshot=snap,
        iterations=[basic_iteration, incomplete_iter],
    )
    # User prompt has the previous output text
    assert "Section 1 done" in user
    # System prompt instructs continuation behavior + no-repeat
    assert "CONTINUATION" in system or "continuation" in system.lower()
    assert "do not repeat" in system.lower() or "do not repeat" in user.lower()


def test_continuation_prompt_includes_snapshot_fields(basic_inputs, basic_iteration):
    snap = ContinuitySnapshot(
        completed_topics=["Goals", "Stakeholders"],
        current_topic=None,
        key_definitions=["scope = Phase 1"],
        next_topic_hint=None,
    )
    incomplete_iter = Iteration(
        iteration_number=2,
        prompt_sent="...",
        system_prompt_used="...",
        output="Goals: ... Stakeholders: ...",
        mode="architect",
    )
    system, _ = build_continuation_prompt(
        inputs=basic_inputs,
        incomplete_iteration=incomplete_iter,
        snapshot=snap,
        iterations=[basic_iteration, incomplete_iter],
    )
    # Snapshot fields appear in the system prompt
    assert "Goals" in system
    assert "Stakeholders" in system
    assert "scope = Phase 1" in system
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_continuity.py -v
```
Expected: ImportError on `promptmaster.continuity`.

- [ ] **Step 3: Create `backend/promptmaster/continuity.py`**

```python
"""Snapshot generation and continuation prompt builders.

Used by the /api/continue-document endpoint. Lazy: snapshot generation
runs only when the user clicks Continue Document, never eagerly.
"""

from __future__ import annotations

import logging

from .conversation import _shared_system
from .llm_client import OpenRouterClient
from .schemas import ContinuitySnapshot, Iteration, PMInput

logger = logging.getLogger(__name__)


_SNAPSHOT_SYSTEM = (
    "You compress in-progress work into a small structured snapshot so a "
    "continuation prompt can be built. Be concise. Output JSON only."
)


def build_snapshot_prompt(
    inputs: PMInput,
    previous_output: str,
) -> tuple[str, str]:
    """Build (system, user) prompts for the snapshot LLM call."""
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        "Identify each of the following from the partial output below:\n"
        "- completed_topics: list of short phrases naming sections/topics already covered\n"
        "- current_topic: the section/topic where the output trails off, or null if it stopped cleanly between sections\n"
        "- key_definitions: list of terms, constraints, or decisions established that the continuation must respect\n"
        "- next_topic_hint: short phrase describing what to write next, or null\n\n"
        "Partial output:\n"
        f"{previous_output}\n\n"
        "Return JSON only."
    )
    return _SNAPSHOT_SYSTEM, user


async def generate_continuity_snapshot(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    previous_output: str,
) -> ContinuitySnapshot:
    """Run a small generate_json call. Returns parsed snapshot.

    Defensive parsing: missing fields default to empty list / None so a
    malformed response can't crash the continuation flow.
    """
    system, user = build_snapshot_prompt(inputs, previous_output)
    try:
        result, _usage = await client.generate_json(
            prompt=user,
            system=system,
            temperature=0.2,
            max_tokens=512,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Snapshot generation failed, returning empty snapshot: {e}")
        return ContinuitySnapshot()

    return ContinuitySnapshot(
        completed_topics=result.get("completed_topics") or [],
        current_topic=result.get("current_topic"),
        key_definitions=result.get("key_definitions") or [],
        next_topic_hint=result.get("next_topic_hint"),
    )


_CONTINUATION_INSTRUCTION = (
    "CONTINUATION MODE: The previous output was incomplete and stopped before the work "
    "was finished. You are continuing the same task from where it left off.\n\n"
    "STATE SNAPSHOT (what's been done so far):\n"
    "- Completed topics: {completed_topics}\n"
    "- Current topic (where it trails off): {current_topic}\n"
    "- Key definitions / constraints to respect: {key_definitions}\n"
    "- Suggested next topic: {next_topic_hint}\n\n"
    "CRITICAL RULES:\n"
    "- Do NOT repeat any content already in the previous output.\n"
    "- Continue from where the previous output trails off — same tone, same structure.\n"
    "- If the structure has numbered sections, continue the numbering.\n"
    "- Stop when you've covered the remaining sections/topics naturally."
)


def build_continuation_prompt(
    inputs: PMInput,
    incomplete_iteration: Iteration,
    snapshot: ContinuitySnapshot,
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompts for the continuation generation call."""
    instruction = _CONTINUATION_INSTRUCTION.format(
        completed_topics=", ".join(snapshot.completed_topics) if snapshot.completed_topics else "(none recorded)",
        current_topic=snapshot.current_topic or "(none)",
        key_definitions="; ".join(snapshot.key_definitions) if snapshot.key_definitions else "(none recorded)",
        next_topic_hint=snapshot.next_topic_hint or "(continue naturally)",
    )
    system = _shared_system(inputs, iterations, instruction)
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        "PREVIOUS OUTPUT (do not repeat any of this):\n"
        f"{incomplete_iteration.output}\n\n"
        "Continue from where the previous output trails off. Output only the continuation."
    )
    return system, user
```

- [ ] **Step 4: Run tests**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_continuity.py -v
```
Expected: All 6 tests pass.

- [ ] **Step 5: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/continuity.py backend/tests/test_continuity.py
git commit -m "feat(backend): add continuity module — snapshot helper + continuation prompt"
```

---

## Task 7: Continuation router with `/api/continue-document` endpoint

**Files:**
- Create: `backend/routers/continuation.py`
- Modify: `backend/main.py:49-55`
- Test: `backend/tests/test_continuation_router.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_continuation_router.py`:

```python
"""Smoke tests for the continuation router (request shapes + wiring)."""

import inspect

from routers import continuation as cont


def test_continue_document_request_has_required_fields():
    fields = cont.ContinueDocumentRequest.model_fields
    for required in ("inputs", "incomplete_iteration", "iteration_number", "iteration_history", "model"):
        assert required in fields, f"missing field: {required}"


def test_router_registers_endpoint():
    paths = [r.path for r in cont.router.routes]
    assert "/api/continue-document" in paths


def test_endpoint_uses_snapshot_and_continuation_builders():
    src = inspect.getsource(cont.api_continue_document)
    assert "generate_continuity_snapshot" in src
    assert "build_continuation_prompt" in src


def test_endpoint_uses_pipeline_helper():
    src = inspect.getsource(cont.api_continue_document)
    assert "build_iteration_with_full_pipeline" in src


def test_endpoint_attaches_snapshot_to_iteration():
    """The new iteration must carry the continuity_snapshot attribute set."""
    src = inspect.getsource(cont.api_continue_document)
    assert "continuity_snapshot" in src


def test_endpoint_uses_continuation_trigger_source():
    src = inspect.getsource(cont.api_continue_document)
    assert "continuation" in src  # trigger_source string
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_continuation_router.py -v
```
Expected: ImportError on `routers.continuation`.

- [ ] **Step 3: Create `backend/routers/continuation.py`**

```python
"""Continue Document endpoint — completes truncated/depth-collapsed outputs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.continuity import (
    build_continuation_prompt,
    generate_continuity_snapshot,
)
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.schemas import Iteration, PMInput
from promptmaster.session_context import _label_trigger
from routers._pipeline import build_iteration_with_full_pipeline

# Reuse the existing IterationFromConversationResponse shape from conversation.py
from routers.conversation import IterationFromConversationResponse

router = APIRouter(prefix="/api", tags=["continuation"])


class ContinueDocumentRequest(BaseModel):
    inputs: PMInput
    incomplete_iteration: Iteration
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


@router.post("/continue-document")
async def api_continue_document(
    req: ContinueDocumentRequest,
    client: OpenRouterClient = Depends(get_client),
) -> IterationFromConversationResponse:
    """Generate a snapshot, then continue from where the previous output trails off.

    Pipeline:
      1. Generate continuity snapshot (1 small generate_json call)
      2. Build continuation prompt with snapshot + previous output
      3. Generate continuation text (1 generate_with_meta call)
      4. Merge: new_output = previous_output + "\\n\\n" + continuation_text
      5. Run eval + suggestions + summary in parallel on merged output
      6. Return new iteration (trigger_source='continuation', continuity_snapshot attached)
    """
    try:
        model = req.model or None

        # Step 1: snapshot
        snapshot = await generate_continuity_snapshot(
            client=client,
            model=model,
            inputs=req.inputs,
            previous_output=req.incomplete_iteration.output,
        )

        # Step 2: build continuation prompt
        system_text, prompt_text = build_continuation_prompt(
            inputs=req.inputs,
            incomplete_iteration=req.incomplete_iteration,
            snapshot=snapshot,
            iterations=req.iteration_history,
        )

        # Step 3: generate continuation
        continuation_text, _usage, finish_reason = await client.generate_with_meta(
            prompt=prompt_text,
            system=system_text,
            model=model,
        )

        # Step 4: merge
        merged_output = req.incomplete_iteration.output.rstrip() + "\n\n" + continuation_text.lstrip()

        # Step 5: pipeline (eval + suggestions + summary in parallel; finish_reason override applied)
        iteration, suggestions = await build_iteration_with_full_pipeline(
            client=client,
            model=model,
            inputs=req.inputs,
            output=merged_output,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="continuation",
            active_iteration=req.incomplete_iteration,
            chat_history=[],
            iteration_history=req.iteration_history,
            user_action_label=_label_trigger("continuation"),
            finish_reason=finish_reason,
        )

        # Step 6: attach snapshot to the resulting iteration
        iteration = iteration.model_copy(update={"continuity_snapshot": snapshot})

        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Wire the router into `backend/main.py`**

Currently lines 49-55:

```python
from routers.meta import router as meta_router
from routers.engine import router as engine_router
from routers.conversation import router as conversation_router

app.include_router(meta_router)
app.include_router(engine_router)
app.include_router(conversation_router)
```

Replace with:

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

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_continuation_router.py -v
```
Expected: All 6 tests pass.

- [ ] **Step 6: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass. Total count should now be ~45.

- [ ] **Step 7: Verify backend imports cleanly**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -c "import main; print('ok')"
```
Expected: `ok`.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/continuation.py backend/main.py backend/tests/test_continuation_router.py
git commit -m "feat(backend): add /api/continue-document endpoint with snapshot + merge"
```

---

## Task 8: Frontend types — `CompletenessResult`, `ContinuitySnapshot`, request shape

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add the new types**

Find the `EvaluationResult` interface and replace with the version that has the optional `completeness` field:

```typescript
export interface CompletenessResult {
  status: 'complete' | 'incomplete';
  reason: string;
}

export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
  completeness?: CompletenessResult | null;
}
```

Find the `Iteration` interface and add `continuity_snapshot?` field:

```typescript
export interface ContinuitySnapshot {
  completed_topics: string[];
  current_topic: string | null;
  key_definitions: string[];
  next_topic_hint: string | null;
}

export interface Iteration {
  iteration_number: number;
  prompt_sent: string;
  system_prompt_used: string;
  output: string;
  mode: ModeType;
  evaluation: EvaluationResult | null;
  trigger_source?: string | null;
  user_rating?: UserRating | null;
  summary?: string | null;
  continuity_snapshot?: ContinuitySnapshot | null;
}
```

(Place `CompletenessResult` and `ContinuitySnapshot` interfaces before `EvaluationResult` and `Iteration` respectively, or anywhere consistent with the existing order — they're independent types.)

At the end of the file (alongside the other request/response interfaces from Project A), append:

```typescript
export interface ContinueDocumentRequest {
  inputs: PMInput;
  incomplete_iteration: Iteration;
  iteration_number: number;
  iteration_history?: Iteration[];
  model?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: build succeeds. (No new code consumes these types yet — they just have to compile.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add CompletenessResult, ContinuitySnapshot, ContinueDocumentRequest types"
```

---

## Task 9: API client — `api.continueDocument()`

**Files:**
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: Add the new method**

Update the imports at the top of `client.ts` to include `ContinueDocumentRequest`:

```typescript
import type {
  PMInput,
  AssembledPrompt,
  Iteration,
  EvaluationResult,
  ModeConfig,
  FlowTriggerType,
  FlowInspectType,
  FlowInspectResult,
  ChatMessage,
  ChatMessageRequest,
  ChatMessageResponse,
  ApplyToAnswerRequest,
  SaveAsNewVersionRequest,
  IterationFromConversationResponse,
  ContinueDocumentRequest,
} from '@/types';
```

After the existing `saveAsNewVersion` method and before `runSelfAudit`, insert:

```typescript
  async continueDocument(req: ContinueDocumentRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/continue-document', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add api.continueDocument method"
```

---

## Task 10: Zustand store — `continuationLoading`

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 1: Add new field and action**

In the `SessionState` interface, after `chatLoading: 'send' | 'apply' | 'save' | null;` and the related actions, add:

```typescript
  // Continue Document loading
  continuationLoading: boolean;
```

Add action signature alongside the chat actions:

```typescript
  setContinuationLoading: (b: boolean) => void;
```

In `initialState`, after `chatLoading: null as 'send' | 'apply' | 'save' | null,`, add:

```typescript
  continuationLoading: false,
```

In the store implementation (alongside `setChatLoading` etc), add:

```typescript
      setContinuationLoading: (continuationLoading) => set({ continuationLoading }),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add continuationLoading state to Zustand store"
```

---

## Task 11: EvalSection — render completeness pill

**Files:**
- Modify: `frontend/src/components/shared/eval-section.tsx`

- [ ] **Step 1: Inspect the current eval-section pattern**

```bash
cat frontend/src/components/shared/eval-section.tsx
```

Note how alignment / clarity / drift are rendered. The new completeness pill follows the same visual pattern.

- [ ] **Step 2: Add completeness rendering**

Find the rendering block where the three existing pills (alignment, drift, clarity) are rendered. After that block, add:

```tsx
{evaluation.completeness && (
  <div className="mt-3 flex items-start gap-2">
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
        evaluation.completeness.status === 'complete'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-amber-100 text-amber-800'
      }`}
    >
      Completeness: {evaluation.completeness.status === 'complete' ? 'Complete' : 'Incomplete'}
    </span>
    {evaluation.completeness.reason && (
      <p className="text-[11px] italic text-[var(--on-surface-variant)] flex-1">
        {evaluation.completeness.reason}
      </p>
    )}
  </div>
)}
```

The exact placement: after the existing pill row (the one showing alignment/drift/clarity), inside the same card so the pill renders below the others.

- [ ] **Step 3: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/eval-section.tsx
git commit -m "feat(frontend): render completeness pill in eval section"
```

---

## Task 12: Output phase — Continue Document card

**Files:**
- Modify: `frontend/src/components/phases/output-phase.tsx`

- [ ] **Step 1: Add imports**

The file already imports `useSessionStore` and `api`. No new imports needed beyond what's already there.

- [ ] **Step 2: Add the handler and state read**

Inside the `OutputPhase` component, add to the existing store reads (alongside `chatLoading`):

```typescript
const continuationLoading = useSessionStore((s) => s.continuationLoading);
const setContinuationLoading = useSessionStore((s) => s.setContinuationLoading);
```

Add to the `anyLoading` derivation:

```typescript
const anyLoading = realignLoading || refineLoading || flowLoading !== null || continuationLoading;
```

Add a new handler function alongside the other handlers (e.g., near `handleGenerateRealignment`):

```typescript
async function handleContinueDocument() {
  if (!currentIteration) return;
  setError(null);
  setContinuationLoading(true);
  try {
    const result = await api.continueDocument({
      inputs: buildInputs(),
      incomplete_iteration: currentIteration,
      iteration_number: iterations.length + 1,
      iteration_history: iterations,
      model,
    });
    appendIteration(result.iteration, result.suggestions);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Continue document failed.');
  } finally {
    setContinuationLoading(false);
  }
}
```

- [ ] **Step 3: Add the Continue Document card in JSX**

Find the JSX between the "Generated Output" card and the "Mode for next version" card. Insert the Continue Document card. The card must render only when `currentIteration?.evaluation?.completeness?.status === 'incomplete'`:

```tsx
{currentIteration?.evaluation?.completeness?.status === 'incomplete' && (
  <div className="bg-white rounded-xl shadow-ambient p-6 space-y-3 border-l-4 border-amber-400">
    <div>
      <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
        Continue Document
      </span>
      {currentIteration.evaluation.completeness.reason && (
        <p className="text-sm italic text-[var(--on-surface-variant)] mt-1">
          {currentIteration.evaluation.completeness.reason}
        </p>
      )}
    </div>
    <button
      type="button"
      onClick={handleContinueDocument}
      disabled={anyLoading}
      className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {continuationLoading ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Continuing…
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          Continue Document
        </>
      )}
    </button>
  </div>
)}
```

The exact placement: directly after the closing `</div>` of the Generated Output card and before the "Mode for next version" card. If there's a chat-bridge–removal–era comment marker, place it there.

- [ ] **Step 4: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/phases/output-phase.tsx
git commit -m "feat(frontend): add Continue Document card on output phase"
```

---

## Task 13: Final smoke verification

**Files:**
- (No file changes — verification only)

- [ ] **Step 1: Run full backend test suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass — total ~45.

- [ ] **Step 2: Run frontend build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Audit for lingering `any` / `unknown` in new code**

```bash
cd /root/code/PromptMaster && grep -rn ": any\|as any\|: unknown" \
  frontend/src/lib/api/client.ts \
  frontend/src/components/shared/eval-section.tsx \
  frontend/src/components/phases/output-phase.tsx \
  frontend/src/types/index.ts \
  backend/promptmaster/continuity.py \
  backend/routers/continuation.py \
  backend/routers/_pipeline.py
```
Expected: empty (no `any`/`unknown` introduced).

- [ ] **Step 4: Verify endpoint registration**

```bash
cd /root/code/PromptMaster && grep -n "include_router\|from routers" backend/main.py
```
Expected: 4 routers registered — meta, engine, conversation, continuation.

- [ ] **Step 5: Manual end-to-end smoke (in browser)**

Bring up the app locally (`npm run dev`, backend `uvicorn main:app`). Walk through:

1. Start a new session. Set an objective likely to produce a long structured output (e.g. *"Write a complete Business Requirements Document with 15 sections covering scope, stakeholders, goals, success metrics, constraints, risks, timelines, and roles."*).
2. Generate. The model will likely either hit max_tokens or be judged INCOMPLETE.
3. Confirm the eval card shows a fourth pill: **Completeness: Incomplete** with a reason line.
4. Confirm the **Continue Document** card appears between the Output card and the Mode card, with the reason and a primary button.
5. Click **Continue Document**. Watch the spinner.
6. New iteration appears. Active version auto-advances. The merged output is longer than the previous. Eval reflects the merged document.
7. If the new iteration is also incomplete, click Continue again — it should work the same way.
8. Confirm the chat panel auto-switches to the new iteration with empty chat (per Project A's per-version chat rule).

- [ ] **Step 6: Final commit if any tweaks needed**

If smoke testing surfaced issues, fix and commit. If everything works:

```bash
git status
```
Expected: clean working tree.

- [ ] **Step 7: Tag the work**

```bash
git log --oneline -20
```
Confirm the commit graph reflects the full Project B scope.

---

## Self-Review Checklist

- ✅ **Spec coverage:** every section of the design spec maps to at least one task above (schemas → 1; LLM client → 2; evaluator → 3; pipeline helper + trigger label → 4; engine wiring → 5; continuity module → 6; continuation router → 7; frontend types/api/store/UI → 8-12; smoke → 13).
- ✅ **No placeholders:** every step has exact paths, full code, and exact commands with expected output.
- ✅ **Type consistency:** `CompletenessResult`, `ContinuitySnapshot`, `ContinueDocumentRequest`, `IterationFromConversationResponse`, `force_incomplete_on_length`, `build_iteration_with_full_pipeline`, `generate_with_meta`, `generate_continuity_snapshot`, `build_continuation_prompt`, `build_snapshot_prompt`, `_label_trigger("continuation")` all spelled the same way across tasks.
- ✅ **Frequent commits:** every task ends with a commit step.
- ✅ **TDD where it pays:** all backend modules with logic (schemas, llm_client, evaluator, continuity, continuation router) ship with tests written first.
- ✅ **Frontend verification** falls back to `npm run build` (no test infra) but type strictness is enforced via the audit step.
- ✅ **Backwards compatibility:** old saved sessions parse cleanly (optional fields with `None` defaults) — see Task 1 tests `test_evaluation_result_completeness_optional_for_back_compat` and `test_iteration_continuity_snapshot_defaults_none`.

---

## Out of Scope (deferred to Project C / D specs)

- Smart Setup (input-phase redesign) — Project C
- "Why this works" interpretation, Audit→Action — Project D
- Auto-continuation, context compression, document-type picker, telemetry — future specs
