"""Shared pytest fixtures."""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from promptmaster.schemas import (
    DimensionScore,
    EvaluationResult,
    Iteration,
    PMInput,
)


@pytest.fixture
def basic_inputs() -> PMInput:
    """A valid PMInput for tests that need a default."""
    return PMInput(
        objective="Plan a launch strategy for an internal tool.",
        audience="Engineering leads",
        constraints="Two-week timeline",
        output_format="Numbered list",
        mode="architect",
    )


@pytest.fixture
def good_evaluation() -> EvaluationResult:
    return EvaluationResult(
        alignment=DimensionScore(score="High", explanation="Aligned."),
        clarity=DimensionScore(score="High", explanation="Clear."),
        drift=DimensionScore(score="Low", explanation="Focused."),
    )


@pytest.fixture
def basic_iteration(basic_inputs: PMInput, good_evaluation: EvaluationResult) -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="A concrete launch plan with five steps.",
        mode=basic_inputs.mode,
        evaluation=good_evaluation,
        trigger_source="initial",
    )


@pytest.fixture
def mock_client() -> AsyncMock:
    """Mock OpenRouterClient. Default: chat() returns a deterministic string."""
    client = AsyncMock()
    client.chat = AsyncMock(return_value="MOCK_LLM_REPLY")
    return client


@pytest.fixture
def llm_replies() -> dict[str, Any]:
    """Helper for tests that need to control multiple sequential LLM responses."""
    return {"queue": []}
