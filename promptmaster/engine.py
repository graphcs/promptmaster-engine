"""Core orchestrator for PromptMaster Engine.

Coordinates: prompt building -> LLM execution -> evaluation -> realignment.
All state is managed by the caller (Streamlit session_state).
"""

from .llm_client import OpenRouterClient
from .schemas import PMInput, Iteration, EvaluationResult, AssembledPrompt
from .prompt_builder import build_prompt
from .evaluator import evaluate_output
from .realigner import build_realignment_prompt


async def generate(
    client: OpenRouterClient,
    prompt_text: str,
    system_text: str,
    model: str | None = None,
) -> str:
    """Execute a single generation call. Returns the output text."""
    content, _usage = await client.generate(
        prompt=prompt_text,
        system=system_text,
        temperature=0.7,
        max_tokens=4096,
        model=model,
    )
    return content


async def run_iteration(
    client: OpenRouterClient,
    inputs: PMInput,
    prompt_text: str,
    system_text: str,
    iteration_number: int,
    model: str | None = None,
) -> Iteration:
    """Run one complete generate-then-evaluate cycle.

    Returns an Iteration with the output and evaluation attached.
    """
    # Generate
    output = await generate(client, prompt_text, system_text, model=model)

    # Evaluate (separate LLM call)
    evaluation = await evaluate_output(client, inputs, output, model=model)

    return Iteration(
        iteration_number=iteration_number,
        prompt_sent=prompt_text,
        system_prompt_used=system_text,
        output=output,
        mode=inputs.mode,
        evaluation=evaluation,
    )


def format_session_summary(inputs: PMInput, iterations: list[Iteration]) -> str:
    """Generate the copyable session summary text."""
    if not iterations:
        return "No iterations completed."

    final = iterations[-1]
    eval_text = "Not evaluated"
    if final.evaluation:
        e = final.evaluation
        eval_text = (
            f"  Alignment: {e.alignment.score} — {e.alignment.explanation}\n"
            f"  Drift:     {e.drift.score} — {e.drift.explanation}\n"
            f"  Clarity:   {e.clarity.score} — {e.clarity.explanation}"
        )

    parts = [
        "=" * 60,
        "PROMPTMASTER SESSION SUMMARY",
        "=" * 60,
        "",
        f"Objective:   {inputs.objective}",
        f"Audience:    {inputs.audience}",
        f"Constraints: {inputs.constraints or '(none)'}",
        f"Mode:        {inputs.mode.title()}",
        f"Iterations:  {len(iterations)}",
        "",
        "--- FINAL SCORES ---",
        eval_text,
        "",
        "--- FINAL PROMPT ---",
        final.prompt_sent,
        "",
        "--- FINAL OUTPUT ---",
        final.output,
        "",
        "=" * 60,
    ]
    return "\n".join(parts)
