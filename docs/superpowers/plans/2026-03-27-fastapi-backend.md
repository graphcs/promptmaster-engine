# FastAPI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a FastAPI backend that wraps the existing PromptMaster Python engine as a REST API, enabling the Next.js frontend migration.

**Architecture:** The backend is a stateless LLM proxy. It imports the existing `promptmaster/` engine modules unchanged and exposes them as HTTP endpoints. No user data, no Supabase access — only `OPENROUTER_API_KEY`. The frontend calls these endpoints directly from the browser; CORS is configured for the Vercel domain.

**Tech Stack:** FastAPI, uvicorn, pydantic (already used by engine), httpx (already used by engine), python-dotenv

---

## File Structure

```
backend/
├── main.py              # FastAPI app, CORS, lifespan (client lifecycle)
├── deps.py              # Dependency injection: get_client() provides OpenRouterClient
├── routers/
│   ├── __init__.py
│   ├── engine.py        # 7 POST endpoints for LLM operations
│   └── meta.py          # GET /api/modes, GET /api/models
├── promptmaster/        # COPIED from root promptmaster/ (engine modules only)
│   ├── __init__.py
│   ├── schemas.py
│   ├── modes.py
│   ├── prompt_builder.py
│   ├── engine.py
│   ├── evaluator.py
│   ├── realigner.py
│   ├── guidance.py
│   └── llm_client.py
├── requirements.txt
├── Dockerfile
└── .env.example
```

**Not copied from root:** `db.py`, `auth.py`, `session_store.py`, `template_store.py`, `app.py` — these are Streamlit/Supabase specific and move to the Next.js frontend.

---

## Task 1: Project Setup + Engine Module Copy

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/promptmaster/__init__.py`
- Copy: `backend/promptmaster/schemas.py` (from `promptmaster/schemas.py`)
- Copy: `backend/promptmaster/modes.py` (from `promptmaster/modes.py`)
- Copy: `backend/promptmaster/prompt_builder.py` (from `promptmaster/prompt_builder.py`)
- Copy: `backend/promptmaster/engine.py` (from `promptmaster/engine.py`)
- Copy: `backend/promptmaster/evaluator.py` (from `promptmaster/evaluator.py`)
- Copy: `backend/promptmaster/realigner.py` (from `promptmaster/realigner.py`)
- Copy: `backend/promptmaster/guidance.py` (from `promptmaster/guidance.py`)
- Copy: `backend/promptmaster/llm_client.py` (from `promptmaster/llm_client.py`)

- [ ] **Step 1: Create backend directory structure**

```bash
mkdir -p backend/routers backend/promptmaster
```

- [ ] **Step 2: Create requirements.txt**

Write to `backend/requirements.txt`:
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
httpx>=0.25.0
pydantic>=2.0.0
python-dotenv>=1.0.0
```

- [ ] **Step 3: Create .env.example**

Write to `backend/.env.example`:
```
OPENROUTER_API_KEY=your-openrouter-api-key-here
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

- [ ] **Step 4: Copy engine modules**

```bash
cp promptmaster/__init__.py backend/promptmaster/__init__.py
cp promptmaster/schemas.py backend/promptmaster/schemas.py
cp promptmaster/modes.py backend/promptmaster/modes.py
cp promptmaster/prompt_builder.py backend/promptmaster/prompt_builder.py
cp promptmaster/engine.py backend/promptmaster/engine.py
cp promptmaster/evaluator.py backend/promptmaster/evaluator.py
cp promptmaster/realigner.py backend/promptmaster/realigner.py
cp promptmaster/guidance.py backend/promptmaster/guidance.py
cp promptmaster/llm_client.py backend/promptmaster/llm_client.py
```

- [ ] **Step 5: Create routers/__init__.py**

Write empty `backend/routers/__init__.py`:
```python
```

- [ ] **Step 6: Verify imports work**

```bash
cd backend && python -c "from promptmaster.schemas import PMInput, Iteration, EvaluationResult, AssembledPrompt, Session; print('schemas OK')"
cd backend && python -c "from promptmaster.modes import MODES; print(f'modes OK: {len(MODES)} modes')"
cd backend && python -c "from promptmaster.prompt_builder import build_prompt; print('prompt_builder OK')"
cd backend && python -c "from promptmaster.llm_client import OpenRouterClient, OpenRouterError; print('llm_client OK')"
```

Expected: All print "OK" with no import errors.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend with engine modules"
```

