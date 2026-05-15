# Output Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plain-language "Why this works" interpretation above the eval, turn Self-Audit into an actionable findings panel with Apply/Dismiss, and refresh the 8-step tutorial into a 9-step tour of the post-A/B/C UI with auto-expand of collapsed targets.

**Architecture:** "Why this works" folds into the existing eval LLM call as a 5th optional field (zero new LLM calls). Audit→Action ships two new endpoints — `POST /api/audit-findings` (1 LLM call, returns structured findings) and `POST /api/apply-audit` (4 LLM calls, full pipeline). The frontend gains a `WhyThisWorksCard`, an `AuditFindingsPanel` with checkbox rows, three new store fields, and a rewritten `tutorial-steps.ts` plus a small `tutorial-overlay` extension for `expandTarget` callbacks.

**Tech Stack:** Python 3.x + FastAPI + Pydantic 2 + pytest on backend; Next.js 16 + Zustand + Tailwind v4 + Material Symbols on frontend.

**Source spec:** `docs/superpowers/specs/2026-05-15-output-polish-design.md`

---

## Pre-flight

No SQL migration. All Project D changes ride along the existing JSONB session save path via two new optional fields (`EvaluationResult.interpretation`) and three new transient store fields (`auditFindings`, `auditLoading`, `applyAuditLoading`).

---

## Task 1: Backend schemas — `WhyThisWorks`, `AuditFinding`, extend `EvaluationResult`, add trigger label

**Files:**
- Modify: `backend/promptmaster/schemas.py`
- Modify: `backend/promptmaster/session_context.py` (add trigger label)
- Test: `backend/tests/test_schemas.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_schemas.py`:

```python
from promptmaster.schemas import WhyThisWorks, AuditFinding


def test_why_this_works_round_trip_positive():
    w = WhyThisWorks(label="Why this works", bullets=["Matches your goal", "Clear structure", "Stayed focused"])
    payload = w.model_dump()
    restored = WhyThisWorks(**payload)
    assert restored.label == "Why this works"
    assert len(restored.bullets) == 3


def test_why_this_works_round_trip_negative():
    w = WhyThisWorks(label="What to improve", bullets=["Misses one section", "Vague in places"])
    assert w.label == "What to improve"
    assert restored_via_dump_then_parse(w).bullets == w.bullets


def restored_via_dump_then_parse(w: WhyThisWorks) -> WhyThisWorks:
    return WhyThisWorks(**w.model_dump())


def test_why_this_works_rejects_invalid_label():
    with pytest.raises(Exception):
        WhyThisWorks(label="Maybe works", bullets=[])  # type: ignore[arg-type]


def test_why_this_works_bullets_default_empty():
    w = WhyThisWorks(label="Why this works")
    assert w.bullets == []


def test_evaluation_result_interpretation_optional_for_back_compat():
    from promptmaster.schemas import EvaluationResult
    legacy_payload = {
        "alignment": {"score": "High", "explanation": "."},
        "drift": {"score": "Low", "explanation": "."},
        "clarity": {"score": "High", "explanation": "."},
    }
    er = EvaluationResult(**legacy_payload)
    assert er.interpretation is None


def test_evaluation_result_with_interpretation():
    from promptmaster.schemas import EvaluationResult, DimensionScore
    er = EvaluationResult(
        alignment=DimensionScore(score="High", explanation="."),
        drift=DimensionScore(score="Low", explanation="."),
        clarity=DimensionScore(score="High", explanation="."),
        interpretation=WhyThisWorks(label="Why this works", bullets=["a", "b"]),
    )
    assert er.interpretation is not None
    assert er.interpretation.label == "Why this works"


def test_audit_finding_round_trip():
    f = AuditFinding(
        id="f1",
        category="Coverage",
        summary="Missing a mitigation plan",
        suggested_change="Add a section on risk mitigation",
    )
    payload = f.model_dump()
    restored = AuditFinding(**payload)
    assert restored.id == "f1"
    assert restored.category == "Coverage"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: ImportError on `WhyThisWorks` / `AuditFinding`.

- [ ] **Step 3: Add new schemas in `backend/promptmaster/schemas.py`**

Append at the end of the file:

```python
class WhyThisWorks(BaseModel):
    """Plain-language interpretation of an output's eval.

    Label flips between 'Why this works' (positive framing) and
    'What to improve' (negative framing) based on the LLM's overall judgment.
    """
    label: Literal["Why this works", "What to improve"]
    bullets: list[str] = Field(default_factory=list, description="3-4 short bullets in plain English.")


class AuditFinding(BaseModel):
    """One actionable audit finding produced by /api/audit-findings."""
    id: str = Field(..., description="Unique within a findings list.")
    category: str = Field(..., description="Short tag, e.g., 'Coverage', 'Clarity', 'Tone'.")
    summary: str = Field(..., description="One line — what's wrong.")
    suggested_change: str = Field(..., description="One line — what to do about it.")
```

Update `EvaluationResult` to add the `interpretation` field. Replace the existing class with:

```python
class EvaluationResult(BaseModel):
    """Result from the evaluator LLM call."""
    alignment: DimensionScore = Field(..., description="Does output match the stated objective?")
    drift: DimensionScore = Field(..., description="Does output introduce irrelevant content?")
    clarity: DimensionScore = Field(..., description="Is the output structured and unambiguous?")
    completeness: CompletenessResult | None = Field(
        default=None,
        description="Structural completeness — set by extended eval call. Optional for backward compat.",
    )
    interpretation: WhyThisWorks | None = Field(
        default=None,
        description="Plain-language 3-4 bullet summary of why the output works or what to improve.",
    )

    @property
    def needs_realignment(self) -> bool:
        """Realignment triggers if Alignment < Medium OR Drift > Medium."""
        return self.alignment.score == "Low" or self.drift.score == "High"
```

- [ ] **Step 4: Add `applied_audit` trigger label in `backend/promptmaster/session_context.py`**

Find `_TRIGGER_LABELS` (around lines 13-29). Add the new entry — full updated dict:

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
    "conversation": "Conversation follow-up",
    "apply_conversation": "Applied chat to answer",
    "refined_from_conversation": "New version from chat",
    "continuation": "Continued document",
    "applied_audit": "Applied audit findings",
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_schemas.py -v
```
Expected: All 7 new tests pass; existing schema tests still pass.

