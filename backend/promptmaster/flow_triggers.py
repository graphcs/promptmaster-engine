"""Flow Triggers — one-click advanced prompting techniques from the book.

Implements book concepts from Ch1 S13-S14 and Ch2 S15:
- Contradiction Prompts (Challenge This)
- Structured Self-Check (Self-Audit Response)
- Call Out Drift Directly (Drift Alert)
- Refinement Loops (Refine as... variants)
- Shadow Prompts (Check Intent)
- Reverse Q&A (Ask Questions)

Each trigger either:
  (a) builds a new prompt that runs through the full iteration pipeline
      (generate + eval + suggest), or
  (b) runs a lightweight one-shot inspection call that returns text.
"""

import json
import logging
from typing import Literal
from .schemas import PMInput, EvaluationResult, Iteration
from .llm_client import OpenRouterClient
from .modes import MODES
from .prompt_builder import build_prompt
from .session_context import format_session_history

logger = logging.getLogger(__name__)

FlowTriggerType = Literal[
    "challenge",
    "self_audit",
    "drift_alert",
    "refine_shorter",
    "refine_technical",
    "refine_concrete",
    "refine_angle",
    "refine_cautious",
]

FlowInspectType = Literal["check_intent", "ask_questions"]


# ============================================================================
# ITERATION-BASED TRIGGERS
# Build (system_prompt, user_prompt) that go through full generate+eval+suggest
# ============================================================================

_PROMPTMASTER_CONTEXT = (
    "You are operating inside PromptMaster — a structured AI workflow system based on the book "
    "'How to Become a PromptMaster' by Sean Moran. The user interacts via a 5-phase loop: "
    "Input → Review → Output & Evaluation → Realignment → Summary. "
    "The system uses Mode Locking, Anchoring, and Invisible Scaffolding to keep the AI aligned, "
    "and a separate evaluator LLM to detect drift."
)


def build_challenge_prompt(
    inputs: PMInput, current_output: str, iterations: list[Iteration] | None = None
) -> tuple[str, str]:
    """Contradiction Prompt (Ch1 S14) — argue the opposite, stress-test the output."""
    mode_config = MODES[inputs.mode]
    system = (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"You are operating in PromptMaster Challenge Mode, building on {mode_config['display_name']} Mode.\n\n"
        "You just produced an answer that addressed the user's objective. Your new task is to "
        "argue AGAINST that previous answer — identify its flaws, hidden assumptions, weak reasoning, "
        "and missing perspectives. This is rigorous stress-testing (Ch1 S14 Contradiction Prompts), "
        "not contrarianism for its own sake. The goal is to surface what is fragile in the previous "
        "answer so the user can see it clearly.\n\n"
        "Do not produce a new polished answer. Produce a structured critique of the previous answer. "
        "Reference specific parts of it. Be blunt and specific."
    )
    user = (
        f"Original objective: {inputs.objective}\n\n"
        f"{format_session_history(iterations or [])}\n\n"
        f"--- PREVIOUS ANSWER (the one you are challenging) ---\n{current_output}\n--- END PREVIOUS ANSWER ---\n\n"
        "Now challenge this answer. Structure your response as:\n"
        "1. **Unstated assumptions** — what does the answer quietly assume?\n"
        "2. **Weak reasoning** — where does the logic fail to hold up?\n"
        "3. **Missing perspectives** — what important angles were ignored?\n"
        "4. **Opposite view** — what would a well-reasoned argument against this answer look like?\n"
        "Be specific. Reference exact claims or sentences from the previous answer."
    )
    return system, user


def build_self_audit_response_prompt(
    inputs: PMInput, current_output: str, iterations: list[Iteration] | None = None
) -> tuple[str, str]:
    """Structured Self-Check (Ch1 S13) — AI audits its own last response and fixes gaps."""
    mode_config = MODES[inputs.mode]
    system = (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"You are operating in PromptMaster Self-Audit Mode, building on {mode_config['display_name']} Mode.\n\n"
        "You just produced an answer. Your new task is to audit your own response (Ch1 S13 Structured "
        "Self-Check): identify specific ways it may be incomplete, unclear, or fail to fully address "
        "the user's objective. Then produce a revised answer that fixes those specific gaps.\n\n"
        "Be rigorous. Don't say vague things like 'could be more detailed.' Name the specific gap and "
        "show how your revision closes it."
    )
    user = (
        f"Original objective: {inputs.objective}\n\n"
        f"{format_session_history(iterations or [])}\n\n"
        f"--- PREVIOUS ANSWER (the one you are auditing) ---\n{current_output}\n--- END PREVIOUS ANSWER ---\n\n"
        "Structure your response in two parts:\n\n"
        "**Part 1 — Gap Analysis**: List 3-5 specific ways the previous answer falls short. "
        "For each, state what is missing or unclear and why it matters for the objective.\n\n"
        "**Part 2 — Revised Answer**: Produce a new, improved answer that directly addresses each gap you named. "
        "Keep the structure and scope aligned with the original objective."
    )
    return system, user


