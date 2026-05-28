"""Long-form document orchestration: detect + outline + section helpers.

Pure functions and helpers used by routers/long_form.py.
Reuses promptmaster.continuity for snapshot regeneration.
"""

from __future__ import annotations

import logging

from .llm_client import OpenRouterClient
from .schemas import (
    ContinuitySnapshot,
    DetectLongFormResponse,
    OutlineSection,
    PMInput,
)

logger = logging.getLogger(__name__)


_DETECT_SYSTEM = (
    "You are a classifier. Given a user's writing request, decide if it is a "
    "long-form document (multi-section deliverable, paper, report, book chapter, "
    "BRD, white paper, proposal of more than a couple pages). Return JSON only."
)


def build_detect_prompt(inputs: PMInput) -> tuple[str, str]:
    """Build (system, user) prompts for the long-form classifier."""
    user = (
        f"Objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        "Return JSON with fields:\n"
        "- is_long_form: true if this needs multiple sections / pages; false for short asks\n"
        "- suggested_section_count: integer estimate of section count if long-form, else 0\n"
        "- reason: one short sentence explaining the call"
    )
    return _DETECT_SYSTEM, user


async def detect_long_form(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
) -> DetectLongFormResponse:
    """Classify whether the request is long-form. Falls back to negative on any error."""
    system, user = build_detect_prompt(inputs)
    try:
        result, _usage = await client.generate_json(
            prompt=user,
            system=system,
            temperature=0.1,
            max_tokens=200,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Long-form detect failed, defaulting to negative: {e}")
        return DetectLongFormResponse(is_long_form=False, suggested_section_count=0, reason="")

    return DetectLongFormResponse(
        is_long_form=bool(result.get("is_long_form", False)),
        suggested_section_count=int(result.get("suggested_section_count", 0) or 0),
        reason=str(result.get("reason", "")),
    )
