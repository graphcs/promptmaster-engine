"""Iteration summary generator.

Produces a 1-2 sentence summary of what changed between the previous and
new iteration. Called in parallel with eval and suggestions whenever a new
iteration is created.
"""

from __future__ import annotations

from .schemas import ChatMessage, Iteration, PMInput
from .llm_client import OpenRouterClient


_SUMMARY_SYSTEM = (
    "You produce extremely short summaries of how an answer changed between two "
    "versions, for users reviewing their work history. Plain English, 1-2 short "
    "sentences, past tense, no jargon. Describe what actually changed in substance "
    "— not the process the user took. Avoid filler words like 'updated' or "
    "'improved' on their own; say WHAT changed."
)


def _format_chat_history(chat_history: list[ChatMessage]) -> str:
    if not chat_history:
        return ""
    lines = []
    for m in chat_history:
        role = "User" if m.role == "user" else "Assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def build_summary_prompt(
    inputs: PMInput,
    prev_iter: Iteration,
    new_iter: Iteration,
    chat_history: list[ChatMessage],
    user_action: str,
) -> tuple[str, str]:
    """Build (system, user) prompt for the summary call."""
    chat_block = _format_chat_history(chat_history)
    chat_section = f"\n\nChat thread that led to the change:\n{chat_block}" if chat_block else ""

    user_prompt = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"User action: {user_action}\n"
        f"{chat_section}\n\n"
        f"PREVIOUS VERSION (#{prev_iter.iteration_number}):\n"
        f"{prev_iter.output}\n\n"
        f"NEW VERSION (#{new_iter.iteration_number}):\n"
        f"{new_iter.output}\n\n"
        "In 1-2 short sentences, summarize what the new version changed compared to "
        "the previous one. Be concrete. Do not mention the action or process."
    )
    return _SUMMARY_SYSTEM, user_prompt


async def generate_summary(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    prev_iter: Iteration,
    new_iter: Iteration,
    chat_history: list[ChatMessage] | None = None,
    user_action: str = "",
) -> str:
    """Run the LLM call to generate a brief summary of what changed."""
    system, user = build_summary_prompt(
        inputs=inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=chat_history or [],
        user_action=user_action,
    )
    text, _usage = await client.generate(
        prompt=user,
        system=system,
        model=model,
        max_tokens=120,
        temperature=0.3,
    )
    return text.strip()
