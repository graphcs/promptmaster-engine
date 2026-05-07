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
