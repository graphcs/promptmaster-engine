"""Session history formatter for injecting context into LLM prompts.

Turns a list of Iterations into a compact, readable text summary that every
LLM prompt (evaluator, guidance, flow triggers, realigner) can include so
the model understands what the user has already done in this session.
"""

from .schemas import Iteration
from .modes import MODES


# Human-readable labels for trigger_source values
_TRIGGER_LABELS = {
    "initial": "initial run",
    "refine": "Refine Prompt",
    "realignment": "Realignment",
    "challenge": "Challenge This",
    "self_audit": "Self-Audit",
    "drift_alert": "Drift Alert",
    "refine_shorter": "Refine: Shorter",
    "refine_technical": "Refine: More technical",
    "refine_concrete": "Refine: More concrete",
    "refine_angle": "Refine: Different angle",
    "refine_cautious": "Refine: More cautious",
    "ask_questions": "Ask Questions follow-up",
}


def _label_trigger(source: str | None) -> str:
    if not source:
        return "initial run"
    return _TRIGGER_LABELS.get(source, source)


def _label_rating(rating: str | None) -> str:
    """Format user rating for inclusion in session history."""
    if rating == "positive":
        return "USER RATED: STRONG (user liked this iteration)"
    if rating == "negative":
        return "USER RATED: POOR (user disliked this iteration)"
    return ""


def format_session_history(
    iterations: list[Iteration],
    max_chars_per_output: int = 180,
) -> str:
    """Produce a compact text summary of what the user has done this session.

    Example:
        Session history: 3 iterations so far.
        - Iteration 1 (Architect, initial run): Alignment=High, Clarity=High, Drift=Low.
          Output excerpt: "Step 1 — Define the scope of the analysis..."
        - Iteration 2 (Architect, Refine: More concrete): Alignment=High, Clarity=High, Drift=Low.
          Output excerpt: "Here is a concrete 5-step breakdown..."
        - Iteration 3 (Critic, Challenge This): diagnostic critique (no eval).
          Output excerpt: "The previous answer assumes X without evidence..."
    """
    if not iterations:
        return "Session history: this is the first iteration."

    lines = [f"Session history: {len(iterations)} iteration(s) so far."]
    has_any_rating = any(it.user_rating for it in iterations)
    if has_any_rating:
        lines.append(
            "NOTE: The user has explicitly rated some iterations STRONG or POOR. "
            "Treat these ratings as direct signal about their preferences. "
            "Favor approaches from STRONG iterations; avoid repeating approaches from POOR iterations."
        )

    for it in iterations:
        mode_label = MODES.get(it.mode, {}).get("display_name", it.mode)
        trigger_label = _label_trigger(it.trigger_source)
        if it.evaluation:
            e = it.evaluation
            score_line = (
                f"Alignment={e.alignment.score}, "
                f"Clarity={e.clarity.score}, "
                f"Drift={e.drift.score}"
            )
        else:
            score_line = "diagnostic critique (no eval)"

        rating_suffix = ""
        rating_label = _label_rating(it.user_rating)
        if rating_label:
            rating_suffix = f" [{rating_label}]"

        excerpt = (it.output or "").strip().replace("\n", " ")
        if len(excerpt) > max_chars_per_output:
            excerpt = excerpt[:max_chars_per_output] + "…"

        lines.append(
            f"- Iteration {it.iteration_number} ({mode_label}, {trigger_label}): {score_line}.{rating_suffix}\n"
            f'  Output excerpt: "{excerpt}"'
        )
    return "\n".join(lines)


def summarize_actions_taken(iterations: list[Iteration]) -> str:
    """Produce a compact list of flow trigger actions the user has used.

    Returns something like:
        "So far the user has run: initial run, Refine: Shorter, Challenge This."
    Useful when we want to avoid suggesting an action they already tried.
    """
    if not iterations:
        return "No actions taken yet."
    actions = [_label_trigger(it.trigger_source) for it in iterations]
    return "Actions used so far: " + ", ".join(actions) + "."
