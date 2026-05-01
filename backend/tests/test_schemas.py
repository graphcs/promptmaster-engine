"""Tests for new schema fields and chat message shape."""

import pytest

from promptmaster.schemas import ChatMessage, Iteration


def test_iteration_summary_defaults_none():
    iter = Iteration(
        iteration_number=1,
        prompt_sent="x",
        system_prompt_used="y",
        output="z",
        mode="architect",
    )
    assert iter.summary is None


def test_iteration_accepts_summary_string():
    iter = Iteration(
        iteration_number=2,
        prompt_sent="x",
        system_prompt_used="y",
        output="z",
        mode="architect",
        summary="Refined the answer to be more concrete.",
    )
    assert "concrete" in iter.summary


def test_chat_message_round_trips():
    msg = ChatMessage(
        id="abc-123",
        iteration_number=2,
        role="user",
        content="Why did you choose that approach?",
        created_at="2026-05-01T10:00:00Z",
    )
    payload = msg.model_dump()
    restored = ChatMessage(**payload)
    assert restored.role == "user"
    assert restored.iteration_number == 2


def test_chat_message_rejects_invalid_role():
    with pytest.raises(Exception):
        ChatMessage(
            id="x",
            iteration_number=1,
            role="system",  # type: ignore[arg-type]
            content="...",
            created_at="2026-05-01T10:00:00Z",
        )
