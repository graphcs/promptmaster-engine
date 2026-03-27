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

    # User prompt: natural language with embedded anchoring
    # Book principle (Ch5 S9 / Ch8): weave context into flowing text, not label-heavy form dumps.
    # Three compact paragraphs: task → context → mode directive.
    parts = [inputs.objective]

    context_pieces = []
    if inputs.audience:
        context_pieces.append(f"Audience: {inputs.audience}")
    if inputs.constraints.strip():
        context_pieces.append(f"Constraints: {inputs.constraints}")
    if inputs.output_format.strip():
        context_pieces.append(f"Format: {inputs.output_format}")
    if context_pieces:
        parts.append(". ".join(context_pieces) + ".")

    parts.append(mode_config["user_directive"])

    user_prompt = "\n\n".join(parts)

    return AssembledPrompt(
        system_prompt=system_prompt,
        user_prompt=user_prompt.strip(),
        scaffolding_notes=mode_config["scaffolding"],
    )
