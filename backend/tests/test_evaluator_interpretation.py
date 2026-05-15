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