---

## Task 2: FastAPI App + Dependency Injection

**Files:**
- Create: `backend/deps.py`
- Create: `backend/main.py`

- [ ] **Step 1: Create deps.py**

Write to `backend/deps.py`:
```python
"""Dependency injection for FastAPI endpoints."""

import os
from contextlib import asynccontextmanager
from promptmaster.llm_client import OpenRouterClient

_client: OpenRouterClient | None = None


def get_api_key() -> str:
    """Get the OpenRouter API key from environment."""
    key = os.getenv("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is required")
    return key


@asynccontextmanager
async def lifespan_client():
    """Manage a shared OpenRouterClient across the app lifespan."""
    global _client
    _client = OpenRouterClient(api_key=get_api_key())
    yield
    await _client.close()
    _client = None


def get_client() -> OpenRouterClient:
    """FastAPI dependency: return the shared OpenRouterClient."""
    if _client is None:
        raise RuntimeError("OpenRouterClient not initialized")
    return _client
```

- [ ] **Step 2: Create main.py**

Write to `backend/main.py`:
```python
"""FastAPI backend for PromptMaster Engine."""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from deps import lifespan_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan: start/stop shared OpenRouterClient."""
    async with lifespan_client():
        logger.info("PromptMaster backend started")
        yield
    logger.info("PromptMaster backend stopped")


app = FastAPI(
    title="PromptMaster Engine API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Verify the app starts**

```bash
cd backend && OPENROUTER_API_KEY=test uvicorn main:app --host 0.0.0.0 --port 8000 &
sleep 2
curl -s http://localhost:8000/api/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/deps.py
git commit -m "feat: FastAPI app with CORS and health check"
```

---

## Task 3: Meta Endpoints (GET /api/modes, GET /api/models)

**Files:**
- Create: `backend/routers/meta.py`
- Modify: `backend/main.py` (add router)

- [ ] **Step 1: Create routers/meta.py**

Write to `backend/routers/meta.py`:
```python
"""Meta endpoints: modes and model list."""

from fastapi import APIRouter
from promptmaster.modes import MODES
from promptmaster.llm_client import OpenRouterClient, OpenRouterError

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/modes")
async def get_modes():
    """Return available modes with display info only (no scaffolding)."""
    return {
        key: {
            "display_name": mode["display_name"],
            "tagline": mode["tagline"],
            "tone": mode["tone"],
        }
        for key, mode in MODES.items()
    }


@router.get("/models")
async def get_models():
    """Fetch available text models from OpenRouter."""
    try:
        models = await OpenRouterClient.fetch_text_models()
        return {"models": models}
    except OpenRouterError as e:
        return {"models": [], "error": str(e)}
```

- [ ] **Step 2: Register router in main.py**

Add to `backend/main.py` after the CORS middleware block:
```python
from routers.meta import router as meta_router

app.include_router(meta_router)
```

- [ ] **Step 3: Verify endpoints respond**

```bash
cd backend && OPENROUTER_API_KEY=test uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/modes | python -m json.tool | head -20
kill %1
```

Expected: JSON with 8 mode keys, each having `display_name`, `tagline`, `tone`.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/meta.py backend/main.py
git commit -m "feat: GET /api/modes and GET /api/models endpoints"
```

---

## Task 4: Engine Endpoints (build-prompt, run-iteration)

**Files:**
- Create: `backend/routers/engine.py`
- Modify: `backend/main.py` (add router)

- [ ] **Step 1: Create request/response models and the two core endpoints**

Write to `backend/routers/engine.py`:
```python
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
```

- [ ] **Step 2: Register router in main.py**

Add to `backend/main.py` after the meta router registration:
```python
from routers.engine import router as engine_router

app.include_router(engine_router)
```

- [ ] **Step 3: Verify /api/build-prompt works**

```bash
cd backend && OPENROUTER_API_KEY=test uvicorn main:app --port 8000 &
sleep 2
curl -s -X POST http://localhost:8000/api/build-prompt \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"objective": "Design a REST API", "mode": "architect"}}' \
  | python -m json.tool | head -10
kill %1
```

