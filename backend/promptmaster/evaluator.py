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
    "You are the evaluation layer of PromptMaster — a structured AI workflow system "
    "based on the book 'How to Become a PromptMaster.' Your role is critical to the "
    "system's iterative improvement loop: generate → evaluate → correct → improve.\n\n"
    "You assess AI-generated content against the user's original objective using three "
    "dimensions. You understand the PromptMaster methodology:\n"
    "- MODE LOCKING (Ch5 S3): The AI was given a specific persona via system prompt. "
    "Evaluate whether the output stays in character for that mode.\n"
    "- ANCHORING (Ch5 S5): The prompt includes goal anchors, role anchors, and format "
    "anchors. Evaluate whether the output honors these anchors.\n"
    "- INVISIBLE SCAFFOLDING (Ch5 S7): Behind-the-scenes instructions guide the AI's "
    "behavior. Drift means the output escaped that scaffolding.\n"
    "- DRIFT (Ch5 S10): Scope deviation from the objective — covering topics not asked "
    "for, losing the mode's tone, becoming generic, padding with filler, or fixating on "
    "tangents. Drift is the primary failure mode in extended AI interactions.\n\n"
    "You are fair but rigorous. You do not inflate scores, but you give credit where "
    "earned. Return ONLY valid JSON, no other text."
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

SCORING GUIDELINES (be consistent — do not change a score unless the output genuinely changed):
- "High" = strong, well-targeted output that clearly meets the bar. Award it confidently when earned. If the output addresses the objective, is well-structured, and stays on scope, it deserves "High."
- "Medium" = acceptable but with clear, specific room for improvement. You MUST name what is lacking.
- "Low" = significant problems — misses the objective, drifts off-topic, or is poorly structured.

IMPORTANT: Do not penalize stylistic variation. Focus on substance, not style.

1. ALIGNMENT: Does the output directly address the stated objective for the target audience?
   - Consider: Does it answer what was asked? Is it substantive enough? Does it match the audience's needs?
   - "High" = on-target and substantive. "Medium" = addresses the topic but misses key aspects. "Low" = misses the objective or is too vague/broad.

2. DRIFT: Did the output escape the PromptMaster scaffolding? Drift is the primary failure mode in AI interactions.
   - Signs of drift: covering topics NOT asked for, breaking character from the selected mode ({mode}), becoming generic when specificity was needed, padding with filler, fixating on tangents, or losing the mode's required tone.
   - "Low" = focused and stays within scope (this is GOOD). "Medium" = mostly focused but includes unnecessary content. "High" = significant scope deviation or off-topic material.

3. CLARITY: Is the output well-structured, unambiguous, and complete?
   - Consider the mode's expected output style: {mode} mode has specific structural expectations.
   - "High" = clear, well-organized, easy to follow. "Medium" = understandable but could be tighter. "Low" = confusing, vague, or incomplete.

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
            temperature=0.15,
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
