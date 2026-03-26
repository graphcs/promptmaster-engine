"""Post-evaluation guidance for PromptMaster Engine.

Generates deterministic, context-aware next-step suggestions based on
evaluation scores. No LLM call required — pure rule-based logic.
"""

from .schemas import EvaluationResult


def get_suggestions(
    evaluation: EvaluationResult,
    has_constraints: bool,
    has_format: bool,
) -> list[str]:
    """Return 1-3 actionable next-step suggestions based on evaluation scores."""
    suggestions: list[str] = []

    # Alignment issues
    if evaluation.alignment.score == "Low":
        suggestions.append(
            "Your objective may be too vague \u2014 try being more specific "
            "about what exactly the output should contain or accomplish."
        )
    elif evaluation.alignment.score == "Medium" and not has_constraints:
        suggestions.append(
            "Consider adding constraints to narrow the scope and "
            "help the AI focus on what matters most."
        )

    # Drift issues
    if evaluation.drift.score == "High":
        suggestions.append(
            "The output wandered off-topic. Try adding explicit boundaries "
            "in your constraints, e.g. 'Do not discuss X' or 'Stay focused on Y.'"
        )
    elif evaluation.drift.score == "Medium":
        suggestions.append(
            "Some tangential content was detected. A realignment "
            "iteration can sharpen focus."
        )

    # Clarity issues
    if evaluation.clarity.score == "Low":
        suggestions.append(
            "Try specifying an output format (e.g. 'bullet points', "
            "'numbered steps', 'table') to improve structure."
        )
    elif evaluation.clarity.score == "Medium" and not has_format:
        suggestions.append(
            "Adding an output format like 'short paragraphs' or "
            "'executive summary' could improve clarity."
        )

    # All good
    if not suggestions:
        suggestions.append(
            "Strong output. You can finalize the session, or try "
            "switching to Cold Critic mode to stress-test it."
        )

    return suggestions[:3]
