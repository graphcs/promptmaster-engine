"""Endpoint tests for routers/long_form.py."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from main import app
from deps import get_client


@pytest.fixture
def client_for_app():
    """FastAPI TestClient with dependency override."""
    mock = AsyncMock()
    app.dependency_overrides[get_client] = lambda: mock
    yield TestClient(app), mock
    app.dependency_overrides.clear()


def _basic_inputs_dict():
    return {
        "objective": "Plan a launch strategy for an internal tool.",
        "audience": "Engineering leads",
        "constraints": "Two-week timeline",
        "output_format": "Numbered list",
        "mode": "architect",
    }


def test_detect_endpoint_returns_classifier_result(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_json = AsyncMock(return_value=(
        {"is_long_form": True, "suggested_section_count": 8, "reason": "Multi-section plan"},
        {},
    ))
    r = api_client.post("/api/detect-long-form", json={"inputs": _basic_inputs_dict()})
    assert r.status_code == 200
    body = r.json()
    assert body["is_long_form"] is True
    assert body["suggested_section_count"] == 8


def test_generate_outline_endpoint_returns_sections(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_json = AsyncMock(return_value=(
        {"outline": [
            {"title": "Intro", "abstract": "a"},
            {"title": "Body", "abstract": "b"},
        ]},
        {},
    ))
    r = api_client.post("/api/generate-outline", json={
        "inputs": _basic_inputs_dict(),
        "suggested_section_count": 2,
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body["outline"]) == 2
    assert body["outline"][0]["title"] == "Intro"
    assert body["outline"][0]["status"] == "pending"


def test_generate_section_endpoint_returns_content_and_snapshot(client_for_app):
    api_client, mock_llm = client_for_app
    mock_llm.generate_with_meta = AsyncMock(return_value=("Section prose.", {}, "stop"))
    mock_llm.generate_json = AsyncMock(return_value=(
        {"completed_topics": ["Body"], "current_topic": None, "key_definitions": [], "next_topic_hint": None},
        {},
    ))
    r = api_client.post("/api/generate-section", json={
        "inputs": _basic_inputs_dict(),
        "outline": [
            {"id": "s1", "title": "Body", "abstract": "b"},
        ],
        "section_index": 0,
        "prior_snapshot": None,
        "prev_section_content": "",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["content"] == "Section prose."
    assert body["finish_reason"] == "stop"
    assert "new_snapshot" in body


def test_finalize_endpoint_returns_iteration_with_eval(client_for_app):
    api_client, mock_llm = client_for_app

    # Mock the parallel calls: evaluator (generate_json), suggestions (generate), summary (generate)
    mock_llm.generate_json = AsyncMock(return_value=(
        {
            "alignment": {"score": "High", "explanation": "On target."},
            "clarity": {"score": "High", "explanation": "Clear."},
            "drift": {"score": "Low", "explanation": "Focused."},
            "completeness": {"status": "complete", "reason": ""},
        },
        {},
    ))
    mock_llm.generate = AsyncMock(return_value=("- Suggestion 1\n- Suggestion 2", {}))

    r = api_client.post("/api/finalize-long-form", json={
        "inputs": _basic_inputs_dict(),
        "merged_content": "Full merged document content.",
        "outline": [
            {"id": "s1", "title": "A", "abstract": "a", "status": "complete", "content": "Full merged document content."},
        ],
        "iteration_number": 1,
        "iteration_history": [],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["iteration"]["trigger_source"] == "long_form_finalize"
    assert body["iteration"]["output"] == "Full merged document content."
    assert body["iteration"]["evaluation"]["alignment"]["score"] == "High"
