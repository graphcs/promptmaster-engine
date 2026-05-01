"""Verify that iteration-creating endpoints now include summary generation."""

import inspect

from routers import engine


def test_run_iteration_imports_generate_summary():
    src = inspect.getsource(engine)
    assert "generate_summary" in src, (
        "engine.py should call generate_summary as part of iteration creation"
    )


def test_run_iteration_includes_summary_assignment():
    src = inspect.getsource(engine.api_run_iteration)
    assert "summary" in src, "run-iteration should set Iteration.summary"


def test_flow_trigger_includes_summary_assignment():
    src = inspect.getsource(engine.api_flow_trigger)
    assert "summary" in src, "flow-trigger should set Iteration.summary for non-diagnostic triggers"
