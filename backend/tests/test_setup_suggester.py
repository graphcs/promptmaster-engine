"""Tests for the Smart Setup suggestion LLM helper."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.setup_suggester import (
    SETUP_SUGGESTER_SYSTEM,
    build_setup_prompt,
    suggest_setup,
)
from promptmaster.schemas import SetupSuggestion


def test_build_setup_prompt_includes_objective():
    prompt = build_setup_prompt(objective="Plan a launch strategy")
    assert "Plan a launch strategy" in prompt


def test_build_setup_prompt_asks_for_all_five_fields():
    prompt = build_setup_prompt(objective="x")
    for field in ("mode", "audience", "constraints", "output_format", "rationale"):
        assert field in prompt


def test_setup_suggester_system_lists_available_modes():
    for mode in (
        "architect", "critic", "clarity", "coach",
        "therapist", "cold_critic", "analyst",
    ):
        assert mode in SETUP_SUGGESTER_SYSTEM


def test_setup_suggester_system_excludes_custom_mode():
    """Smart Setup must not recommend the 'custom' mode."""
    lower = SETUP_SUGGESTER_SYSTEM.lower()
    assert "custom" in lower
    assert "do not recommend" in lower or "do not suggest" in lower


@pytest.mark.asyncio
async def test_suggest_setup_returns_parsed_suggestion():
    client = AsyncMock()
    fake_json = {
        "mode": "architect",
        "audience": "Engineering Leads",
        "constraints": "Two-week timeline",
        "output_format": "Numbered list",
        "rationale": {
            "mode": "Best for structured plans",
            "audience": "Matches the framing",
            "constraints": "Adds a deadline",
            "output_format": "Scannable structure",
        },
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="Plan a launch")
    assert isinstance(result, SetupSuggestion)
    assert result.mode == "architect"
    assert result.audience == "Engineering Leads"
    assert result.rationale.mode == "Best for structured plans"
    client.generate_json.assert_called_once()


@pytest.mark.asyncio
async def test_suggest_setup_falls_back_to_architect_on_invalid_mode():
    """Defensive parsing: unknown mode -> architect."""
    client = AsyncMock()
    fake_json = {
        "mode": "nonsense_mode",
        "audience": "General",
        "constraints": "",
        "output_format": "",
        "rationale": {},
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="x")
    assert result.mode == "architect"


@pytest.mark.asyncio
async def test_suggest_setup_handles_missing_optional_fields():
    """Defensive parsing: missing audience/constraints/format/rationale all default."""
    client = AsyncMock()
    fake_json = {"mode": "architect"}
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    result = await suggest_setup(client=client, model=None, objective="x")
    assert result.mode == "architect"
    assert result.audience == "General"
    assert result.constraints == ""
    assert result.output_format == ""
    assert result.rationale.mode == ""
