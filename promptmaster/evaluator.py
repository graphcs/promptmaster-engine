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
    "You are a fair but rigorous output evaluator. You assess AI-generated content against "
    "the user's original objective. You are objective and concise. You do not inflate scores, "
    "but you also give credit where it is earned. Return ONLY valid JSON, no other text."
)

EVALUATOR_PROMPT = """Evaluate the following AI-generated output against the original request.

ORIGINAL OBJECTIVE: {objective}
TARGET AUDIENCE: {audience}
CONSTRAINTS: {constraints}
REQUESTED FORMAT: {output_format}
MODE USED: {mode}

--- BEGIN OUTPUT ---
{output}
--- END OUTPUT ---

Evaluate along three dimensions. For each, assign "Low", "Medium", or "High" and provide exactly one sentence of explanation.

SCORING GUIDELINES:
- "High" = strong, well-targeted output that clearly meets the bar. Award it when genuinely earned.
- "Medium" = acceptable but with clear room for improvement.
- "Low" = significant problems — misses the objective, drifts off-topic, or is poorly structured.
- If the original objective is vague or generic (e.g. "tell me about X"), Alignment should be scored "Low" because a vague objective cannot produce well-aligned output.

1. ALIGNMENT: Does the output directly address the stated objective for the target audience? "High" = on-target and substantive. "Medium" = addresses the topic but could be more targeted. "Low" = misses the objective, too broad, or the objective itself was too vague.

2. DRIFT: Does the output stay within the scope of the objective? Signs of drift include: covering topics not asked for, adopting a tone inconsistent with the selected mode, becoming generic or verbose, padding with filler, or fixating on tangents. "Low" = focused and relevant. "Medium" = mostly focused but with some unnecessary content. "High" = significant scope deviation or off-topic material.

3. CLARITY: Is the output well-structured, unambiguous, and complete? "High" = clear, well-organized, easy to follow. "Medium" = understandable but could be tighter. "Low" = confusing, vague, poorly structured, or incomplete.

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
        output_format=inputs.output_format or "(not specified)",
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
