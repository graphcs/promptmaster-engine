"""Post-evaluation guidance for PromptMaster Engine.

Uses an LLM call to generate specific, contextual next-step suggestions
based on the evaluation scores, explanations, and the user's original input.
"""

import logging
from .schemas import PMInput, EvaluationResult
from .llm_client import OpenRouterClient

logger = logging.getLogger(__name__)

GUIDANCE_SYSTEM = (
    "You are the suggestions layer of PromptMaster — a structured AI workflow system "
    "based on the book 'How to Become a PromptMaster.' You understand the full system:\n\n"
    "METHODOLOGY:\n"
    "- The workflow is: Input → Review → Output & Evaluation → Realignment → Summary\n"
    "- Mode Locking (Ch5 S3): Each mode pins the AI to a specific persona (Architect, "
    "Critic, Clarity, Coach, Therapist, Cold Critic, Analyst, or Custom)\n"
    "- Anchoring (Ch5 S5): The prompt uses goal/role/format anchors to keep output aligned\n"
    "- Invisible Scaffolding (Ch5 S7): Behind-the-scenes instructions guide AI behavior\n"
    "- Drift (Ch5 S10): The primary failure mode — output escaping its scaffolding\n"
    "- Iterative Refinement: Each iteration should measurably improve on the last\n"
    "- Cold Critic Audit (Ch9): Adversarial self-audit available after finalizing\n\n"
    "AVAILABLE USER ACTIONS (reference these specifically):\n"
    "- 'Refine Prompt' → rebuilds the prompt and returns to Review phase for editing\n"
    "- 'Generate Realignment' → creates a corrective prompt when scores are poor\n"
    "- 'Finalize Session' → marks the session complete, enables Cold Critic audit\n"
    "- Add/remove constraint presets in the Input phase\n"
    "- Change the output format (bullet points, table, executive summary, etc.)\n"
    "- Switch mode for the next iteration (e.g., Architect → Critic for stress-testing)\n"
    "- Edit the assembled prompt directly in the Review phase\n\n"
    "RULES:\n"
    "- Give 2-3 specific suggestions based on the evaluation scores AND the actual output\n"
    "- Each suggestion MUST reference what in the output needs to change AND which action to take\n"
    "- If all scores are strong (Alignment=High, Clarity=High, Drift=Low), suggest "
    "finalizing or running a Cold Critic audit to stress-test before exporting\n"
    "- Do NOT repeat scores back. Do NOT praise generically. Just give clear next steps.\n"
    "- Return ONLY a JSON array of strings, each one a single suggestion sentence."
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

Here is the actual output (first 800 chars):
--- OUTPUT EXCERPT ---
{output_excerpt}
--- END EXCERPT ---

Give 2-3 specific suggestions. For each, reference what in the output needs to change AND tell the user which action to take. Available actions: edit the prompt in Review phase, add a constraint, change the output format, switch mode, finalize the session, or run a Cold Critic audit. Be specific to this output, not generic."""


async def generate_suggestions(
    client: OpenRouterClient,
    inputs: PMInput,
    evaluation: EvaluationResult | None = None,
    output: str = "",
    model: str | None = None,
) -> list[str]:
    """Generate LLM-powered contextual suggestions based on evaluation and output.

    If evaluation is None (parallel mode), the guidance LLM assesses
    the output quality directly.
    """
    prompt = GUIDANCE_PROMPT.format(
        objective=inputs.objective,
        audience=inputs.audience,
        constraints=inputs.constraints or "(none)",
        output_format=inputs.output_format or "(not specified)",
        mode=inputs.mode,
        alignment_score=evaluation.alignment.score if evaluation else "(assess from output)",
        alignment_explanation=evaluation.alignment.explanation if evaluation else "(assess from output)",
        drift_score=evaluation.drift.score if evaluation else "(assess from output)",
        drift_explanation=evaluation.drift.explanation if evaluation else "(assess from output)",
        clarity_score=evaluation.clarity.score if evaluation else "(assess from output)",
        clarity_explanation=evaluation.clarity.explanation if evaluation else "(assess from output)",
        output_excerpt=output[:800] if output else "(not available)",
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
        # Some models wrap in {"suggestions": [...]} or similar
        if isinstance(result, dict):
            # Try known keys first, then any list value
            for key in ("suggestions", "items", "steps", "recommendations"):
                if key in result and isinstance(result[key], list):
                    return [str(s) for s in result[key][:3]]
            # Fall back to first list value found in the dict
            for value in result.values():
                if isinstance(value, list) and len(value) > 0:
                    return [str(s) for s in value[:3]]

        logger.warning(f"Unexpected guidance format: {type(result)}")
        return _fallback_suggestions(evaluation)
    except Exception as e:
        logger.warning(f"Guidance LLM call failed, using fallback: {e}")
        return _fallback_suggestions(evaluation)


def _fallback_suggestions(evaluation: EvaluationResult | None) -> list[str]:
    """Deterministic fallback if the LLM call fails."""
    if evaluation is None:
        return [
            "Review the output and click 'Refine Prompt' to iterate, "
            "or 'Finalize Session' if it meets your needs."
        ]

    suggestions: list[str] = []

    if evaluation.alignment.score == "Low":
        suggestions.append(
            "Your objective may be too vague — click 'Refine Prompt' and rewrite "
            "your objective to be more specific about the desired outcome."
        )
    if evaluation.drift.score == "High":
        suggestions.append(
            "The output wandered off-topic — add a constraint like 'Stay strictly "
            "within the scope of [your topic]' in the Input phase to keep it focused."
        )
    if evaluation.clarity.score == "Low":
        suggestions.append(
            "Try selecting an output format preset (e.g. 'Bullet points' or "
            "'Step-by-step guide') in the Input phase to improve structure."
        )
    if not suggestions:
        suggestions.append(
            "Output looks strong — click 'Finalize Session' and consider running "
            "a Cold Critic audit to stress-test before exporting."
        )

    return suggestions[:3]
