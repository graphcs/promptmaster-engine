"""Tests for the audit findings prompt builders and generator."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.audit_findings import (
    AUDIT_FINDINGS_SYSTEM,
    build_audit_findings_prompt,
    build_apply_audit_prompt,
    generate_audit_findings,
)
from promptmaster.schemas import AuditFinding


# --- audit findings prompt ---

def test_audit_findings_prompt_includes_objective_and_output(basic_inputs):
    system, user = build_audit_findings_prompt(
        inputs=basic_inputs,
        current_output="Here is a 5-step plan. ...",
        iterations=[],
    )
    assert basic_inputs.objective in user
    assert "Here is a 5-step plan" in user


def test_audit_findings_prompt_asks_for_structured_findings(basic_inputs):
    _, user = build_audit_findings_prompt(
        inputs=basic_inputs,
        current_output="x",
        iterations=[],
    )
    for field in ("id", "category", "summary", "suggested_change"):
        assert field in user


def test_audit_findings_system_uses_cold_critic_framing():
    """Audit should be tough — Cold Critic style — not soft."""
    lower = AUDIT_FINDINGS_SYSTEM.lower()
    # Must instruct rigor, not encouragement
    assert any(word in lower for word in ("rigor", "blunt", "critic", "specific"))


def test_audit_findings_prompt_caps_count(basic_inputs):
    """LLM must be told to surface only the 3-7 most impactful findings."""
    _, user = build_audit_findings_prompt(
        inputs=basic_inputs,
        current_output="x",
        iterations=[],
    )
    assert "7" in user or "seven" in user.lower()


# --- generate audit findings ---

@pytest.mark.asyncio
async def test_generate_audit_findings_returns_list(basic_inputs):
    client = AsyncMock()
    fake_json = {
        "findings": [
            {"id": "f1", "category": "Coverage", "summary": "Missing risks", "suggested_change": "Add a risk section"},
            {"id": "f2", "category": "Clarity", "summary": "Steps are vague", "suggested_change": "Add concrete examples to each step"},
        ]
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert len(findings) == 2
    assert isinstance(findings[0], AuditFinding)
    assert findings[0].category == "Coverage"
    client.generate_json.assert_called_once()


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_missing_findings_key(basic_inputs):
    """When LLM forgets the 'findings' envelope, return empty list."""
    client = AsyncMock()
    client.generate_json = AsyncMock(return_value=({}, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert findings == []


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_malformed_finding(basic_inputs):
    """Skip individual malformed findings rather than failing the whole call."""
    client = AsyncMock()
    fake_json = {
        "findings": [
            {"id": "f1", "category": "Coverage", "summary": "Good one", "suggested_change": "Do this"},
            {"summary": "Missing fields"},  # missing id, category, suggested_change
            {"id": "f3", "category": "Tone", "summary": "Another good one", "suggested_change": "Soften wording"},
        ]
    }
    client.generate_json = AsyncMock(return_value=(fake_json, {}))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    # Malformed one is dropped; good ones survive
    assert len(findings) == 2
    assert findings[0].id == "f1"
    assert findings[1].id == "f3"


@pytest.mark.asyncio
async def test_generate_audit_findings_handles_llm_exception(basic_inputs):
    """If the LLM call raises, return empty list (no crash)."""
    client = AsyncMock()
    client.generate_json = AsyncMock(side_effect=RuntimeError("boom"))

    findings = await generate_audit_findings(
        client=client, model=None, inputs=basic_inputs, current_output="...", iterations=[]
    )
    assert findings == []


# --- apply audit prompt ---

def test_apply_audit_prompt_includes_original_output_and_findings(basic_inputs, basic_iteration):
    findings = [
        AuditFinding(id="f1", category="Coverage", summary="Missing risks", suggested_change="Add a risk section"),
        AuditFinding(id="f2", category="Clarity", summary="Vague steps", suggested_change="Add examples"),
    ]
    system, user = build_apply_audit_prompt(
        inputs=basic_inputs,
        source_iteration=basic_iteration,
        findings=findings,
        iterations=[basic_iteration],
    )
    # Previous output appears
    assert basic_iteration.output in user
    # All findings appear
    assert "Missing risks" in user
    assert "Add a risk section" in user
    assert "Vague steps" in user


def test_apply_audit_prompt_instructs_to_preserve_objective(basic_inputs, basic_iteration):
    system, user = build_apply_audit_prompt(
        inputs=basic_inputs,
        source_iteration=basic_iteration,
        findings=[],
        iterations=[],
    )
    # System or user prompt should remind the LLM to keep alignment
    combined = (system + user).lower()
    assert "objective" in combined and "align" in combined