- [ ] **Step 6: Run full backend suite for regression check**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/promptmaster/schemas.py backend/promptmaster/session_context.py backend/tests/test_schemas.py
git commit -m "feat(backend): add WhyThisWorks, AuditFinding schemas + applied_audit trigger"
```

---

## Task 2: Extend evaluator to produce `interpretation`

**Files:**
- Modify: `backend/promptmaster/evaluator.py`
- Test: `backend/tests/test_evaluator_interpretation.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_evaluator_interpretation.py`:

```python
"""Tests for the extended evaluator that produces a plain-language interpretation."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.evaluator import EVALUATOR_PROMPT, evaluate_output
from promptmaster.schemas import EvaluationResult


def test_evaluator_prompt_asks_for_interpretation():
    rendered = EVALUATOR_PROMPT.format(
        objective="x",
        audience="y",
        constraints="z",
        output_format="lists",
        mode="architect",
        output="some output",
        session_history="(none)",
    )
    assert "interpretation" in rendered.lower()
    assert "Why this works" in rendered or "why this works" in rendered.lower()
    assert "What to improve" in rendered or "what to improve" in rendered.lower()


@pytest.mark.asyncio
async def test_evaluate_output_parses_interpretation_when_present(basic_inputs):
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "High", "explanation": "On topic."},
        "drift": {"score": "Low", "explanation": "Focused."},
        "clarity": {"score": "High", "explanation": "Clear."},
        "completeness": {"status": "complete", "reason": ""},
        "interpretation": {
            "label": "Why this works",
            "bullets": [
                "Matches your goal directly",
                "Clear structure throughout",
                "Stayed focused on the objective",
            ],
        },
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result: EvaluationResult = await evaluate_output(
        client=client, inputs=basic_inputs, output="some output"
    )
    assert result.interpretation is not None
    assert result.interpretation.label == "Why this works"
    assert len(result.interpretation.bullets) == 3


@pytest.mark.asyncio
async def test_evaluate_output_handles_missing_interpretation_gracefully(basic_inputs):
    """When the LLM omits interpretation, eval result still parses with interpretation=None."""
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
    assert result.interpretation is None


@pytest.mark.asyncio
async def test_evaluate_output_handles_invalid_interpretation_gracefully(basic_inputs):
    """When LLM returns malformed interpretation, set to None instead of crashing."""
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "High", "explanation": "."},
        "drift": {"score": "Low", "explanation": "."},
        "clarity": {"score": "High", "explanation": "."},
        "interpretation": {"label": "Vibes only", "bullets": ["x"]},  # invalid label
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result = await evaluate_output(
        client=client, inputs=basic_inputs, output="some output"
    )
    assert result.alignment.score == "High"
    assert result.interpretation is None


@pytest.mark.asyncio
async def test_evaluate_output_handles_negative_interpretation(basic_inputs):
    """'What to improve' label is also valid and parses correctly."""
    client = AsyncMock()
    fake_eval_json = {
        "alignment": {"score": "Medium", "explanation": "."},
        "drift": {"score": "High", "explanation": "."},
        "clarity": {"score": "Low", "explanation": "."},
        "interpretation": {
            "label": "What to improve",
            "bullets": ["Misses key aspects", "Wandered off-topic", "Could be clearer"],
        },
    }
    client.generate_json = AsyncMock(return_value=(fake_eval_json, {}))

    result = await evaluate_output(
        client=client, inputs=basic_inputs, output="x"
    )
    assert result.interpretation is not None
    assert result.interpretation.label == "What to improve"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_evaluator_interpretation.py -v
```
Expected: First test fails because prompt doesn't mention interpretation; others fail because eval doesn't parse the new field.

- [ ] **Step 3: Update `backend/promptmaster/evaluator.py`**

Update imports — add `WhyThisWorks`:

```python
from .schemas import PMInput, EvaluationResult, DimensionScore, Iteration, CompletenessResult, WhyThisWorks
```

Replace the `EVALUATOR_PROMPT` constant in full:

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

Evaluate along five dimensions. For the first three, assign "Low", "Medium", or "High" and provide exactly one sentence of explanation.

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
   - If INCOMPLETE, name in one short sentence WHERE it stops or what's missing.

5. INTERPRETATION: In 3-4 short bullets, plain English (no technical jargon), explain why this output succeeds OR what to improve.
   - Use the label "Why this works" when the output is strong overall (alignment High, drift Low, clarity High).
   - Use the label "What to improve" when there's a clear weakness in any dimension.
   - bullets[0]: one short sentence (≤10 words) about the goal/alignment.
   - bullets[1]: one short sentence about structure/clarity.
   - bullets[2]: one short sentence about focus/drift.
   - bullets[3] (optional): one short sentence about completeness or another standout property.
   - Each bullet should be self-contained — readable without the others.

Return JSON in exactly this format:
{{
    "alignment": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "drift": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "clarity": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "completeness": {{"status": "complete|incomplete", "reason": "one short sentence (empty string if complete)"}},
    "interpretation": {{
        "label": "Why this works|What to improve",
        "bullets": ["...", "...", "..."]
    }}
}}"""
```

Replace the `evaluate_output` function — extend the result-building block to defensively parse `interpretation`. Find the existing try/except block and replace with:

```python
    try:
        result_dict, _usage = await client.generate_json(
            prompt=prompt,
            system=EVALUATOR_SYSTEM,
            temperature=0.15,
            max_tokens=768,
            model=model,
        )

        # Parse completeness defensively
        completeness: CompletenessResult | None = None
        comp_raw = result_dict.get("completeness")
        if isinstance(comp_raw, dict):
            try:
                completeness = CompletenessResult(**comp_raw)
            except Exception as comp_err:
                logger.warning(f"Invalid completeness in eval response, dropping: {comp_err}")

        # Parse interpretation defensively
        interpretation: WhyThisWorks | None = None
        interp_raw = result_dict.get("interpretation")
        if isinstance(interp_raw, dict):
            try:
                interpretation = WhyThisWorks(**interp_raw)
            except Exception as interp_err:
                logger.warning(f"Invalid interpretation in eval response, dropping: {interp_err}")

        return EvaluationResult(
            alignment=DimensionScore(**result_dict.get("alignment", {"score": "Medium", "explanation": "Unable to evaluate"})),
            drift=DimensionScore(**result_dict.get("drift", {"score": "Medium", "explanation": "Unable to evaluate"})),
            clarity=DimensionScore(**result_dict.get("clarity", {"score": "Medium", "explanation": "Unable to evaluate"})),
            completeness=completeness,
            interpretation=interpretation,
        )
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        return EvaluationResult(
            alignment=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            drift=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            clarity=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            completeness=None,
            interpretation=None,
        )
```

Note: `max_tokens=768` (up from 512) gives the LLM enough room for the additional interpretation bullets.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_evaluator_interpretation.py -v
```
Expected: All 5 tests pass.

