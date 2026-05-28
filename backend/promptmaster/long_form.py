"""Long-form document orchestration: detect + outline + section helpers.

Pure functions and helpers used by routers/long_form.py.
Reuses promptmaster.continuity for snapshot regeneration.
"""

from __future__ import annotations

import logging
import uuid

from .continuity import generate_continuity_snapshot
from .conversation import _shared_system
from .llm_client import OpenRouterClient
from .schemas import (
    ContinuitySnapshot,
    DetectLongFormResponse,
    GenerateSectionResponse,
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


_OUTLINE_SYSTEM = (
    "You design clear, well-scoped outlines for long-form documents. "
    "Each section title is concrete and non-overlapping. Each abstract is a "
    "single sentence describing what that section covers. Return JSON only."
)


def build_outline_prompt(inputs: PMInput, suggested_section_count: int) -> tuple[str, str]:
    """Build (system, user) prompts for outline generation."""
    user = (
        f"Objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n"
        f"Target section count: {suggested_section_count} (use this as a guide; "
        "adjust if the objective genuinely needs more or fewer).\n\n"
        "Return JSON with one field:\n"
        '- outline: array of {"title": string, "abstract": string}\n\n'
        "Each abstract must be ONE short sentence (≤20 words) describing what that "
        "section will cover. Titles must be concrete and non-overlapping."
    )
    return _OUTLINE_SYSTEM, user


async def generate_outline(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    suggested_section_count: int,
) -> list[OutlineSection]:
    """Generate an outline. Returns OutlineSection[] with auto-assigned ids and default fields."""
    system, user = build_outline_prompt(inputs, suggested_section_count)
    result, _usage = await client.generate_json(
        prompt=user,
        system=system,
        temperature=0.4,
        max_tokens=2048,
        model=model,
    )
    raw_outline = result.get("outline")
    if not isinstance(raw_outline, list):
        raise ValueError(f"generate_outline expected list, got {type(raw_outline).__name__}")

    sections: list[OutlineSection] = []
    for raw in raw_outline:
        if not isinstance(raw, dict):
            continue
        sections.append(OutlineSection(
            id=str(uuid.uuid4()),
            title=str(raw.get("title", "Untitled")),
            abstract=str(raw.get("abstract", "")),
        ))
    return sections


def _format_outline_for_prompt(outline: list[OutlineSection], current_index: int) -> str:
    """Render outline as a numbered list with a marker on the section being written."""
    lines = []
    for i, section in enumerate(outline):
        marker = " ← WRITING NOW" if i == current_index else ""
        lines.append(f"{i + 1}. {section.title}{marker}\n   {section.abstract}")
    return "\n".join(lines)


def _format_snapshot_for_prompt(snapshot: ContinuitySnapshot | None) -> str:
    if snapshot is None:
        return "(no prior sections)"
    parts = []
    if snapshot.completed_topics:
        parts.append(f"Completed topics: {', '.join(snapshot.completed_topics)}")
    if snapshot.key_definitions:
        parts.append(f"Key definitions: {'; '.join(snapshot.key_definitions)}")
    if snapshot.next_topic_hint:
        parts.append(f"Next topic hint: {snapshot.next_topic_hint}")
    return "\n".join(parts) if parts else "(no prior context recorded)"


_SECTION_INSTRUCTION = (
    "LONG-FORM EXECUTION MODE: You are writing ONE section of a multi-section "
    "document. Write only the section indicated below. Do NOT outline, do NOT "
    "summarize what other sections will cover, do NOT include meta commentary. "
    "Write the actual prose for this section in the style and tone of the mode."
)


def build_section_prompt(
    inputs: PMInput,
    outline: list[OutlineSection],
    section_index: int,
    prior_snapshot: ContinuitySnapshot | None,
    prev_section_content: str,
) -> tuple[str, str]:
    """Build (system, user) prompts for one section's generation."""
    target = outline[section_index]
    outline_text = _format_outline_for_prompt(outline, section_index)
    snapshot_text = _format_snapshot_for_prompt(prior_snapshot)

    system = _shared_system(inputs, [], _SECTION_INSTRUCTION)
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"FULL OUTLINE:\n{outline_text}\n\n"
        f"PRIOR CONTEXT:\n{snapshot_text}\n\n"
        f"IMMEDIATELY PREVIOUS SECTION (for tonal/stylistic anchoring; do NOT repeat):\n"
        f"{prev_section_content or '(none — this is the first section)'}\n\n"
        f"WRITE SECTION {section_index + 1}: {target.title}\n"
        f"This section covers: {target.abstract}\n\n"
        "Write only the prose for this section. Do not include the section title or "
        "number; just the body content. Stay focused on what this section's abstract says."
    )
    return system, user


async def generate_section(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    outline: list[OutlineSection],
    section_index: int,
    prior_snapshot: ContinuitySnapshot | None,
    prev_section_content: str,
) -> GenerateSectionResponse:
    """Generate one section's content + regenerate the rolling continuity snapshot."""
    system, user = build_section_prompt(
        inputs=inputs,
        outline=outline,
        section_index=section_index,
        prior_snapshot=prior_snapshot,
        prev_section_content=prev_section_content,
    )

    content, _usage, finish_reason = await client.generate_with_meta(
        prompt=user,
        system=system,
        temperature=0.7,
        max_tokens=4096,
        model=model,
    )

    # Build cumulative "all completed sections + this one" for snapshot grounding
    completed_so_far = "\n\n".join(
        s.content for s in outline[:section_index] if s.status == "complete" and s.content
    )
    merged_for_snapshot = (completed_so_far + "\n\n" + content).strip() if completed_so_far else content

    new_snapshot = await generate_continuity_snapshot(
        client=client,
        model=model,
        inputs=inputs,
        previous_output=merged_for_snapshot,
    )

    return GenerateSectionResponse(
        content=content,
        finish_reason=finish_reason,
        new_snapshot=new_snapshot,
    )
