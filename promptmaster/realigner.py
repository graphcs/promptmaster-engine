"""Realignment prompt generation for PromptMaster Engine.

Implements the hybrid model:
- Structured template skeleton (re-anchors objective, re-states mode)
- LLM-assisted customization (references detected issue, provides corrective instruction)
"""

import logging
from .schemas import PMInput, EvaluationResult
from .modes import MODES
from .llm_client import OpenRouterClient

logger = logging.getLogger(__name__)

REALIGNMENT_LLM_SYSTEM = (
    "You are a prompt engineering assistant. Your job is to write a corrective "
    "instruction paragraph that will help an AI get back on track. Be specific "
    "and direct. Output only the corrective instruction, nothing else."
)

REALIGNMENT_LLM_PROMPT = """The AI produced output that failed evaluation.

ORIGINAL OBJECTIVE: {objective}
MODE: {mode}
ALIGNMENT SCORE: {alignment_score} — {alignment_explanation}
DRIFT SCORE: {drift_score} — {drift_explanation}
CLARITY SCORE: {clarity_score} — {clarity_explanation}

Write a 2-3 sentence corrective instruction that:
1. Names the specific problem detected
2. Tells the AI exactly what to fix
3. Reinforces the original objective

Be direct and specific. No meta-commentary."""


async def build_realignment_prompt(
    client: OpenRouterClient,
    inputs: PMInput,
    evaluation: EvaluationResult,
    model: str | None = None,
) -> str:
    """Build a realignment prompt using the hybrid model.

    Returns the full prompt text that the user can edit before execution.
    """
    mode_config = MODES[inputs.mode]

    # Get LLM-assisted corrective instruction
    llm_prompt = REALIGNMENT_LLM_PROMPT.format(
        objective=inputs.objective,
        mode=mode_config["display_name"],
        alignment_score=evaluation.alignment.score,
        alignment_explanation=evaluation.alignment.explanation,
        drift_score=evaluation.drift.score,
        drift_explanation=evaluation.drift.explanation,
        clarity_score=evaluation.clarity.score,
        clarity_explanation=evaluation.clarity.explanation,
    )

    try:
        corrective_instruction, _usage = await client.generate(
            prompt=llm_prompt,
            system=REALIGNMENT_LLM_SYSTEM,
            temperature=0.4,
            max_tokens=256,
            model=model,
        )
    except Exception as e:
        logger.error(f"Failed to generate corrective instruction: {e}")
        corrective_instruction = (
            "The previous output did not meet the evaluation criteria. "
            "Please re-read the objective carefully and produce a more focused, "
            "aligned response."
        )

    # Assemble structured skeleton + LLM correction
    parts = [
        f"OBJECTIVE (RE-ANCHORED): {inputs.objective}",
        f"MODE: {mode_config['display_name']} Mode — maintain this mode throughout.",
        f"AUDIENCE: {inputs.audience}",
    ]

    if inputs.constraints.strip():
        parts.append(f"CONSTRAINTS: {inputs.constraints}")

    parts.extend([
        "",
        "CORRECTIVE INSTRUCTION:",
        corrective_instruction.strip(),
        "",
        "Re-generate your response. Stay tightly aligned with the objective above. "
        "Do not repeat the previous errors.",
    ])

    return "\n".join(parts)
