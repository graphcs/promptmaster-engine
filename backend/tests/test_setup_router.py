"""Smoke tests for the Smart Setup router."""

import inspect

from routers import setup as setup_router_module


def test_generate_setup_request_has_required_fields():
    fields = setup_router_module.GenerateSetupRequest.model_fields
    for required in ("objective", "model"):
        assert required in fields, f"missing field: {required}"


def test_generate_setup_response_has_suggestion_envelope():
    fields = setup_router_module.GenerateSetupResponse.model_fields
    assert "suggestion" in fields


def test_router_registers_endpoint():
    paths = [r.path for r in setup_router_module.router.routes]
    assert "/api/generate-setup" in paths


def test_endpoint_calls_suggest_setup():
    src = inspect.getsource(setup_router_module.api_generate_setup)
    assert "suggest_setup" in src
