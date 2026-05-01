"""Smoke tests for the conversation router endpoints (request shapes only)."""

import inspect

from routers import conversation as conv


def test_chat_message_request_has_required_fields():
    fields = conv.ChatMessageRequest.model_fields
    for required in ("inputs", "active_iteration", "chat_history", "user_message", "model"):
        assert required in fields, f"missing field: {required}"


def test_apply_to_answer_request_has_required_fields():
    fields = conv.ApplyToAnswerRequest.model_fields
    for required in (
        "inputs",
        "active_iteration",
        "chat_history",
        "iteration_number",
        "iteration_history",
        "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_save_as_new_version_request_has_required_fields():
    fields = conv.SaveAsNewVersionRequest.model_fields
    for required in (
        "inputs",
        "active_iteration",
        "chat_history",
        "iteration_number",
        "iteration_history",
        "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_router_registers_three_endpoints():
    paths = [r.path for r in conv.router.routes]
    assert "/api/chat-message" in paths
    assert "/api/apply-to-answer" in paths
    assert "/api/save-as-new-version" in paths


def test_apply_to_answer_uses_apply_prompt_builder():
    src = inspect.getsource(conv.api_apply_to_answer)
    assert "build_apply_to_answer_prompt" in src


def test_save_as_new_version_uses_save_prompt_builder():
    src = inspect.getsource(conv.api_save_as_new_version)
    assert "build_save_as_new_version_prompt" in src
