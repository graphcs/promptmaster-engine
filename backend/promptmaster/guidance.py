"""Post-evaluation guidance for PromptMaster Engine.

Uses an LLM call to generate specific, contextual next-step suggestions
based on the evaluation scores, explanations, and the user's original input.
"""

import logging
from .schemas import PMInput, EvaluationResult
from .llm_client import OpenRouterClient

logger = logging.getLogger(__name__)

GUIDANCE_SYSTEM = (
    "You are a concise prompting coach. Based on evaluation scores of an AI-generated "
    "output, give the user 2-3 specific, actionable suggestions to improve their next "
    "iteration. Be concrete — reference their actual objective and what went wrong. "
    "Do NOT repeat the scores back. Do NOT praise. Just give clear next steps. "
    "Return ONLY a JSON array of strings, each one a single suggestion sentence."
)

GUIDANCE_PROMPT = """The user asked for this:
OBJECTIVE: {objective}
AUDIENCE: {audience}
CONSTRAINTS: {constraints}
FORMAT: {output_format}
MODE: {mode}

The output was evaluated:
- Alignment: {alignment_score} — {alignment_explanation}
- Drift: {drift_score} — {drift_explanation}
- Clarity: {clarity_score} — {clarity_explanation}

Give 2-3 specific suggestions for what the user should change in their next iteration to improve the output. Focus on the weakest scores. Be specific to their objective, not generic."""


async def generate_suggestions(
    client: OpenRouterClient,
    inputs: PMInput,
    evaluation: EvaluationResult,
    model: str | None = None,
) -> list[str]:
    """Generate LLM-powered contextual suggestions based on evaluation."""
    prompt = GUIDANCE_PROMPT.format(
        objective=inputs.objective,
        audience=inputs.audience,
        constraints=inputs.constraints or "(none)",
        output_format=inputs.output_format or "(not specified)",
        mode=inputs.mode,
        alignment_score=evaluation.alignment.score,
        alignment_explanation=evaluation.alignment.explanation,
        drift_score=evaluation.drift.score,
        drift_explanation=evaluation.drift.explanation,
        clarity_score=evaluation.clarity.score,
        clarity_explanation=evaluation.clarity.explanation,
    )

    try:
        result, _usage = await client.generate_json(
            prompt=prompt,
            system=GUIDANCE_SYSTEM,
            temperature=0.3,
            max_tokens=512,
            model=model,
        )

        # Result should be a list of strings
        if isinstance(result, list):
            return [str(s) for s in result[:3]]
        # Some models wrap in {"suggestions": [...]}
        if isinstance(result, dict):
            for key in ("suggestions", "items", "steps"):
                if key in result and isinstance(result[key], list):
                    return [str(s) for s in result[key][:3]]

        logger.warning(f"Unexpected guidance format: {type(result)}")
        return _fallback_suggestions(evaluation)
    except Exception as e:
        logger.warning(f"Guidance LLM call failed, using fallback: {e}")
        return _fallback_suggestions(evaluation)


def _fallback_suggestions(evaluation: EvaluationResult) -> list[str]:
    """Deterministic fallback if the LLM call fails."""
    suggestions: list[str] = []

    if evaluation.alignment.score == "Low":
        suggestions.append(
            "Your objective may be too vague \u2014 try being more specific "
            "about what the output should contain."
        )
    if evaluation.drift.score == "High":
        suggestions.append(
            "The output wandered off-topic. Add explicit boundaries "
            "in your constraints to keep it focused."
        )
    if evaluation.clarity.score == "Low":
        suggestions.append(
            "Try specifying an output format (e.g. 'bullet points', "
            "'numbered steps') to improve structure."
        )
    if not suggestions:
        suggestions.append(
            "Strong output. Finalize, or try Cold Critic mode to stress-test it."
        )

    return suggestions[:3]
