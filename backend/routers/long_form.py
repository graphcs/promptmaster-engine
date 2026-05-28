"""Long-form document orchestration endpoints.

Four endpoints (all stateless; orchestration loop runs on the frontend):
- POST /api/detect-long-form        — classifier (1 LLM call)
- POST /api/generate-outline        — outline generator (1 LLM call)
- POST /api/generate-section        — single section + snapshot (2 LLM calls)
- POST /api/finalize-long-form      — eval + suggestions + summary on merged content (3 parallel calls)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.long_form import (
    detect_long_form,
    generate_outline,
    generate_section,
)
from promptmaster.schemas import (
    ContinuitySnapshot,
    DetectLongFormResponse,
    GenerateOutlineResponse,
    GenerateSectionResponse,
    Iteration,
    OutlineSection,
    PMInput,
)
from promptmaster.session_context import _label_trigger
from routers._pipeline import build_iteration_with_full_pipeline

# Reuse the existing IterationFromConversationResponse shape
from routers.conversation import IterationFromConversationResponse

router = APIRouter(prefix="/api", tags=["long_form"])


# -------- request bodies --------

class DetectRequest(BaseModel):
    inputs: PMInput
    model: str = ""


class GenerateOutlineRequest(BaseModel):
    inputs: PMInput
    suggested_section_count: int = 8
    model: str = ""


class GenerateSectionRequest(BaseModel):
    inputs: PMInput
    outline: list[OutlineSection]
    section_index: int
    prior_snapshot: ContinuitySnapshot | None = None
    prev_section_content: str = ""
    model: str = ""


class FinalizeLongFormRequest(BaseModel):
    inputs: PMInput
    merged_content: str
    outline: list[OutlineSection]
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


# -------- endpoints --------

@router.post("/detect-long-form", response_model=DetectLongFormResponse)
async def api_detect_long_form(
    req: DetectRequest,
    client: OpenRouterClient = Depends(get_client),
):
    try:
        return await detect_long_form(client=client, model=req.model or None, inputs=req.inputs)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/generate-outline", response_model=GenerateOutlineResponse)
async def api_generate_outline(
    req: GenerateOutlineRequest,
    client: OpenRouterClient = Depends(get_client),
):
    try:
        outline = await generate_outline(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            suggested_section_count=req.suggested_section_count,
        )
        return GenerateOutlineResponse(outline=outline)
    except (OpenRouterError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/generate-section", response_model=GenerateSectionResponse)
async def api_generate_section(
    req: GenerateSectionRequest,
    client: OpenRouterClient = Depends(get_client),
):
    if req.section_index < 0 or req.section_index >= len(req.outline):
        raise HTTPException(status_code=400, detail=f"section_index {req.section_index} out of range")
    try:
        return await generate_section(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            outline=req.outline,
            section_index=req.section_index,
            prior_snapshot=req.prior_snapshot,
            prev_section_content=req.prev_section_content,
        )
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/finalize-long-form", response_model=IterationFromConversationResponse)
async def api_finalize_long_form(
    req: FinalizeLongFormRequest,
    client: OpenRouterClient = Depends(get_client),
):
    """Run eval + suggestions + summary on the pre-generated merged document.

    The merged content comes from the frontend (sum of all section.content).
    No regeneration here — just the pipeline pass.
    """
    if not req.merged_content.strip():
        raise HTTPException(status_code=400, detail="merged_content is empty")

    # Synthetic system/prompt text for the iteration record
    system_text = f"Long-form document with {len(req.outline)} sections."
    prompt_text = req.inputs.objective

    # active_iteration must exist for build_iteration_with_full_pipeline; use the last
    # iteration in history if any, else a synthetic initial iteration so the summary call
    # has a coherent "before" state to compare against.
    active = req.iteration_history[-1] if req.iteration_history else Iteration(
        iteration_number=1,
        prompt_sent="",
        system_prompt_used="",
        output="(no prior iteration — first long-form finalize)",
        mode=req.inputs.mode,
        evaluation=None,
        trigger_source="initial",
    )

    try:
        iteration, suggestions = await build_iteration_with_full_pipeline(
            client=client,
            model=req.model or None,
            inputs=req.inputs,
            output=req.merged_content,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="long_form_finalize",
            active_iteration=active,
            chat_history=[],
            iteration_history=req.iteration_history,
            user_action_label=_label_trigger("long_form_finalize"),
            finish_reason="stop",
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
