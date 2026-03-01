"""Prompt assembly for PromptMaster Engine.

Implements:
- Mode Locking (system prompt sets identity)
- Anchoring (goal anchors, role anchors, format anchors)
- Invisible Scaffolding (internal instructions)
"""

from .modes import MODES
from .schemas import PMInput, AssembledPrompt


def build_prompt(inputs: PMInput) -> AssembledPrompt:
    """Assemble an optimized prompt from user inputs and selected mode.

    The assembled prompt has two layers (Prompt Stack concept from Ch5 S6):
    1. System prompt: mode lock + tone guidance + invisible scaffolding
    2. User prompt: objective + audience + constraints with anchoring
    """
    mode_config = MODES[inputs.mode]

    # System prompt: mode lock + scaffolding
    system_prompt = (
        f"{mode_config['system_preamble']}\n\n"
        f"TONE GUIDANCE: {mode_config['tone']}\n\n"
        f"{mode_config['scaffolding']}"
    )

    # User prompt with anchoring
    user_prompt_parts = [
        f"OBJECTIVE: {inputs.objective}",
    ]

    if inputs.audience:
        user_prompt_parts.append(f"AUDIENCE: {inputs.audience}")

    if inputs.constraints.strip():
        user_prompt_parts.append(f"CONSTRAINTS: {inputs.constraints}")

    user_prompt_parts.extend([
        "",
        f"You are operating in {mode_config['display_name']} Mode.",
        f"Deliver your response aligned with the objective above.",
        f"Address the specified audience: {inputs.audience}.",
    ])

    user_prompt = "\n".join(user_prompt_parts)

    return AssembledPrompt(
        system_prompt=system_prompt,
        user_prompt=user_prompt.strip(),
        scaffolding_notes=mode_config["scaffolding"],
    )
