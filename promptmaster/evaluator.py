"""Evaluation layer for PromptMaster Engine.

Makes a SEPARATE LLM call (distinct from generation) to evaluate the output
along three dimensions: Alignment, Drift, Clarity.

Returns qualitative scores (Low/Medium/High) with one-sentence explanations.
"""

import logging
from .schemas import PMInput, EvaluationResult, DimensionScore
from .llm_client import OpenRouterClient

logger = logging.getLogger(__name__)

EVALUATOR_SYSTEM = (
    "You are a strict output evaluator. You assess AI-generated content against "
    "the user's original objective. You are objective, concise, and never generous. "
    "Return ONLY valid JSON, no other text."
)

EVALUATOR_PROMPT = """Evaluate the following AI-generated output against the original request.

ORIGINAL OBJECTIVE: {objective}
TARGET AUDIENCE: {audience}
CONSTRAINTS: {constraints}
MODE USED: {mode}

--- BEGIN OUTPUT ---
{output}
--- END OUTPUT ---

Evaluate along three dimensions. For each, assign "Low", "Medium", or "High" and provide exactly one sentence of explanation.

1. ALIGNMENT: Does the output directly address the stated objective and audience? "High" = fully on-target. "Low" = misses the objective or addresses something else.

2. DRIFT: Does the output introduce irrelevant content, speculation, or tangents NOT related to the objective? "Low" = focused and relevant. "High" = significant drift or off-topic content.

3. CLARITY: Is the output well-structured, unambiguous, and complete? "High" = crystal clear. "Low" = confusing, vague, or incomplete.

Return JSON in exactly this format:
{{
    "alignment": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "drift": {{"score": "Low|Medium|High", "explanation": "one sentence"}},
    "clarity": {{"score": "Low|Medium|High", "explanation": "one sentence"}}
}}"""


async def evaluate_output(
    client: OpenRouterClient,
    inputs: PMInput,
    output: str,
    model: str | None = None,
) -> EvaluationResult:
    """Run evaluation as a separate LLM call.

    Args:
        client: OpenRouterClient instance (reused from generation)
        inputs: Original user inputs
        output: The generated output to evaluate
        model: Optional model override

    Returns:
        EvaluationResult with alignment, drift, clarity scores
    """
    prompt = EVALUATOR_PROMPT.format(
        objective=inputs.objective,
        audience=inputs.audience,
        constraints=inputs.constraints or "(none)",
        mode=inputs.mode,
        output=output,
    )

    try:
        result_dict, _usage = await client.generate_json(
            prompt=prompt,
            system=EVALUATOR_SYSTEM,
            temperature=0.3,
            max_tokens=512,
            model=model,
        )

        return EvaluationResult(
            alignment=DimensionScore(**result_dict.get("alignment", {"score": "Medium", "explanation": "Unable to evaluate"})),
            drift=DimensionScore(**result_dict.get("drift", {"score": "Medium", "explanation": "Unable to evaluate"})),
            clarity=DimensionScore(**result_dict.get("clarity", {"score": "Medium", "explanation": "Unable to evaluate"})),
        )
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        return EvaluationResult(
            alignment=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            drift=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
            clarity=DimensionScore(score="Medium", explanation=f"Evaluation error: {e}"),
        )