- [ ] **Step 5: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all tests pass (~82 = 75 prior + 7 schema + 5 interpretation, minus a small overlap).

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/evaluator.py backend/tests/test_evaluator_interpretation.py
git commit -m "feat(backend): extend evaluator with plain-language interpretation field"
```

---

## Task 3: Audit findings module — `backend/promptmaster/audit_findings.py`

**Files:**
- Create: `backend/promptmaster/audit_findings.py`
- Test: `backend/tests/test_audit_findings.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_audit_findings.py`:

```python
"""Tests for the audit findings prompt builders and generator."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.audit_findings import (
    AUDIT_FINDINGS_SYSTEM,
    build_audit_findings_prompt,
    build_apply_audit_prompt,
    generate_audit_findings,
)
from promptmaster.schemas import AuditFinding


# --- audit findings prompt ---

def test_audit_findings_prompt_includes_objective_and_output(basic_inputs):
    system, user = build_audit_findings_prompt(
        inputs=basic_inputs,
        current_output="Here is a 5-step plan. ...",
        iterations=[],
    )
    assert basic_inputs.objective in user
    assert "Here is a 5-step plan" in user


def test_audit_findings_prompt_asks_for_structured_findings(basic_inputs):
    _, user = build_audit_findings_prompt(
        inputs=basic_inputs,
        current_output="x",
        iterations=[],
    )
    for field in ("id", "category", "summary", "suggested_change"):
        assert field in user


def test_audit_findings_system_uses_cold_critic_framing():
    """Audit should be tough — Cold Critic style — not soft."""
    lower = AUDIT_FINDINGS_SYSTEM.lower()
    # Must instruct rigor, not encouragement
    assert any(word in lower for word in ("rigor", "blunt", "critic", "specific"))


def test_audit_findings_prompt_caps_count():
    """LLM must be told to surface only the 3-7 most impactful findings."""
    _, user = build_audit_findings_prompt(
        inputs={"objective": "x"},  # type: ignore[arg-type]
        current_output="x",
        iterations=[],
    ) if False else build_audit_findings_prompt(  # use real fixture path
        inputs=PMInput_from_fixture(),
        current_output="x",
        iterations=[],
    )
    assert "7" in user or "seven" in user.lower()


def PMInput_from_fixture():
    """Helper to avoid pytest fixture in helper test."""
    from promptmaster.schemas import PMInput
    return PMInput(
        objective="Plan a launch",
        audience="General",
        constraints="",
        output_format="",
        mode="architect",
    )


# --- generate audit findings ---

@pytest.mark.asyncio
async def test_generate_audit_findings_returns_list(basic_inputs):
    client = AsyncMock()
    fake_json = {
        "findings": [
            {"id": "f1", "category": "Coverage", "summary": "Missing risks", "suggested_change": "Add a risk section"},
            {"id": "f2", "category": "Clarity", "summary": "Steps are vague", "suggested_change": "Add concrete examples to each step"},
        ]
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert len(findings) == 2
    assert isinstance(findings[0], AuditFinding)
    assert findings[0].category == "Coverage"
    client.generate_json.assert_called_once()


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_missing_findings_key(basic_inputs):
    """When LLM forgets the 'findings' envelope, return empty list."""
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=({}, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert findings == []


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_malformed_finding(basic_inputs):
    """Skip individual malformed findings rather than failing the whole call."""
    client = AsyncMock()
    fake_json = {
        "findings": [
            {"id": "f1", "category": "Coverage", "summary": "Good one", "suggested_change": "Do this"},
            {"summary": "Missing fields"},  # missing id, category, suggested_change
            {"id": "f3", "category": "Tone", "summary": "Another good one", "suggested_change": "Soften wording"},
        ]
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    # Malformed one is dropped; good ones survive
    assert len(findings) == 2
    assert findings[0].id == "f1"
    assert findings[1].id == "f3"


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_llm_exception(basic_inputs):
    """If the LLM call raises, return empty list (no crash)."""
    client = AsyncMock()
    client.generate_json = AsyncMock(side_effect=RuntimeError("boom"))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert findings == []


# --- apply audit prompt ---

def test_apply_audit_prompt_includes_original_output_and_findings(basic_inputs, basic_iteration):
    findings = [
        AuditFinding(id="f1", category="Coverage", summary="Missing risks", suggested_change="Add a risk section"),
        AuditFinding(id="f2", category="Clarity", summary="Vague steps", suggested_change="Add examples"),
    ]
    system, user = build_apply_audit_prompt(
        inputs=basic_inputs,
        source_iteration=basic_iteration,
        findings=findings,
        iterations=[basic_iteration],
    )
    # Previous output appears
    assert basic_iteration.output in user
    # All findings appear
    assert "Missing risks" in user
    assert "Add a risk section" in user
    assert "Vague steps" in user


def test_apply_audit_prompt_instructs_to_preserve_objective(basic_inputs, basic_iteration):
    system, user = build_apply_audit_prompt(
        inputs=basic_inputs,
        source_iteration=basic_iteration,
        findings=[],
        iterations=[],
    )
    # System or user prompt should remind the LLM to keep alignment
    combined = (system + user).lower()
    assert "objective" in combined and "align" in combined
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_audit_findings.py -v
```
Expected: ImportError on `promptmaster.audit_findings`.

- [ ] **Step 3: Create `backend/promptmaster/audit_findings.py`**

```python
"""Audit findings — structured-critique LLM helpers.

Used by /api/audit-findings (produces a list of actionable findings the user
can apply) and /api/apply-audit (revises the output to address selected
findings). Both endpoints live in routers/audit.py.
"""

from __future__ import annotations

import logging
import uuid

from .conversation import _shared_system
from .llm_client import OpenRouterClient
from .schemas import AuditFinding, Iteration, PMInput
from .session_context import format_session_history

logger = logging.getLogger(__name__)


AUDIT_FINDINGS_SYSTEM = (
    "You are the audit layer of PromptMaster, operating in Cold Critic mode. "
    "Your job is to identify the most impactful, specific, actionable improvements "
    "to an AI-generated answer. You are blunt but fair. No sugarcoating. No "
    "praise. Each finding must be concrete enough that the user can act on it.\n\n"
    "Surface only the 3-7 most impactful findings. Fewer if there genuinely are no "
    "more meaningful issues. Each finding has:\n"
    "- id: unique short string (e.g., 'f1', 'f2')\n"
    "- category: short tag like 'Coverage', 'Clarity', 'Tone', 'Logic gap', 'Specificity'\n"
    "- summary: one short sentence describing what's wrong\n"
    "- suggested_change: one short sentence describing what to do about it\n\n"
    "Return JSON only with shape: { \"findings\": [ ... ] }."
)


def build_audit_findings_prompt(
    inputs: PMInput,
    current_output: str,
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompts for the audit-findings LLM call."""
    system = AUDIT_FINDINGS_SYSTEM
    history = format_session_history(iterations)
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"Session history:\n{history}\n\n"
        f"--- CURRENT OUTPUT TO AUDIT ---\n{current_output}\n--- END ---\n\n"
        "Identify the 3-7 most impactful findings. Return JSON in this shape:\n"
        "{\n"
        '  "findings": [\n'
        '    {"id": "f1", "category": "...", "summary": "...", "suggested_change": "..."},\n'
        "    ...\n"
        "  ]\n"
        "}"
    )
    return system, user


