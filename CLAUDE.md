# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PromptMaster Engine is a structured prompt engineering system with mode-locked prompting, multi-dimensional evaluation, and intelligent realignment. It uses OpenRouter as its LLM backend and Streamlit for the UI.

## Commands

```bash
# Install dependencies (uses uv package manager)
uv pip install -e .

# Run the application
streamlit run app.py

# Environment setup - copy .env.example to .env and set OPENROUTER_API_KEY
```

There are no test or lint commands configured yet.

## Architecture

The system runs a five-phase loop: **Input → Review → Output/Evaluation → Realignment → Summary**.

```
User Input (app.py)
  → prompt_builder.build_prompt() assembles system+user prompts with mode anchoring
    → engine.run_iteration() orchestrates generate + evaluate cycle
      → llm_client.generate() calls OpenRouter API
      → evaluator.evaluate_output() scores alignment/drift/clarity via separate LLM call
        → If alignment=Low or drift=High: realigner.build_realignment_prompt()
          → Re-runs iteration with corrective prompt
```

**Key modules in `promptmaster/`:**
- `schemas.py` — Pydantic models: `PMInput`, `AssembledPrompt`, `EvaluationResult`, `Iteration`, `DimensionScore`
- `modes.py` — Four modes (Architect, Critic, Clarity, Coach), each with system preamble, tone, and invisible scaffolding
- `prompt_builder.py` — Two-layer prompt assembly (system prompt + user prompt with anchoring)
- `llm_client.py` — `OpenRouterClient` async httpx client with retry/backoff and JSON repair
- `evaluator.py` — Three-dimension scoring (Alignment, Drift, Clarity) as High/Medium/Low via JSON-mode LLM call
- `realigner.py` — Hybrid realignment: template skeleton + LLM-assisted corrective instruction
- `engine.py` — Orchestrator tying generate, evaluate, and format_session_summary together
- `app.py` — Streamlit UI with five-phase interaction flow and session state management

## Key Design Patterns

- **Mode Locking**: System prompt pins AI persona to prevent mode drift during iteration
- **Anchoring**: Goal/role/format anchors embedded in prompts prevent semantic drift
- **Invisible Scaffolding**: Backend-only instructions guide LLM behavior without user visibility
- **Hybrid Realignment**: Template-based re-anchoring combined with LLM-generated corrective instructions

## LLM Configuration

- API: OpenRouter REST API (`https://openrouter.ai/api/v1`)
- Default model: `openai/gpt-5.4`
- Temperatures: 0.7 (generation), 0.3 (evaluation), 0.4 (realignment correction), 0.0 (JSON repair)
- Timeout: 120s, retries: 3 with exponential backoff on 429/5xx

## Git Conventions

- Branch `master` is the working branch; `main` is the PR target
- Commit messages use conventional format: `feat:`, `fix:`, etc.
