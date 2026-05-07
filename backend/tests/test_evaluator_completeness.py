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