async def generate_audit_findings(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    current_output: str,
    iterations: list[Iteration],
) -> list[AuditFinding]:
    """Run the audit-findings LLM call. Returns parsed findings (defensive)."""
    system, user = build_audit_findings_prompt(inputs, current_output, iterations)
    try:
        result, _usage = await client.generate_json(
            prompt=user,
            system=system,
            temperature=0.2,
            max_tokens=1024,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Audit findings LLM call failed: {e}")
        return []

    raw_list = result.get("findings")
    if not isinstance(raw_list, list):
        return []

    findings: list[AuditFinding] = []
    for raw in raw_list:
        if not isinstance(raw, dict):
            continue
        # Ensure ID is present — fall back to a generated one if the LLM omitted it
        if not raw.get("id"):
            raw["id"] = f"f{uuid.uuid4().hex[:6]}"
        try:
            findings.append(AuditFinding(**raw))
        except Exception as parse_err:
            logger.warning(f"Skipping malformed audit finding: {parse_err}")
    return findings


_APPLY_AUDIT_INSTRUCTION = (
    "APPLY-AUDIT MODE: The user audited the previous output and selected specific "
    "findings to address. Produce a revised version of the answer that addresses "
    "each finding listed below, while preserving alignment with the original "
    "objective and constraints. Keep the structure and length appropriate to the "
    "objective. Output only the revised answer text."
)


def _format_findings_block(findings: list[AuditFinding]) -> str:
    if not findings:
        return "(no findings selected)"
    lines = []
    for f in findings:
        lines.append(f"- [{f.category}] {f.summary} → {f.suggested_change}")
    return "\n".join(lines)


def build_apply_audit_prompt(
    inputs: PMInput,
    source_iteration: Iteration,
    findings: list[AuditFinding],
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompts for the apply-audit LLM call."""
    system = _shared_system(inputs, iterations, _APPLY_AUDIT_INSTRUCTION)
    findings_block = _format_findings_block(findings)
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"PREVIOUS OUTPUT (revise this — do not repeat verbatim):\n"
        f"{source_iteration.output}\n\n"
        f"FINDINGS TO ADDRESS:\n{findings_block}\n\n"
        "Produce a revised version of the answer that addresses each finding "
        "while preserving alignment with the original objective. Output only "
        "the revised answer text."
    )
    return system, user
```

- [ ] **Step 4: Run tests**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_audit_findings.py -v
```
Expected: All 9 tests pass.

- [ ] **Step 5: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: ~91 total.

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/audit_findings.py backend/tests/test_audit_findings.py
git commit -m "feat(backend): add audit_findings module — Cold Critic structured findings"
```

---

## Task 4: Audit router — `/api/audit-findings` and `/api/apply-audit`

**Files:**
- Create: `backend/routers/audit.py`
- Modify: `backend/main.py` (router registration block)
- Test: `backend/tests/test_audit_router.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_audit_router.py`:

```python
"""Smoke and behavior tests for the Audit router."""

import inspect
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from main import app
from deps import get_client
from routers import audit as audit_router_module


# --- request/response shape ---

def test_audit_findings_request_has_required_fields():
    fields = audit_router_module.AuditFindingsRequest.model_fields
    for required in ("inputs", "current_output", "iteration_history", "model"):
        assert required in fields, f"missing field: {required}"


def test_audit_findings_response_has_findings_envelope():
    fields = audit_router_module.AuditFindingsResponse.model_fields
    assert "findings" in fields


def test_apply_audit_request_has_required_fields():
    fields = audit_router_module.ApplyAuditRequest.model_fields
    for required in (
        "inputs", "source_iteration", "findings",
        "iteration_number", "iteration_history", "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_router_registers_both_endpoints():
    paths = [r.path for r in audit_router_module.router.routes]
    assert "/api/audit-findings" in paths
    assert "/api/apply-audit" in paths


def test_audit_findings_endpoint_uses_generator():
    src = inspect.getsource(audit_router_module.api_audit_findings)
    assert "generate_audit_findings" in src


def test_apply_audit_endpoint_uses_prompt_builder_and_pipeline():
    src = inspect.getsource(audit_router_module.api_apply_audit)
    assert "build_apply_audit_prompt" in src
    assert "build_iteration_with_full_pipeline" in src


def test_apply_audit_uses_applied_audit_trigger_source():
    src = inspect.getsource(audit_router_module.api_apply_audit)
    assert "applied_audit" in src


# --- behavior tests (TestClient + mocked LLM) ---

def test_audit_findings_endpoint_returns_findings_envelope_end_to_end():
    """Full request -> endpoint -> generate_audit_findings -> response."""
    fake_client = AsyncMock()
    fake_client.generate_json = AsyncMock(return_value=(
        {"findings": [
            {"id": "f1", "category": "Coverage", "summary": "Missing risks", "suggested_change": "Add risks section"},
            {"id": "f2", "category": "Clarity", "summary": "Vague steps", "suggested_change": "Add examples"},
        ]},
        {},
    ))

    app.dependency_overrides[get_client] = lambda: fake_client
    try:
        client = TestClient(app)
        response = client.post(
            "/api/audit-findings",
            json={
                "inputs": {
                    "objective": "Plan a launch",
                    "audience": "General",
                    "constraints": "",
                    "output_format": "",
                    "mode": "architect",
                    "session_facts": [],
                },
                "current_output": "Here is a plan...",
                "iteration_history": [],
                "model": "",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert "findings" in body
        assert len(body["findings"]) == 2
        assert body["findings"][0]["category"] == "Coverage"
    finally:
        app.dependency_overrides.clear()


def test_audit_findings_endpoint_returns_empty_list_when_llm_fails():
    """When the LLM raises, endpoint returns 200 with empty findings (not 502)."""
    fake_client = AsyncMock()
    fake_client.generate_json = AsyncMock(side_effect=RuntimeError("boom"))

    app.dependency_overrides[get_client] = lambda: fake_client
    try:
        client = TestClient(app)
        response = client.post(
            "/api/audit-findings",
            json={
                "inputs": {
                    "objective": "x",
                    "audience": "General",
                    "constraints": "",
                    "output_format": "",
                    "mode": "architect",
                    "session_facts": [],
                },
                "current_output": "x",
            },
        )
        assert response.status_code == 200
        assert response.json()["findings"] == []
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_audit_router.py -v
```
Expected: ImportError on `routers.audit`.

- [ ] **Step 3: Create `backend/routers/audit.py`**

```python
"""Audit → Action endpoints — produce structured findings, apply selected ones."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.audit_findings import (
    build_apply_audit_prompt,
    generate_audit_findings,
)
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.schemas import AuditFinding, Iteration, PMInput
from promptmaster.session_context import _label_trigger
from routers._pipeline import build_iteration_with_full_pipeline

# Reuse the existing IterationFromConversationResponse shape from conversation.py
from routers.conversation import IterationFromConversationResponse

router = APIRouter(prefix="/api", tags=["audit"])


# --- Request / Response models ---

class AuditFindingsRequest(BaseModel):
    inputs: PMInput
    current_output: str
    iteration_history: list[Iteration] = []
    model: str = ""


class AuditFindingsResponse(BaseModel):
    findings: list[AuditFinding]


class ApplyAuditRequest(BaseModel):
    inputs: PMInput
    source_iteration: Iteration
    findings: list[AuditFinding]
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


# --- Endpoints ---

@router.post("/audit-findings")
async def api_audit_findings(
    req: AuditFindingsRequest,
    client: OpenRouterClient = Depends(get_client),
) -> AuditFindingsResponse:
    """Run the audit and return structured findings. 1 LLM call.

    Empty list on LLM failure or malformed response (graceful degrade).
    """
    try:
        findings = await generate_audit_findings(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            current_output=req.current_output,
            iterations=req.iteration_history,
        )
        return AuditFindingsResponse(findings=findings)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/apply-audit")
async def api_apply_audit(
    req: ApplyAuditRequest,
    client: OpenRouterClient = Depends(get_client),
) -> IterationFromConversationResponse:
    """Apply selected audit findings → new iteration. 4 LLM calls (1 + 3 parallel)."""
    try:
        model = req.model or None
        system_text, prompt_text = build_apply_audit_prompt(
            inputs=req.inputs,
            source_iteration=req.source_iteration,
            findings=req.findings,
            iterations=req.iteration_history,
        )

        # Generation
        revised_output, _usage, finish_reason = await client.generate_with_meta(
            prompt=prompt_text,
            system=system_text,
            model=model,
        )

        # Pipeline: eval + suggestions + summary in parallel; finish_reason override
        iteration, suggestions = await build_iteration_with_full_pipeline(
            client=client,
            model=model,
            inputs=req.inputs,
            output=revised_output,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="applied_audit",
            active_iteration=req.source_iteration,
            chat_history=[],
            iteration_history=req.iteration_history,
            user_action_label=_label_trigger("applied_audit"),
            finish_reason=finish_reason,
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Wire the router into `backend/main.py`**

Find the router-registration block (currently 5 routers after Project C). Add the audit router. Full updated block:

```python
from routers.meta import router as meta_router
from routers.engine import router as engine_router
from routers.conversation import router as conversation_router
from routers.continuation import router as continuation_router
from routers.setup import router as setup_router
from routers.audit import router as audit_router

app.include_router(meta_router)
app.include_router(engine_router)
app.include_router(conversation_router)
app.include_router(continuation_router)
app.include_router(setup_router)
app.include_router(audit_router)
```

- [ ] **Step 5: Run tests**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest tests/test_audit_router.py -v
```
Expected: All 9 tests pass (7 source-inspection + 2 behavior).

- [ ] **Step 6: Verify backend imports cleanly**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -c "import main; print('ok')"
```
Expected: `ok`.

- [ ] **Step 7: Run full backend suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/audit.py backend/main.py backend/tests/test_audit_router.py
git commit -m "feat(backend): add /api/audit-findings and /api/apply-audit endpoints"
```

---

## Task 5: Remove `self_audit` from `engine.py` diagnostic branch (small)

**Files:**
- Modify: `backend/routers/engine.py`

`self_audit` is no longer a flow-trigger diagnostic — clicking Self-Audit on the Output phase now goes through `/api/audit-findings` instead. We update the `is_diagnostic` check so an accidental call with `trigger='self_audit'` still works the old way (preserving backward compat for any external callers or old session replays), but the canonical path moves to the new endpoint. This is the safer choice — we don't break existing iterations that have `trigger_source='self_audit'`, and we don't break any external script.

**Decision:** keep the `self_audit` branch in `is_diagnostic` as-is for backward compat. No code change in `engine.py` for this task. Just remove the Self-Audit *frontend button* from calling `flowTrigger('self_audit')` — that happens in Task 10.

- [ ] **Step 1: Verify** by reading the file

```bash
grep -n "is_diagnostic\|self_audit" /root/code/PromptMaster/backend/routers/engine.py
```
Confirm `is_diagnostic = req.trigger in ("challenge", "self_audit", "reframe")` stays — old saved sessions can still replay.

(No code change. No commit. This is a documentation task: the audit-router takes over the user-visible path, but the engine.py diagnostic branch is preserved as a legacy path.)

---

## Task 6: Frontend types — `WhyThisWorks`, `AuditFinding`, requests/responses

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Append new types**

At the end of `frontend/src/types/index.ts`, append:

```typescript
// --- Output Polish types ---

export interface WhyThisWorks {
  label: 'Why this works' | 'What to improve';
  bullets: string[];
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

Update the existing `EvaluationResult` interface to add the optional `interpretation` field. Find:

```typescript
export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
  completeness?: CompletenessResult | null;
}
```

Replace with:

```typescript
export interface EvaluationResult {
  alignment: DimensionScore;
  drift: DimensionScore;
  clarity: DimensionScore;
  completeness?: CompletenessResult | null;
  interpretation?: WhyThisWorks | null;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add WhyThisWorks, AuditFinding types + interpretation field"
```

---

## Task 7: API client — `auditFindings` + `applyAudit`

**Files:**
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: Update imports**

Add to the existing `import type { ... } from '@/types';` block at the top of `client.ts`:

```typescript
  AuditFindingsRequest,
  AuditFindingsResponse,
  ApplyAuditRequest,
```

- [ ] **Step 2: Add the two methods**

Inside the `api` object, after `generateSetup` (or any convenient spot), insert:

```typescript
  async auditFindings(req: AuditFindingsRequest): Promise<AuditFindingsResponse> {
    return apiFetch('/api/audit-findings', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async applyAudit(req: ApplyAuditRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/apply-audit', {
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
git commit -m "feat(frontend): add api.auditFindings and api.applyAudit methods"
```

---

## Task 8: Zustand store — `auditFindings`, `auditLoading`, `applyAuditLoading`

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 1: Add `AuditFinding` to type imports**

Update the existing import block:

```typescript
import type {
  Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult,
  Session, UserRating, ChatMessage, SetupSuggestion, AuditFinding,
} from '@/types';
```

- [ ] **Step 2: Add new state fields and action signatures to `SessionState` interface**

Add to the state-fields block alongside `continuationLoading` and `setupLoading`:

```typescript
  // Audit → Action
  auditFindings: AuditFinding[] | null;
  auditLoading: boolean;
  applyAuditLoading: boolean;
```

Add action signatures alongside other related setters:

```typescript
  setAuditFindings: (f: AuditFinding[] | null) => void;
  setAuditLoading: (b: boolean) => void;
  setApplyAuditLoading: (b: boolean) => void;
```

- [ ] **Step 3: Add to `initialState`**

In the `initialState` object, after `setupError: null as string | null,`, add:

```typescript
  auditFindings: null as AuditFinding[] | null,
  auditLoading: false,
  applyAuditLoading: false,
```

- [ ] **Step 4: Implement the actions**

Inside the store implementation block, after `setSetupError`, add:

```typescript
      setAuditFindings: (auditFindings) => set({ auditFindings }),
      setAuditLoading: (auditLoading) => set({ auditLoading }),
      setApplyAuditLoading: (applyAuditLoading) => set({ applyAuditLoading }),
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add audit findings state + loading flags to Zustand store"
```

---

## Task 9: `WhyThisWorksCard` component

**Files:**
- Create: `frontend/src/components/output/why-this-works-card.tsx`

Note: the directory `frontend/src/components/output/` may already exist or may need creating. Create it if needed.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import type { WhyThisWorks } from '@/types';

interface WhyThisWorksCardProps {
  interpretation: WhyThisWorks;
}

export function WhyThisWorksCard({ interpretation }: WhyThisWorksCardProps) {
  const isPositive = interpretation.label === 'Why this works';
  const accentClass = isPositive
    ? 'border-emerald-400 bg-emerald-50/30'
    : 'border-amber-400 bg-amber-50/30';
  const iconName = isPositive ? 'check_circle' : 'auto_fix_high';
  const iconColor = isPositive ? 'text-emerald-600' : 'text-amber-700';

  return (
    <div
      data-tutorial="why-this-works"
      className={`bg-white rounded-2xl shadow-ambient p-6 border-l-4 ${accentClass}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>
          {iconName}
        </span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
          {interpretation.label}
        </h3>
      </div>
      <ul className="space-y-2">
        {interpretation.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--on-surface)] leading-relaxed">
            <span className={`material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0 ${iconColor}`}>
              {isPositive ? 'check' : 'edit'}
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
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
git add frontend/src/components/output/why-this-works-card.tsx
git commit -m "feat(frontend): add WhyThisWorksCard component"
```

---

## Task 10: `AuditFindingsPanel` + `AuditFindingRow` components

**Files:**
- Create: `frontend/src/components/output/audit-finding-row.tsx`
- Create: `frontend/src/components/output/audit-findings-panel.tsx`

- [ ] **Step 1: Create `audit-finding-row.tsx`**

```tsx
'use client';

import type { AuditFinding } from '@/types';

interface AuditFindingRowProps {
  finding: AuditFinding;
  checked: boolean;
  onToggle: () => void;
}

export function AuditFindingRow({ finding, checked, onToggle }: AuditFindingRowProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        checked ? 'bg-white' : 'bg-[var(--surface-container-low)] opacity-60'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-[var(--outline-variant)] text-[var(--pm-primary)] focus:ring-[var(--pm-primary)]/40 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[var(--pm-primary-container)]/20 text-[var(--pm-primary)]">
            {finding.category}
          </span>
          <span className="text-sm font-semibold text-[var(--on-surface)]">
            {finding.summary}
          </span>
        </div>
        <p className="text-[12px] italic text-[var(--on-surface-variant)] leading-relaxed">
          {finding.suggested_change}
        </p>
      </div>
    </label>
  );
}
```

- [ ] **Step 2: Create `audit-findings-panel.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { AuditFinding } from '@/types';
import { AuditFindingRow } from './audit-finding-row';

interface AuditFindingsPanelProps {
  findings: AuditFinding[];
  loading: 'apply' | null;
  onApply: (selectedFindingIds: string[]) => void;
  onDismiss: () => void;
}

export function AuditFindingsPanel({
  findings,
  loading,
  onApply,
  onDismiss,
}: AuditFindingsPanelProps) {
  // Default: all checked
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    findings.forEach((f) => { init[f.id] = true; });
    return init;
  });

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selectedIds = useMemo(
    () => findings.filter((f) => checked[f.id]).map((f) => f.id),
    [findings, checked]
  );

  const noneChecked = selectedIds.length === 0;
  const applyDisabled = loading !== null || noneChecked;
  const applyTooltip = noneChecked ? 'At least one finding must be checked.' : undefined;

  if (findings.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-ambient p-6 border-l-4 border-emerald-400">
        <p className="text-sm text-[var(--on-surface)]">No issues found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
          Audit findings
        </h3>
        <p className="text-[11px] italic text-[var(--on-surface-variant)] mt-0.5">
          Pick which fixes to apply, then click Apply.
        </p>
      </div>

      <div className="space-y-2">
        {findings.map((f) => (
          <AuditFindingRow
            key={f.id}
            finding={f}
            checked={!!checked[f.id]}
            onToggle={() => toggle(f.id)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => onApply(selectedIds)}
          disabled={applyDisabled}
          title={applyTooltip}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'apply' ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Applying…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
              Apply
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading !== null}
          className="px-4 py-2.5 text-xs font-semibold text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Dismiss
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
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/output/audit-finding-row.tsx frontend/src/components/output/audit-findings-panel.tsx
git commit -m "feat(frontend): add AuditFindingsPanel and AuditFindingRow components"
```

---

## Task 11: Wire new components into `output-phase.tsx`

**Files:**
- Modify: `frontend/src/components/phases/output-phase.tsx`

This task does four things:
1. Render `WhyThisWorksCard` above the existing `EvalSection`.
2. Render `AuditFindingsPanel` between the Generated Output card and the Continue Document card / Mode card.
3. Replace the Self-Audit Flow Trigger handler with a new one that calls `/api/audit-findings`.
4. Extend `anyLoading` to include `auditLoading` and `applyAuditLoading`.

- [ ] **Step 1: Add imports**

At the top of `frontend/src/components/phases/output-phase.tsx`, add:

```typescript
import { WhyThisWorksCard } from '@/components/output/why-this-works-card';
import { AuditFindingsPanel } from '@/components/output/audit-findings-panel';
```

- [ ] **Step 2: Add store reads**

Alongside the existing audit-related store reads (if any) and continuation-related reads:

```typescript
const auditFindings = useSessionStore((s) => s.auditFindings);
const auditLoading = useSessionStore((s) => s.auditLoading);
const applyAuditLoading = useSessionStore((s) => s.applyAuditLoading);
const setAuditFindings = useSessionStore((s) => s.setAuditFindings);
const setAuditLoading = useSessionStore((s) => s.setAuditLoading);
const setApplyAuditLoading = useSessionStore((s) => s.setApplyAuditLoading);
```

- [ ] **Step 3: Extend `anyLoading`**

Find the current `anyLoading` derivation (after Project B and C this is `realignLoading || refineLoading || flowLoading !== null || continuationLoading || chatLoading !== null`). Update to:

```typescript
const anyLoading =
  realignLoading ||
  refineLoading ||
  flowLoading !== null ||
  continuationLoading ||
  chatLoading !== null ||
  auditLoading ||
  applyAuditLoading;
```

- [ ] **Step 4: Add `handleAuditFindings` and `handleApplyAudit` handlers**

Alongside the other handlers in the component body, add:

```typescript
async function handleAuditFindings() {
  if (!currentOutput) return;
  setError(null);
  setAuditLoading(true);
  try {
    const res = await api.auditFindings({
      inputs: buildInputs(),
      current_output: currentOutput,
      iteration_history: iterations,
      model,
    });
    setAuditFindings(res.findings);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Audit failed.');
  } finally {
    setAuditLoading(false);
  }
}

async function handleApplyAudit(selectedIds: string[]) {
  if (!currentIteration || !auditFindings) return;
  setError(null);
  setApplyAuditLoading(true);
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

- [ ] **Step 5: Replace the Self-Audit Flow Trigger button's onClick**

Find the existing Self-Audit Flow Trigger button (it's the one with `onClick={() => handleFlowTrigger('self_audit')}` and the `fact_check` icon). Replace its `onClick` and loading-state check:

```tsx
{/* Self-Audit — now produces structured findings, not a critique iteration */}
<button
  type="button"
  onClick={handleAuditFindings}
  disabled={anyLoading || !currentOutput}
  data-tutorial="self-audit"
  title="Audit this answer and surface fixes you can apply"
  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 text-xs font-semibold text-[var(--on-surface)] rounded-lg hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
>
  {auditLoading ? (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
  ) : (
    <span className="material-symbols-outlined text-[16px]">fact_check</span>
  )}
  Self-Audit
</button>
```

The new `data-tutorial="self-audit"` attribute makes this button a target for the refreshed tutorial in Task 13.

- [ ] **Step 6: Render `AuditFindingsPanel` and `WhyThisWorksCard`**

Below the Generated Output card and above the Mode card, after any existing Continue Document card (Project B), add:

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

Find where `EvalSection` is rendered (e.g., `{currentEval && <EvalSection evaluation={currentEval} />}`). Render `WhyThisWorksCard` immediately above it:

```tsx
{currentIteration?.evaluation?.interpretation && (
  <WhyThisWorksCard interpretation={currentIteration.evaluation.interpretation} />
)}
{currentEval && <EvalSection evaluation={currentEval} />}
```

- [ ] **Step 7: Add `data-tutorial="output-card"` to the Generated Output card**

Find the existing Generated Output wrapper element (the card containing the `MarkdownOutput`). Add `data-tutorial="output-card"`. The exact element is the one that matches `<div className="bg-white rounded-xl shadow-ambient p-8">` enclosing the output content.

- [ ] **Step 8: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/phases/output-phase.tsx
git commit -m "refactor(frontend): wire WhyThisWorks + AuditFindingsPanel into output phase"
```

---

## Task 12: Add `data-tutorial` attributes on new anchors across components

**Files:**
- Modify: `frontend/src/components/input/hero-zone.tsx`
- Modify: `frontend/src/components/input/setup-summary-bar.tsx`
- Modify: `frontend/src/components/input/advanced-section.tsx`
- Modify: `frontend/src/components/phases/input-phase.tsx`
- Modify: `frontend/src/components/chat/chat-panel.tsx`

The refreshed tutorial in Task 13 anchors steps via `data-tutorial="<key>"`. Some new components don't have these attributes yet. We add them now.

- [ ] **Step 1: `hero-zone.tsx`** — add `data-tutorial="hero-objective"` to the textarea, and `data-tutorial="generate-setup"` to the Generate Setup button.

Find the `<textarea>` for the objective. Update its props:

```tsx
<textarea
  data-tutorial="hero-objective"
  value={objective}
  ...
/>
```

Find the Generate Setup `<button>`. Update its props:

```tsx
<button
  data-tutorial="generate-setup"
  type="button"
  onClick={onGenerateSetup}
  ...
>
```

- [ ] **Step 2: `setup-summary-bar.tsx`** — add `data-tutorial="recommended-approach"` to the outer card element.

Find the outermost `<div className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]">` and add:

```tsx
<div
  data-tutorial="recommended-approach"
  className="bg-white rounded-2xl shadow-ambient p-6 space-y-4 border-l-4 border-[var(--pm-primary)]"
>
```

- [ ] **Step 3: `advanced-section.tsx`** — add `data-tutorial="advanced-section"` to the `<details>` element.

Find the `<details>` element. Update its props:

```tsx
<details
  data-tutorial="advanced-section"
  className="bg-white rounded-2xl shadow-ambient overflow-hidden group"
>
```

- [ ] **Step 4: `input-phase.tsx`** — add `data-tutorial="continue-review"` to the Continue to Review button.

Find the Continue to Review `<button>` near the bottom of `input-phase.tsx`. Update its props:

```tsx
<button
  data-tutorial="continue-review"
  type="button"
  onClick={handleAssemble}
  ...
>
```

- [ ] **Step 5: `chat-panel.tsx`** — add `data-tutorial="chat-panel"` to the `<aside>` root.

Find the `<aside>` root of the chat panel. Update its props:

```tsx
<aside
  data-tutorial="chat-panel"
  className="hidden md:flex fixed ..."
>
```

(The output-phase added `data-tutorial="output-card"`, `data-tutorial="self-audit"`, and `data-tutorial="why-this-works"` already in Task 11. So we have all 9 anchors covered.)

- [ ] **Step 6: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/input frontend/src/components/chat/chat-panel.tsx frontend/src/components/phases/input-phase.tsx
git commit -m "feat(frontend): add data-tutorial anchors on new Smart Setup + chat surfaces"
```

---

## Task 13: Refresh tutorial steps + add `expandTarget` capability

**Files:**
- Modify: `frontend/src/components/tutorial/tutorial-steps.ts` (replace step list)
- Modify: `frontend/src/components/tutorial/tutorial-overlay.tsx` (add optional `expandTarget` to TutorialStep type + invoke it on step entry)
- Modify: `frontend/src/components/tutorial/tutorial-provider.tsx` (ensure overlay still receives the steps)

- [ ] **Step 1: Read the existing tutorial structure to confirm shape**

```bash
cat /root/code/PromptMaster/frontend/src/components/tutorial/tutorial-overlay.tsx | head -40
```

Note the existing `TutorialStep` type definition. It probably has `target`, `title`, `description`, `position`. We add an optional `expandTarget?: () => void` callback.

- [ ] **Step 2: Update `TutorialStep` type in `tutorial-overlay.tsx`**

Find the existing `TutorialStep` interface (or type) and add the optional callback:

```typescript
export interface TutorialStep {
  target: string;   // CSS selector
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  expandTarget?: () => void;   // NEW — called before locating the anchor
}
```

In the overlay's step-transition logic (the effect or function that runs when the current step changes), invoke `expandTarget` before locating the anchor. Find the `useEffect` (or equivalent) that reads `steps[currentStep].target` and runs `document.querySelector(...)`. Wrap it:

```typescript
useEffect(() => {
  const step = steps[currentStep];
  if (!step) return;

  // Run any expand-target side effect BEFORE locating the anchor
  step.expandTarget?.();

  // Small delay so CSS transitions for expanding elements settle
  const t = setTimeout(() => {
    // existing logic: locate target element, position overlay, etc.
    // ...
  }, step.expandTarget ? 200 : 0);

  return () => clearTimeout(t);
}, [currentStep, steps]);
```

(Adjust to the actual existing structure — the key change is the optional `expandTarget` call + a small timeout when one is defined.)

- [ ] **Step 3: Replace `frontend/src/components/tutorial/tutorial-steps.ts`**

```typescript
import type { TutorialStep } from './tutorial-overlay';
import { useSessionStore } from '@/stores/session-store';

/**
 * Helper: open any collapsed ancestor of the target element.
 *
 * Used by tutorial steps whose anchors live inside <details> blocks or the
 * chat panel (which is conditionally rendered when chatPanelOpen=true).
 */
function expandDetailsElement(selector: string) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(selector);
  if (!el) return;
  // Walk up to the nearest <details> ancestor and open it
  let cur: HTMLElement | null = el as HTMLElement;
  while (cur) {
    if (cur.tagName.toLowerCase() === 'details') {
      (cur as HTMLDetailsElement).open = true;
      break;
    }
    cur = cur.parentElement;
  }
}

function openChatPanel() {
  // The chat panel is conditionally rendered when chatPanelOpen is true.
  // Directly write to the store from outside React — Zustand allows this.
  useSessionStore.getState().setChatPanelOpen(true);
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: '[data-tutorial="hero-objective"]',
    title: 'Start with your goal',
    description: 'Describe what you want to do or figure out. The system builds the rest from here.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="generate-setup"]',
    title: 'Let the system suggest',
    description: 'Click Generate Setup and the system recommends a mode, audience, constraints, and format from your objective.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="recommended-approach"]',
    title: 'Refine if you want',
    description: 'Click any chip to refine. Each shows what was picked and why. After Generate Setup runs, this card appears above the input.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="advanced-section"]',
    title: 'Full controls live here',
    description: 'Open Advanced any time for direct control over mode, constraints, format, and more.',
    position: 'top',
    expandTarget: () => expandDetailsElement('[data-tutorial="advanced-section"]'),
  },
  {
    target: '[data-tutorial="continue-review"]',
    title: 'Continue to Review',
    description: 'Once you are happy with the setup, continue to review the assembled prompt before running it.',
    position: 'top',
  },
  {
    target: '[data-tutorial="output-card"]',
    title: 'Your generated answer',
    description: 'This is the structured output. Use the buttons below to iterate, chat, or apply fixes.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="chat-panel"]',
    title: 'Chat about it',
    description: 'The chat panel lets you ask follow-ups without affecting your version. Apply or Save as new version when you have something useful.',
    position: 'left',
    expandTarget: openChatPanel,
  },
  {
    target: '[data-tutorial="why-this-works"]',
    title: 'Why this works',
    description: 'This card translates the technical eval into plain language — a quick read on what is strong or weak.',
    position: 'top',
  },
  {
    target: '[data-tutorial="self-audit"]',
    title: 'Self-Audit → Apply',
    description: 'Click Self-Audit and the system surfaces specific fixes you can apply directly.',
    position: 'top',
  },
];
```

- [ ] **Step 4: Verify build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 5: Manual smoke (skip if dev server isn't running)**

Optional but valuable: run `npm run dev`, trigger the tutorial replay (sidebar), and walk through each step. Confirm each step's anchor element is visible (no broken spotlights), and that step 4 auto-opens the Advanced accordion and step 7 auto-opens the chat panel.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/tutorial
git commit -m "feat(frontend): refresh tutorial steps for post-A/B/C UI with expand-on-target"
```

---

## Task 14: Final smoke verification

**Files:**
- (No file changes — verification only.)

- [ ] **Step 1: Run full backend test suite**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -v
```
Expected: ~95 total tests pass (75 prior + 7 schemas + 5 interpretation + 9 audit findings + 9 audit router).

- [ ] **Step 2: Run frontend build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Audit for `any` / `unknown` in new code**

```bash
cd /root/code/PromptMaster && grep -rn ": any\|as any\|: unknown" \
  frontend/src/components/output \
  frontend/src/lib/api/client.ts \
  frontend/src/components/tutorial \
  backend/promptmaster/audit_findings.py \
  backend/routers/audit.py
```
Expected: empty output.

- [ ] **Step 4: Verify endpoint registration**

```bash
cd /root/code/PromptMaster && grep -n "include_router\|from routers" backend/main.py
```
Expected: 6 routers (meta, engine, conversation, continuation, setup, audit).

- [ ] **Step 5: Verify all 9 tutorial anchors exist in the DOM**

Static grep — confirm every `data-tutorial` value referenced in `tutorial-steps.ts` is also set somewhere in the components tree:

```bash
cd /root/code/PromptMaster/frontend && for anchor in hero-objective generate-setup recommended-approach advanced-section continue-review output-card chat-panel why-this-works self-audit; do
  echo "anchor: $anchor"
  grep -rn "data-tutorial=\"$anchor\"" src --include='*.tsx' | head -1
done
```

Expected: every anchor produces a match.

- [ ] **Step 6: Manual end-to-end smoke**

Bring up local app. Walk through:

1. Start a new session. Generate an output via Smart Setup → Continue to Review → Execute.
2. Confirm the **Why this works** (or **What to improve**) card renders above the eval card, with the right label and 3-4 bullets.
3. Click **Self-Audit** in the Flow Triggers row. Confirm the **Audit findings** panel appears between the Generated Output card and the Mode card, with 3-7 rows. Each row has a checkbox, category chip, summary, suggested-change italic line.
4. Uncheck one finding. Click **Apply**. Confirm the panel disappears, a new iteration appears with `trigger_source='applied_audit'` (you can verify via the version-history row's label), with full eval / suggestions / summary / why-this-works.
5. Click Self-Audit again. Click **Dismiss** without applying. Panel disappears. No iteration created.
6. Replay the tutorial (sidebar). Walk through all 9 steps. Step 4 should auto-open the Advanced section if it was closed. Step 7 should auto-open the chat panel if it was closed. No broken spotlights (overlay should anchor to a visible element for each step).

- [ ] **Step 7: Final commit if any tweaks needed**

If smoke testing surfaced issues, fix and commit. If everything works:

```bash
git status
```
Expected: clean working tree.

- [ ] **Step 8: Tag the work**

```bash
git log --oneline -25
```
Confirm the commit graph reflects the full Project D scope.

---

## Self-Review Checklist

- ✅ **Spec coverage:** every section maps to at least one task (schemas → 1; evaluator → 2; audit module → 3; audit router → 4; engine.py legacy preservation → 5; frontend types → 6; api client → 7; store → 8; WhyThisWorksCard → 9; AuditFindingsPanel → 10; output-phase wiring → 11; data-tutorial anchors → 12; tutorial refresh → 13; smoke → 14).
- ✅ **No placeholders:** every step has exact paths and complete code blocks.
- ✅ **Type consistency:** `WhyThisWorks`, `AuditFinding`, `AuditFindingsRequest`, `AuditFindingsResponse`, `ApplyAuditRequest`, `auditFindings`, `auditLoading`, `applyAuditLoading`, `setAuditFindings`, `setAuditLoading`, `setApplyAuditLoading`, `handleAuditFindings`, `handleApplyAudit`, `expandTarget` all spelled the same across tasks.
- ✅ **Frequent commits:** every task ends with a commit step.
- ✅ **TDD on backend** for the parts that have logic worth testing (schemas, evaluator, audit_findings module, audit router). Behavior tests with TestClient for the router. Frontend uses `npm run build` for type safety + manual smoke.
- ✅ **Backward compatibility:** `interpretation` is `Optional` on `EvaluationResult` with `None` default — old saved sessions parse cleanly. `applied_audit` is added to `_TRIGGER_LABELS` so new continuation iterations render correctly. Legacy `self_audit` trigger label and is_diagnostic branch preserved so old iterations replay correctly.

---

## Out of Scope (deferred)

- Custom modes (user-defined personas) — future Project E.
- Apply pattern extended to Suggestions list — Suggestions stay text.
- Summary-phase audit (`/api/run-self-audit`) — unchanged.
- Highlighting which part of the output a finding targets — Option C from Q4 was rejected as over-engineered.
- Tutorial step branching by user role — single linear tour stays.
