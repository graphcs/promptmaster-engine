"""Smart Setup — LLM-driven suggestion of mode + audience + constraints + format.

Given a user's objective, returns a SetupSuggestion that pre-fills the Input
phase. Defensive parsing keeps the call resilient to malformed or partial
LLM responses — invalid mode falls back to 'architect', missing fields
default to safe values.
"""

from __future__ import annotations

import logging

from .llm_client import OpenRouterClient
from .schemas import ModeType, SetupRationale, SetupSuggestion

logger = logging.getLogger(__name__)


_VALID_MODES = {
    "architect", "critic", "clarity", "coach",
    "therapist", "cold_critic", "analyst",
}


SETUP_SUGGESTER_SYSTEM = (
    "You are the Smart Setup layer of PromptMaster. Given a user's objective, "
    "recommend the most fitting mode, audience, constraints, and output format "
    "to produce a high-quality structured response.\n\n"
    "Available modes:\n"
    "- architect: Structure, systems, frameworks\n"
    "- critic: Find weak points and contradictions\n"
    "- clarity: Make complex ideas simple and crisp\n"
    "- coach: Encouraging, action-oriented\n"
    "- therapist: Reflective, empathetic, exploratory\n"
    "- cold_critic: Brutally objective audit, no encouragement\n"
    "- analyst: Evidence-based, data-aware reasoning\n"
    "- custom: Reserved for user-defined modes — do NOT recommend custom\n\n"
    "Available audiences (suggest the closest match or a short free-text "
    "tailored to the objective):\n"
    "General, Technical, Executive, Academic, Student.\n\n"
    "Constraints: a short paragraph describing scope limits, focus areas, or "
    "deadlines. Be specific. If none apply, return an empty string.\n\n"
    "Output format: a short phrase describing structure (e.g., \"Numbered list "
    "with 3-5 items\", \"Two-section memo: Findings / Recommendations\", "
    "\"Markdown table\"). If none clearly apply, return \"Free-form prose\".\n\n"
    "Rationale: one line per field (≤80 chars) explaining why you picked it. "
    "Be brief and useful, not generic.\n\n"
    "Return JSON only."
)


def build_setup_prompt(objective: str) -> str:
    """Build the user prompt for the setup-suggestion LLM call."""
    return (
        f"Objective: {objective}\n\n"
        "Recommend a setup. Return JSON in this exact shape:\n"
        "{\n"
        '  "mode": "architect|critic|clarity|coach|therapist|cold_critic|analyst",\n'
        '  "audience": "...",\n'
        '  "constraints": "...",\n'
        '  "output_format": "...",\n'
        '  "rationale": {\n'
        '    "mode": "...",\n'
        '    "audience": "...",\n'
        '    "constraints": "...",\n'
        '    "output_format": "..."\n'
        "  }\n"
        "}"
    )


async def suggest_setup(
    client: OpenRouterClient,
    model: str | None,
    objective: str,
) -> SetupSuggestion:
    """Run the Smart Setup LLM call. Defensive on missing/invalid fields."""
    prompt = build_setup_prompt(objective)

    try:
        result, _usage = await client.generate_json(
            prompt=prompt,
            system=SETUP_SUGGESTER_SYSTEM,
            temperature=0.3,
            max_tokens=512,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Setup suggestion LLM call failed: {e}")
        return SetupSuggestion(
            mode="architect",
            audience="General",
            constraints="",
            output_format="",
            rationale=SetupRationale(),
        )

    raw_mode = result.get("mode", "architect")
    mode: ModeType = raw_mode if raw_mode in _VALID_MODES else "architect"
    if raw_mode not in _VALID_MODES:
        logger.warning(f"Setup suggestion returned invalid mode {raw_mode!r}, falling back to architect")

    rationale_raw = result.get("rationale") or {}
    if not isinstance(rationale_raw, dict):
        rationale_raw = {}

    return SetupSuggestion(
        mode=mode,
        audience=result.get("audience") or "General",
        constraints=result.get("constraints") or "",
        output_format=result.get("output_format") or "",
        rationale=SetupRationale(
            mode=rationale_raw.get("mode") or "",
            audience=rationale_raw.get("audience") or "",
            constraints=rationale_raw.get("constraints") or "",
            output_format=rationale_raw.get("output_format") or "",
        ),
    )
