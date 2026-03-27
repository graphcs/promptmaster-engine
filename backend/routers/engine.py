"""Engine endpoints: prompt building, iteration, realignment, audit."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from promptmaster.schemas import PMInput, AssembledPrompt, Iteration, EvaluationResult
from promptmaster.prompt_builder import build_prompt
from promptmaster.engine import (
    run_iteration,
    format_session_summary,
    export_session_json,
    generate_hard_reset_lessons,
    run_self_audit,
)
from promptmaster.realigner import build_realignment_prompt
from promptmaster.guidance import generate_suggestions
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from deps import get_client

router = APIRouter(prefix="/api", tags=["engine"])


# --- Request/Response Models ---

class BuildPromptRequest(BaseModel):
    inputs: PMInput


class RunIterationRequest(BaseModel):
    inputs: PMInput
    prompt_text: str
    system_text: str
    iteration_number: int
    model: str = ""


class RunIterationResponse(BaseModel):
    iteration: Iteration
    suggestions: list[str]


class RealignmentRequest(BaseModel):
    inputs: PMInput
    evaluation: EvaluationResult
    model: str = ""


class RealignmentResponse(BaseModel):
    realignment_prompt: str


class AuditRequest(BaseModel):
    inputs: PMInput
    iterations: list[Iteration]
    model: str = ""


class SummaryRequest(BaseModel):
    inputs: PMInput
    iterations: list[Iteration]


class ExportRequest(BaseModel):
    inputs: PMInput
    iterations: list[Iteration]
    model: str = ""


# --- Endpoints ---

@router.post("/build-prompt")
async def api_build_prompt(req: BuildPromptRequest) -> AssembledPrompt:
    """Assemble an optimized prompt from user inputs. No LLM call."""
    return build_prompt(req.inputs)


@router.post("/run-iteration")
async def api_run_iteration(
    req: RunIterationRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run one generate-evaluate cycle. 3 LLM calls: generate + evaluate + suggestions."""
    try:
        iteration = await run_iteration(
            client=client,
            inputs=req.inputs,
            prompt_text=req.prompt_text,
            system_text=req.system_text,
            iteration_number=req.iteration_number,
            model=req.model or None,
        )
        suggestions = await generate_suggestions(
            client=client,
            inputs=req.inputs,
            evaluation=iteration.evaluation,
            model=req.model or None,
        )
        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
