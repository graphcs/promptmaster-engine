"""Smoke test — verifies pytest infrastructure works."""

from promptmaster.schemas import PMInput


def test_pytest_runs():
    assert 1 + 1 == 2


def test_pmininput_loads(basic_inputs: PMInput):
    assert basic_inputs.mode == "architect"
    assert "launch" in basic_inputs.objective.lower()
