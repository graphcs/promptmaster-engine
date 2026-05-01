"""Verify rating signals propagate into chat / apply / save prompts.

format_session_history adds an explicit instruction to the LLM about user
ratings whenever any iteration in the list is rated. These tests ensure the
new conversation prompt builders include session history in their system
prompts (and therefore that ratings flow through).
"""

from promptmaster.conversation import (
    build_apply_to_answer_prompt,
    build_chat_reply_prompt,
    build_save_as_new_version_prompt,
)
from promptmaster.schemas import (
    DimensionScore,
    EvaluationResult,
    Iteration,
)


def _rated_iter(rating: str = "positive") -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="An answer the user liked.",
        mode="architect",
        evaluation=EvaluationResult(
            alignment=DimensionScore(score="High", explanation="."),
            clarity=DimensionScore(score="High", explanation="."),
            drift=DimensionScore(score="Low", explanation="."),
        ),
        user_rating=rating,
    )


def test_chat_reply_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("positive")
    system, _ = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        user_message="Hi",
        iterations=[rated],
    )
    assert "STRONG" in system or "rated" in system.lower()


def test_apply_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("negative")
    system, _ = build_apply_to_answer_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        iterations=[rated],
    )
    assert "POOR" in system or "rated" in system.lower()


def test_save_as_new_version_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("positive")
    system, _ = build_save_as_new_version_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        iterations=[rated],
    )
    assert "STRONG" in system or "rated" in system.lower()
