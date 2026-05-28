"""Tests for long-form schemas and prompt builders."""
from __future__ import annotations

import pytest

from promptmaster.schemas import (
    DetectLongFormResponse,
    GenerateOutlineResponse,
    GenerateSectionResponse,
    LongFormState,
    OutlineSection,
)


def test_outline_section_defaults():
    section = OutlineSection(id="s1", title="Intro", abstract="Sets the stage.")
    assert section.status == "pending"
    assert section.content == ""
    assert section.revision == 0
    assert section.finish_reason is None
    assert section.error is None
    assert section.generated_at is None


def test_outline_section_all_fields_roundtrip():
    section = OutlineSection(
        id="s1",
        title="Body",
        abstract="The middle of the document.",
        status="complete",
        content="Generated prose here.",
        revision=2,
        finish_reason="stop",
        error=None,
        generated_at="2026-05-28T10:00:00Z",
    )
    assert section.model_dump()["status"] == "complete"
    assert OutlineSection(**section.model_dump()) == section


def test_long_form_state_defaults():
    state = LongFormState(state="outlining", started_at="2026-05-28T10:00:00Z")
    assert state.current_section_index == -1
    assert state.outline == []
    assert state.continuity_snapshot is None
    assert state.completed_at is None


def test_detect_response_required_fields():
    r = DetectLongFormResponse(is_long_form=True, suggested_section_count=10, reason="...")
    assert r.is_long_form is True
    assert r.suggested_section_count == 10


def test_generate_outline_response_holds_sections():
    r = GenerateOutlineResponse(outline=[
        OutlineSection(id="s1", title="A", abstract="a"),
        OutlineSection(id="s2", title="B", abstract="b"),
    ])
    assert len(r.outline) == 2


def test_generate_section_response_shape():
    from promptmaster.schemas import ContinuitySnapshot
    r = GenerateSectionResponse(
        content="prose",
        finish_reason="stop",
        new_snapshot=ContinuitySnapshot(),
    )
    assert r.finish_reason == "stop"
    assert r.new_snapshot is not None
