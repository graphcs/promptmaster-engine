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


from promptmaster.schemas import SetupRationale, SetupSuggestion


def test_setup_rationale_defaults_to_empty_strings():
    r = SetupRationale()
    assert r.mode == ""
    assert r.audience == ""
    assert r.constraints == ""
    assert r.output_format == ""


def test_setup_suggestion_round_trip():
    s = SetupSuggestion(
        mode="architect",
        audience="Engineering Leads",
        constraints="Two-week timeline",
        output_format="Numbered list",
        rationale=SetupRationale(
            mode="Best fit for structured plans",
            audience="Matches the problem framing",
            constraints="Adds a deadline anchor",
            output_format="Clear and scannable",
        ),
    )
    payload = s.model_dump()
    restored = SetupSuggestion(**payload)
    assert restored.mode == "architect"
    assert restored.rationale.mode == "Best fit for structured plans"


def test_setup_suggestion_rejects_unknown_mode():
    with pytest.raises(Exception):
        SetupSuggestion(
            mode="nonsense",  # type: ignore[arg-type]
            audience="General",
            constraints="",
            output_format="",
        )


def test_setup_suggestion_rationale_defaults_to_empty():
    s = SetupSuggestion(
        mode="architect",
        audience="General",
        constraints="",
        output_format="",
    )
    assert s.rationale.mode == ""
