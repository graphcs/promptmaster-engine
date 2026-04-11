"""Engine endpoints: prompt building, iteration, realignment, audit."""

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from promptmaster.schemas import PMInput, AssembledPrompt, EvaluationResult
from promptmaster.prompt_builder import build_prompt
from promptmaster.engine import (
    generate,
    format_session_summary,
    export_session_json,
    generate_hard_reset_lessons,
    run_self_audit,
)
from promptmaster.evaluator import evaluate_output
from promptmaster.schemas import Iteration
from promptmaster.realigner import build_realignment_prompt
from promptmaster.guidance import generate_suggestions
from promptmaster.flow_triggers import (
    build_flow_trigger_prompt,
    run_check_intent,
    run_ask_questions,
    FlowTriggerType,
    FlowInspectType,
)
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


class FlowTriggerRequest(BaseModel):
    inputs: PMInput
    current_output: str
    trigger: FlowTriggerType
    iteration_number: int
    evaluation: EvaluationResult | None = None
    model: str = ""


class FlowInspectRequest(BaseModel):
    inputs: PMInput
    current_output: str
    inspection: FlowInspectType
    model: str = ""


class FlowInspectResponse(BaseModel):
    kind: FlowInspectType
    text: str | None = None
    questions: list[str] | None = None


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
    """Run one generate-evaluate cycle. Generate first, then evaluate + suggestions in parallel."""
    try:
        model = req.model or None

        # Step 1: Generate output (must complete first)
        output = await generate(
            client=client,
            prompt_text=req.prompt_text,
            system_text=req.system_text,
            model=model,
        )

        # Step 2: Run evaluation and suggestions in parallel
        eval_task = evaluate_output(client, req.inputs, output, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            model=model,
        )
        evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=req.prompt_text,
            system_prompt_used=req.system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/flow-trigger")
async def api_flow_trigger(
    req: FlowTriggerRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run a one-click flow trigger (Challenge, Self-Audit, Drift Alert, Refine).

    Builds a pre-configured prompt from the book's Ch1 S13-S14 techniques,
    then runs the full pipeline: generate -> (evaluate || suggestions).
    """
    try:
        model = req.model or None

        # Build the flow trigger prompt
        system_text, prompt_text = build_flow_trigger_prompt(
            inputs=req.inputs,
            current_output=req.current_output,
            trigger=req.trigger,
            evaluation=req.evaluation,
        )

        # Generate
        output = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )

        # Diagnostic triggers (challenge, self_audit) produce critiques, not
        # candidate answers. Scoring them against the original objective yields
        # misleading Low scores, so skip the eval pipeline for them.
        is_diagnostic = req.trigger in ("challenge", "self_audit")

        if is_diagnostic:
            iteration = Iteration(
                iteration_number=req.iteration_number,
                prompt_sent=prompt_text,
                system_prompt_used=system_text,
                output=output,
                mode=req.inputs.mode,
                evaluation=None,
            )
            return RunIterationResponse(iteration=iteration, suggestions=[])

        # Evaluate + suggestions in parallel
        eval_task = evaluate_output(client, req.inputs, output, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            model=model,
        )
        evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=prompt_text,
            system_prompt_used=system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/flow-inspect")
async def api_flow_inspect(
    req: FlowInspectRequest,
    client: OpenRouterClient = Depends(get_client),
) -> FlowInspectResponse:
    """Lightweight inspection calls: Check Intent (Shadow Prompt) or Ask Questions (Reverse Q&A).

    No iteration is created — just returns insight text or a list of questions.
    """
    try:
        model = req.model or None
        if req.inspection == "check_intent":
            text = await run_check_intent(
                client=client,
                inputs=req.inputs,
                current_output=req.current_output,
                model=model,
            )
            return FlowInspectResponse(kind="check_intent", text=text)
        if req.inspection == "ask_questions":
            questions = await run_ask_questions(
                client=client,
                inputs=req.inputs,
                current_output=req.current_output,
                model=model,
            )
            return FlowInspectResponse(kind="ask_questions", questions=questions)
        raise HTTPException(status_code=400, detail=f"Unknown inspection type: {req.inspection}")
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/build-realignment")
async def api_build_realignment(
    req: RealignmentRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RealignmentResponse:
    """Build a realignment prompt. 1-2 LLM calls."""
    try:
        prompt = await build_realignment_prompt(
            client=client,
            inputs=req.inputs,
            evaluation=req.evaluation,
            model=req.model or None,
        )
        return RealignmentResponse(realignment_prompt=prompt)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/run-self-audit")
async def api_run_self_audit(
    req: AuditRequest,
    client: OpenRouterClient = Depends(get_client),
) -> dict:
    """Run Cold Critic self-audit. 1 LLM call."""
    try:
        audit = await run_self_audit(
            client=client,
            inputs=req.inputs,
            iterations=req.iterations,
            model=req.model or None,
        )
        return {"audit": audit}
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/hard-reset-lessons")
async def api_hard_reset_lessons(
    req: AuditRequest,
    client: OpenRouterClient = Depends(get_client),
) -> dict:
    """Generate lessons before hard reset. 1 LLM call."""
    try:
        lessons = await generate_hard_reset_lessons(
            client=client,
            inputs=req.inputs,
            iterations=req.iterations,
            model=req.model or None,
        )
        return {"lessons": lessons}
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/format-summary")
async def api_format_summary(req: SummaryRequest) -> dict:
    """Generate copyable session summary text. No LLM call."""
    summary = format_session_summary(req.inputs, req.iterations)
    return {"summary": summary}


@router.post("/export-session")
async def api_export_session(req: ExportRequest) -> dict:
    """Export session as JSON. No LLM call."""
    json_str = export_session_json(req.inputs, req.iterations, model=req.model)
    return {"json": json_str}
