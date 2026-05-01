"""Tests for the iteration-summary generator."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.schemas import (
    ChatMessage,
    DimensionScore,
    EvaluationResult,
    Iteration,
    PMInput,
)
from promptmaster.summaries import build_summary_prompt, generate_summary


@pytest.fixture
def prev_iter(basic_inputs: PMInput) -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="Original launch plan with three steps.",
        mode="architect",
        evaluation=EvaluationResult(
            alignment=DimensionScore(score="Medium", explanation="OK."),
            clarity=DimensionScore(score="Medium", explanation="OK."),
            drift=DimensionScore(score="Low", explanation="Focused."),
        ),
    )


@pytest.fixture
def new_iter(basic_inputs: PMInput) -> Iteration:
    return Iteration(
        iteration_number=2,
        prompt_sent="...",
        system_prompt_used="...",
        output="Refined launch plan: five concrete steps with metrics.",
        mode="architect",
    )


def test_summary_prompt_includes_objective(basic_inputs, prev_iter, new_iter):
    system, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert basic_inputs.objective in user


def test_summary_prompt_includes_outputs(basic_inputs, prev_iter, new_iter):
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert prev_iter.output in user
    assert new_iter.output in user


def test_summary_prompt_includes_user_action(basic_inputs, prev_iter, new_iter):
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Refine: more concrete",
    )
    assert "more concrete" in user


def test_summary_prompt_includes_chat_history(basic_inputs, prev_iter, new_iter):
    chat = [
        ChatMessage(id="1", iteration_number=1, role="user", content="Make it shorter.", created_at="t"),
        ChatMessage(id="2", iteration_number=1, role="assistant", content="Sure, 3 steps.", created_at="t"),
    ]
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=chat,
        user_action="Apply to answer",
    )
    assert "Make it shorter" in user


@pytest.mark.asyncio
async def test_generate_summary_calls_client_and_returns_text(
    basic_inputs, prev_iter, new_iter
):
    client = AsyncMock()
    client.generate = AsyncMock(return_value=("Made the plan more concrete with metrics.", {}))
    result = await generate_summary(
        client=client,
        model=None,
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert "concrete" in result
    client.generate.assert_called_once()