def build_drift_alert_prompt(
    inputs: PMInput,
    current_output: str,
    evaluation: EvaluationResult | None,
    iterations: list[Iteration] | None = None,
) -> tuple[str, str]:
    """Call Out Drift Directly (Ch2 S15) — explicit drift correction.

    Reuses build_prompt() to get the correct mode-locked system prompt,
    including custom mode's custom_preamble and custom_tone.
    """
    mode_display = (
        inputs.custom_name or "Custom"
        if inputs.mode == "custom"
        else MODES[inputs.mode]["display_name"]
    )
    drift_reason = (
        evaluation.drift.explanation
        if evaluation and evaluation.drift.score != "Low"
        else "The previous answer wandered off the core objective."
    )

    base = build_prompt(inputs)
    system = (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"{base.system_prompt}\n\n"
        "DRIFT ALERT (Ch2 S15 Call Out Drift Directly): The previous answer drifted from the user's "
        "objective. You are being called back to the anchor. Re-read the objective carefully. "
        "Produce a new answer that stays tightly within scope. Do not repeat the drift patterns that were flagged."
    )
    user = (
        "STOP. The previous answer drifted from the objective.\n\n"
        f"Drift detected: {drift_reason}\n\n"
        f"{format_session_history(iterations or [])}\n\n"
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
    )
    if inputs.constraints.strip():
        user += f"Constraints: {inputs.constraints}\n"
    if inputs.output_format.strip():
        user += f"Format: {inputs.output_format}\n"
    user += (
        f"\nRe-answer the objective now. Stay strictly within scope. Do not repeat the drift patterns above. "
        f"Operate as {mode_display} Mode throughout."
    )
    return system, user


REFINE_CONSTRAINTS = {
    "refine_shorter": "Condense the previous answer to roughly half its length while preserving all key points. Cut filler and redundancy ruthlessly.",
    "refine_technical": "Rewrite the previous answer with deeper technical depth, domain terminology, and implementation-level specifics. Assume the reader has expertise.",
    "refine_concrete": "Rewrite the previous answer with specific examples, concrete cases, and real-world references. Remove abstract generalities.",
    "refine_angle": "Reanalyze the objective from a completely different angle than the previous answer. Do not repeat the same framing or structure.",
    "refine_cautious": "Rewrite the previous answer with explicit caveats, uncertainties, and risk callouts where appropriate. Flag what is unknown or contested.",
}


def build_refine_prompt(
    inputs: PMInput,
    current_output: str,
    trigger: FlowTriggerType,
    iterations: list[Iteration] | None = None,
) -> tuple[str, str]:
    """Refinement Loops (Ch1 S14) — iterate with a specific single constraint."""
    mode_config = MODES[inputs.mode]
    refine_instruction = REFINE_CONSTRAINTS[trigger]

    base_system = build_prompt(inputs).system_prompt
    system = (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"{base_system}\n\n"
        "You are in a Refinement Loop (Ch1 S14). Apply the single refinement constraint "
        "exactly — do not make unrelated changes."
    )
    user = (
        f"Original objective: {inputs.objective}\n\n"
        f"{format_session_history(iterations or [])}\n\n"
        f"--- PREVIOUS ANSWER (the one you are refining) ---\n{current_output}\n--- END PREVIOUS ANSWER ---\n\n"
        f"REFINEMENT INSTRUCTION: {refine_instruction}\n\n"
        f"Produce the refined version now, staying within {mode_config['display_name']} Mode."
    )
    return system, user


def build_flow_trigger_prompt(
    inputs: PMInput,
    current_output: str,
    trigger: FlowTriggerType,
    evaluation: EvaluationResult | None = None,
    iterations: list[Iteration] | None = None,
) -> tuple[str, str]:
    """Dispatch to the correct prompt builder for the trigger type."""
    if trigger == "challenge":
        return build_challenge_prompt(inputs, current_output, iterations)
    if trigger == "self_audit":
        return build_self_audit_response_prompt(inputs, current_output, iterations)
    if trigger == "drift_alert":
        return build_drift_alert_prompt(inputs, current_output, evaluation, iterations)
    if trigger in REFINE_CONSTRAINTS:
        return build_refine_prompt(inputs, current_output, trigger, iterations)
    raise ValueError(f"Unknown flow trigger type: {trigger}")


