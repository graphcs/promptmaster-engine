"""Smoke and behavior tests for the Audit router."""

import inspect
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from main import app
from deps import get_client
from routers import audit as audit_router_module


# --- request/response shape ---

def test_audit_findings_request_has_required_fields():
    fields = audit_router_module.AuditFindingsRequest.model_fields
    for required in ("inputs", "current_output", "iteration_history", "model"):
        assert required in fields, f"missing field: {required}"


def test_audit_findings_response_has_findings_envelope():
    fields = audit_router_module.AuditFindingsResponse.model_fields
    assert "findings" in fields


def test_apply_audit_request_has_required_fields():
    fields = audit_router_module.ApplyAuditRequest.model_fields
    for required in (
        "inputs", "source_iteration", "findings",
        "iteration_number", "iteration_history", "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_router_registers_both_endpoints():
    paths = [r.path for r in audit_router_module.router.routes]
    assert "/api/audit-findings" in paths
    assert "/api/apply-audit" in paths


def test_audit_findings_endpoint_uses_generator():
    src = inspect.getsource(audit_router_module.api_audit_findings)
    assert "generate_audit_findings" in src


def test_apply_audit_endpoint_uses_prompt_builder_and_pipeline():
    src = inspect.getsource(audit_router_module.api_apply_audit)
    assert "build_apply_audit_prompt" in src
    assert "build_iteration_with_full_pipeline" in src


def test_apply_audit_uses_applied_audit_trigger_source():
    src = inspect.getsource(audit_router_module.api_apply_audit)
    assert "applied_audit" in src


# --- behavior tests (TestClient + mocked LLM) ---

def test_audit_findings_endpoint_returns_findings_envelope_end_to_end():
    """Full request -> endpoint -> generate_audit_findings -> response."""
    fake_client = AsyncMock()
    fake_client.generate_json = AsyncMock(return_value=(
        {"findings": [
            {"id": "f1", "category": "Coverage", "summary": "Missing risks", "suggested_change": "Add risks section"},
            {"id": "f2", "category": "Clarity", "summary": "Vague steps", "suggested_change": "Add examples"},
        ]},
        {},
    ))

    app.dependency_overrides[get_client] = lambda: fake_client
    try:
        client = TestClient(app)
        response = client.post(
            "/api/audit-findings",
            json={
                "inputs": {
                    "objective": "Plan a launch",
                    "audience": "General",
                    "constraints": "",
                    "output_format": "",
                    "mode": "architect",
                    "session_facts": [],
                },
                "current_output": "Here is a plan...",
                "iteration_history": [],
                "model": "",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert "findings" in body
        assert len(body["findings"]) == 2
        assert body["findings"][0]["category"] == "Coverage"
    finally:
        app.dependency_overrides.clear()


def test_audit_findings_endpoint_returns_empty_list_when_llm_fails():
    """When the LLM raises, endpoint returns 200 with empty findings (not 502)."""
    fake_client = AsyncMock()
    fake_client.generate_json = AsyncMock(side_effect=RuntimeError("boom"))

    app.dependency_overrides[get_client] = lambda: fake_client
    try:
        client = TestClient(app)
        response = client.post(
            "/api/audit-findings",
            json={
                "inputs": {
                    "objective": "x",
                    "audience": "General",
                    "constraints": "",
                    "output_format": "",
                    "mode": "architect",
                    "session_facts": [],
                },
                "current_output": "x",
            },
        )
        assert response.status_code == 200
        assert response.json()["findings"] == []
    finally:
        app.dependency_overrides.clear()