Expected: JSON with `system_prompt`, `user_prompt`, `scaffolding_notes` fields.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/engine.py backend/main.py
git commit -m "feat: POST /api/build-prompt and /api/run-iteration endpoints"
```

---

## Task 5: Remaining Engine Endpoints

**Files:**
- Modify: `backend/routers/engine.py` (add 5 endpoints)

- [ ] **Step 1: Add realignment endpoint**

Append to `backend/routers/engine.py`:
```python
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
```

- [ ] **Step 2: Add self-audit endpoint**

Append to `backend/routers/engine.py`:
```python
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
```

- [ ] **Step 3: Add hard-reset-lessons endpoint**

Append to `backend/routers/engine.py`:
```python
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
```

- [ ] **Step 4: Add format-summary and export-session endpoints**

Append to `backend/routers/engine.py`:
```python
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
```

- [ ] **Step 5: Verify all endpoints are registered**

```bash
cd backend && OPENROUTER_API_KEY=test uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/openapi.json | python -c "
import sys, json
spec = json.load(sys.stdin)
for path in sorted(spec['paths']):
    methods = ', '.join(spec['paths'][path].keys()).upper()
    print(f'{methods} {path}')
"
kill %1
```

Expected output:
```
GET /api/health
GET /api/models
GET /api/modes
POST /api/build-prompt
POST /api/build-realignment
POST /api/export-session
POST /api/format-summary
POST /api/hard-reset-lessons
POST /api/run-iteration
POST /api/run-self-audit
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/engine.py
git commit -m "feat: realignment, self-audit, hard-reset, summary, export endpoints"
```

---

## Task 6: Dockerfile + Production Config

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Write to `backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create .dockerignore**

Write to `backend/.dockerignore`:
```
__pycache__
*.pyc
.env
.git
```

- [ ] **Step 3: Verify Docker build succeeds**

```bash
cd backend && docker build -t promptmaster-api . 2>&1 | tail -5
```

Expected: "Successfully built" or "Successfully tagged promptmaster-api:latest"

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: Dockerfile for Render deployment"
```

---

## Task 7: Live Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start the server with real API key**

```bash
cd backend && uvicorn main:app --port 8000 &
sleep 2
```

- [ ] **Step 2: Test build-prompt (no LLM call)**

```bash
curl -s -X POST http://localhost:8000/api/build-prompt \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"objective": "Design a project plan for a mobile app", "audience": "Executive", "constraints": "Budget under 50K, 3-month timeline", "output_format": "Numbered list", "mode": "architect"}}' \
  | python -m json.tool
```

Expected: JSON with `system_prompt` containing "Architect Mode", `user_prompt` containing the objective, and `scaffolding_notes`.

- [ ] **Step 3: Test run-iteration (3 LLM calls — requires real API key)**

```bash
curl -s -X POST http://localhost:8000/api/run-iteration \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {"objective": "Design a project plan for a mobile app", "audience": "Executive", "constraints": "Budget under 50K", "output_format": "Numbered list", "mode": "architect"},
    "prompt_text": "Design a project plan for a mobile app. Audience: Executive. Constraints: Budget under 50K. Format: Numbered list. Map the structure first.",
    "system_text": "You are now in Architect Mode.",
    "iteration_number": 1
  }' | python -m json.tool | head -30
```

Expected: JSON with `iteration` object (containing `output`, `evaluation` with scores) and `suggestions` array.

- [ ] **Step 4: Test modes endpoint**

```bash
curl -s http://localhost:8000/api/modes | python -m json.tool
```

Expected: 8 mode entries with `display_name`, `tagline`, `tone` (no `scaffolding` or `system_preamble` exposed).

- [ ] **Step 5: Stop the server**

```bash
kill %1
```

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A && git diff --cached --stat
# Only commit if there are changes
git commit -m "fix: integration test fixes" || echo "No fixes needed"
```

---

## Summary

| Endpoint | Method | LLM Calls | Status |
|----------|--------|-----------|--------|
| `/api/health` | GET | 0 | Task 2 |
| `/api/modes` | GET | 0 | Task 3 |
| `/api/models` | GET | 0 (API call) | Task 3 |
| `/api/build-prompt` | POST | 0 | Task 4 |
| `/api/run-iteration` | POST | 3 | Task 4 |
| `/api/build-realignment` | POST | 1-2 | Task 5 |
| `/api/run-self-audit` | POST | 1 | Task 5 |
| `/api/hard-reset-lessons` | POST | 1 | Task 5 |
| `/api/format-summary` | POST | 0 | Task 5 |
| `/api/export-session` | POST | 0 | Task 5 |