# ============================================================================
# INSPECTION-ONLY TRIGGERS (one-shot calls, no iteration)
# ============================================================================

CHECK_INTENT_SYSTEM = (
    f"{_PROMPTMASTER_CONTEXT}\n\n"
    "You are the goal inference layer (Ch1 S14 Shadow Prompts). Your job is to look at a user's "
    "prompting session and infer what they REALLY want underneath. Read between the lines. "
    "Identify the underlying goal, not just the literal request. Be insightful and specific. "
    "Avoid generic observations."
)

CHECK_INTENT_PROMPT = """A user is working through a PromptMaster session:

Objective (stated): {objective}
Audience: {audience}
Mode: {mode}
Constraints: {constraints}

{session_history}

The AI just produced this output (the most recent one):
---
{current_output}
---

Now answer two questions:

**1. Inferred Goal** — In 2-3 sentences, what does the user REALLY want at the underlying level? Read between the lines. Consider how the session has evolved across iterations.

**2. Implicit Expectations** — List 2-3 specific things the user might be implicitly expecting that they did NOT state explicitly. These are things that could cause friction if the output misses them.

Be specific and insightful. Avoid generic commentary."""


ASK_QUESTIONS_SYSTEM = (
    f"{_PROMPTMASTER_CONTEXT}\n\n"
    "You are the clarification layer (Ch1 S14 Reverse Q&A). Based on a user's objective, session "
    "history, and the current AI output, identify gaps or ambiguities that are preventing the best "
    "possible answer. Ask 2-3 specific, targeted questions that would unlock a sharper response. "
    "Questions must be concrete, not vague. Return ONLY a JSON array of question strings."
)

ASK_QUESTIONS_PROMPT = """Objective: {objective}
Audience: {audience}
Mode: {mode}
Constraints: {constraints}

{session_history}

Current output (the most recent one):
---
{current_output}
---

Identify 2-3 specific ambiguities or missing context that, if clarified, would lead to a notably better answer. Generate questions that target those gaps. Each question should be concrete and answerable.

Return as a JSON array of question strings, nothing else. Example format:
["Question 1?", "Question 2?", "Question 3?"]"""


async def run_check_intent(
    client: OpenRouterClient,
    inputs: PMInput,
    current_output: str,
    iterations: list[Iteration] | None = None,
    model: str | None = None,
) -> str:
    """Shadow Prompt (Ch1 S14) — infer the user's real goal from the session."""
    prompt = CHECK_INTENT_PROMPT.format(
        objective=inputs.objective,
        audience=inputs.audience,
        mode=MODES[inputs.mode]["display_name"],
        constraints=inputs.constraints or "(none)",
        current_output=current_output[:1500],
        session_history=format_session_history(iterations or []),
    )
    content, _usage = await client.generate(
        prompt=prompt,
        system=CHECK_INTENT_SYSTEM,
        temperature=0.3,
        max_tokens=512,
        model=model,
    )
    return content.strip()


async def run_ask_questions(
    client: OpenRouterClient,
    inputs: PMInput,
    current_output: str,
    iterations: list[Iteration] | None = None,
    model: str | None = None,
) -> list[str]:
    """Reverse Q&A (Ch1 S14) — AI asks the user clarifying questions to unblock progress."""
    prompt = ASK_QUESTIONS_PROMPT.format(
        objective=inputs.objective,
        audience=inputs.audience,
        mode=MODES[inputs.mode]["display_name"],
        constraints=inputs.constraints or "(none)",
        current_output=current_output[:1500],
        session_history=format_session_history(iterations or []),
    )
    try:
        result, _usage = await client.generate_json(
            prompt=prompt,
            system=ASK_QUESTIONS_SYSTEM,
            temperature=0.3,
            max_tokens=512,
            model=model,
        )
        if isinstance(result, list):
            return [str(q) for q in result[:3]]
        if isinstance(result, dict):
            for key in ("questions", "items"):
                if key in result and isinstance(result[key], list):
                    return [str(q) for q in result[key][:3]]
            for value in result.values():
                if isinstance(value, list) and len(value) > 0:
                    return [str(q) for q in value[:3]]
        logger.warning(f"Unexpected ask_questions format: {type(result)}")
        return []
    except Exception as e:
        logger.warning(f"Ask questions failed: {e}")
        return []
