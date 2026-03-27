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
    "the user's original objective. You are harsh, objective, and never generous. "
    "You penalize vagueness severely. When in doubt, score lower, not higher. "
    "Return ONLY valid JSON, no other text."
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

IMPORTANT SCORING RULES:
- "High" should be RARE and reserved for outputs that are exceptionally well-targeted. Do not give "High" easily.
- "Medium" means acceptable but with clear room for improvement.
- "Low" means significant problems. Use it whenever the output fails to meet the bar.
- If the original objective is vague, generic, or lacks specificity (e.g. "tell me about X", "help me with Y"), Alignment MUST be scored "Low" because a vague objective cannot produce a well-aligned output.
- If constraints or format were left empty and the output is generic as a result, factor that into Drift and Clarity scores.

1. ALIGNMENT: Does the output directly and specifically address the stated objective for the target audience? "High" = precise, fully on-target with no wasted content. "Medium" = addresses the topic but could be more targeted. "Low" = misses the objective, addresses something too broad, or the objective itself was too vague to produce aligned output.

2. DRIFT: Does the output stay tightly within the scope of the objective, or does it wander? Signs of drift include: covering topics not asked for, adopting a tone inconsistent with the selected mode, becoming generic or verbose, padding with filler content, offering unsolicited advice, or fixating on tangents. "Low" = tightly focused. "Medium" = mostly focused but with some unnecessary content. "High" = significant scope deviation or off-topic material.

3. CLARITY: Is the output well-structured, unambiguous, and complete? "High" = crystal clear, precise, well-organized. "Medium" = understandable but could be tighter. "Low" = confusing, vague, poorly structured, or incomplete.

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
