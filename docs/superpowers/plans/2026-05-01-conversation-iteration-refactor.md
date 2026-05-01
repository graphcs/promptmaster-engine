# Conversation / Iteration Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline conversation-bridge with a per-version side chat panel, with explicit "Apply to answer" and "Save as new version" actions, auto-generated iteration summaries, and Supabase persistence for chat messages.

**Architecture:** Two-action chat model — chat is fluid (1 LLM call per reply, no eval), explicit Apply/Save actions create new evaluated iterations. Per-version chat threads stored in a new `conversation_messages` Supabase table. Backend gets a new `conversation` router and a summaries helper invoked in parallel with eval/suggestions.

**Tech Stack:** Python 3.x + FastAPI + Pydantic 2 + httpx + pytest (new) on backend; Next.js 16 + Zustand + @supabase/ssr + Tailwind v4 + Material Symbols on frontend.

**Source spec:** `docs/superpowers/specs/2026-05-01-conversation-iteration-refactor-design.md`

---

## Pre-flight: Supabase Migration

The user must run this SQL in the Supabase dashboard *before* the chat panel can persist messages. Local development without authenticated users will work without it (chats stay in memory).

```sql
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  iteration_number int not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table conversation_messages enable row level security;

create policy "Users manage own conversation messages" on conversation_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index conversation_messages_lookup
  on conversation_messages(user_id, session_id, iteration_number, created_at);
```

---

## Task 1: Set up pytest infrastructure

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_smoke.py`

- [ ] **Step 1: Add pytest dependencies to `backend/requirements.txt`**

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
httpx>=0.25.0
pydantic>=2.0.0
python-dotenv>=1.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

- [ ] **Step 2: Install dependencies**

```bash
cd backend && pip install -r requirements.txt
```
Expected: pytest and pytest-asyncio installed.

- [ ] **Step 3: Create `backend/pytest.ini`**

```ini
[pytest]
testpaths = tests
asyncio_mode = auto
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

- [ ] **Step 4: Create `backend/tests/__init__.py`**

(Empty file — marks directory as a Python package.)

```python
```

- [ ] **Step 5: Create `backend/tests/conftest.py`**

```python
"""Shared pytest fixtures."""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from promptmaster.schemas import (
    DimensionScore,
    EvaluationResult,
    Iteration,
    PMInput,
)


@pytest.fixture
def basic_inputs() -> PMInput:
    """A valid PMInput for tests that need a default."""
    return PMInput(
        objective="Plan a launch strategy for an internal tool.",
        audience="Engineering leads",
        constraints="Two-week timeline",
        output_format="Numbered list",
        mode="architect",
    )


@pytest.fixture
def good_evaluation() -> EvaluationResult:
    return EvaluationResult(
        alignment=DimensionScore(score="High", explanation="Aligned."),
        clarity=DimensionScore(score="High", explanation="Clear."),
        drift=DimensionScore(score="Low", explanation="Focused."),
    )


@pytest.fixture
def basic_iteration(basic_inputs: PMInput, good_evaluation: EvaluationResult) -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="A concrete launch plan with five steps.",
        mode=basic_inputs.mode,
        evaluation=good_evaluation,
        trigger_source="initial",
    )


@pytest.fixture
def mock_client() -> AsyncMock:
    """Mock OpenRouterClient. Default: chat() returns a deterministic string."""
    client = AsyncMock()
    client.chat = AsyncMock(return_value="MOCK_LLM_REPLY")
    return client


@pytest.fixture
def llm_replies() -> dict[str, Any]:
    """Helper for tests that need to control multiple sequential LLM responses."""
    return {"queue": []}
```

- [ ] **Step 6: Create `backend/tests/test_smoke.py`**

```python
"""Smoke test — verifies pytest infrastructure works."""

from promptmaster.schemas import PMInput


def test_pytest_runs():
    assert 1 + 1 == 2


def test_pmininput_loads(basic_inputs: PMInput):
    assert basic_inputs.mode == "architect"
    assert "launch" in basic_inputs.objective.lower()
```

- [ ] **Step 7: Run tests to verify infrastructure**

```bash
cd backend && pytest -v
```
Expected: 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/tests/
git commit -m "test(backend): set up pytest infrastructure with shared fixtures"
```

---

## Task 2: Extend schemas — `Iteration.summary` + `ChatMessage` + trigger labels

**Files:**
- Modify: `backend/promptmaster/schemas.py`
- Modify: `backend/promptmaster/session_context.py:13-27`
- Test: `backend/tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_schemas.py`:

```python
"""Tests for new schema fields and chat message shape."""

import pytest

from promptmaster.schemas import ChatMessage, Iteration


def test_iteration_summary_defaults_none():
    iter = Iteration(
        iteration_number=1,
        prompt_sent="x",
        system_prompt_used="y",
        output="z",
        mode="architect",
    )
    assert iter.summary is None


def test_iteration_accepts_summary_string():
    iter = Iteration(
        iteration_number=2,
        prompt_sent="x",
        system_prompt_used="y",
        output="z",
        mode="architect",
        summary="Refined the answer to be more concrete.",
    )
    assert "concrete" in iter.summary


def test_chat_message_round_trips():
    msg = ChatMessage(
        id="abc-123",
        iteration_number=2,
        role="user",
        content="Why did you choose that approach?",
        created_at="2026-05-01T10:00:00Z",
    )
    payload = msg.model_dump()
    restored = ChatMessage(**payload)
    assert restored.role == "user"
    assert restored.iteration_number == 2


def test_chat_message_rejects_invalid_role():
    with pytest.raises(Exception):
        ChatMessage(
            id="x",
            iteration_number=1,
            role="system",  # type: ignore[arg-type]
            content="...",
            created_at="2026-05-01T10:00:00Z",
        )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_schemas.py -v
```
Expected: ImportError or AttributeError on `ChatMessage` (and `Iteration` missing `summary`).

- [ ] **Step 3: Modify `backend/promptmaster/schemas.py`**

Add to imports at the top (the `Literal` import already exists):

```python
# (existing imports unchanged)
```

Add `summary` to the `Iteration` model (insert after the existing `user_rating` field):

```python
class Iteration(BaseModel):
    """Record of a single generate-evaluate cycle."""
    iteration_number: int = Field(..., ge=1)
    prompt_sent: str = Field(..., description="The prompt text sent to LLM")
    system_prompt_used: str = Field(default="", description="System prompt used")
    output: str = Field(..., description="LLM response text")
    mode: ModeType = Field(...)
    evaluation: EvaluationResult | None = Field(default=None)
    trigger_source: str | None = Field(
        default=None,
        description="Where this iteration came from: 'initial', 'refine', 'realignment', 'challenge', 'self_audit', 'drift_alert', 'refine_shorter', etc.",
    )
    user_rating: Literal["positive", "negative"] | None = Field(
        default=None,
        description="User's explicit rating of this iteration — 'positive' (strong) or 'negative' (poor), or None if unrated.",
    )
    summary: str | None = Field(
        default=None,
        description="Brief LLM-generated summary of what changed from the previous version. None for the first iteration.",
    )
```

Add a new `ChatMessage` class at the end of the file:

```python
class ChatMessage(BaseModel):
    """A single message in a per-iteration chat thread."""
    id: str = Field(..., description="UUID")
    iteration_number: int = Field(..., ge=1, description="Which iteration this chat belongs to")
    role: Literal["user", "assistant"] = Field(...)
    content: str = Field(...)
    created_at: str = Field(..., description="ISO 8601 timestamp")
```

- [ ] **Step 4: Update `backend/promptmaster/session_context.py:13-27`**

Replace the `_TRIGGER_LABELS` dict with the version below (adds two new keys for the new flow, keeps the legacy `"conversation"` key):

```python
_TRIGGER_LABELS = {
    "initial": "initial run",
    "refine": "Refine Prompt",
    "realignment": "Realignment",
    "challenge": "Challenge This",
    "self_audit": "Self-Audit",
    "drift_alert": "Drift Alert",
    "refine_shorter": "Refine: Shorter",
    "refine_technical": "Refine: More technical",
    "refine_concrete": "Refine: More concrete",
    "refine_angle": "Refine: Different angle",
    "refine_cautious": "Refine: More cautious",
    "ask_questions": "Ask Questions follow-up",
    "conversation": "Conversation follow-up",  # legacy — preserved for old saved sessions
    "apply_conversation": "Applied chat to answer",
    "refined_from_conversation": "New version from chat",
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pytest tests/test_schemas.py -v
```
Expected: All 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/promptmaster/schemas.py backend/promptmaster/session_context.py backend/tests/test_schemas.py
git commit -m "feat(backend): add Iteration.summary, ChatMessage schema, new trigger labels"
```

---

## Task 3: Build `summaries.py` — `generate_summary` helper

**Files:**
- Create: `backend/promptmaster/summaries.py`
- Test: `backend/tests/test_summaries.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_summaries.py`:

```python
"""Tests for the iteration-summary generator."""

from unittest.mock import AsyncMock

import pytest

from promptmaster.schemas import (
    ChatMessage,
    DimensionScore,
    EvaluationResult,
    Iteration,
    PMInput,
)
from promptmaster.summaries import build_summary_prompt, generate_summary


@pytest.fixture
def prev_iter(basic_inputs: PMInput) -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="Original launch plan with three steps.",
        mode="architect",
        evaluation=EvaluationResult(
            alignment=DimensionScore(score="Medium", explanation="OK."),
            clarity=DimensionScore(score="Medium", explanation="OK."),
            drift=DimensionScore(score="Low", explanation="Focused."),
        ),
    )


@pytest.fixture
def new_iter(basic_inputs: PMInput) -> Iteration:
    return Iteration(
        iteration_number=2,
        prompt_sent="...",
        system_prompt_used="...",
        output="Refined launch plan: five concrete steps with metrics.",
        mode="architect",
    )


def test_summary_prompt_includes_objective(basic_inputs, prev_iter, new_iter):
    system, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert basic_inputs.objective in user


def test_summary_prompt_includes_outputs(basic_inputs, prev_iter, new_iter):
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert prev_iter.output in user
    assert new_iter.output in user


def test_summary_prompt_includes_user_action(basic_inputs, prev_iter, new_iter):
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Refine: more concrete",
    )
    assert "more concrete" in user


def test_summary_prompt_includes_chat_history(basic_inputs, prev_iter, new_iter):
    chat = [
        ChatMessage(id="1", iteration_number=1, role="user", content="Make it shorter.", created_at="t"),
        ChatMessage(id="2", iteration_number=1, role="assistant", content="Sure, 3 steps.", created_at="t"),
    ]
    _, user = build_summary_prompt(
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=chat,
        user_action="Apply to answer",
    )
    assert "Make it shorter" in user


@pytest.mark.asyncio
async def test_generate_summary_calls_client_and_returns_text(
    basic_inputs, prev_iter, new_iter
):
    client = AsyncMock()
    client.chat = AsyncMock(return_value="Made the plan more concrete with metrics.")
    result = await generate_summary(
        client=client,
        model=None,
        inputs=basic_inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=[],
        user_action="Apply to answer",
    )
    assert "concrete" in result
    client.chat.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_summaries.py -v
```
Expected: ImportError on `promptmaster.summaries`.

- [ ] **Step 3: Create `backend/promptmaster/summaries.py`**

```python
"""Iteration summary generator.

Produces a 1-2 sentence summary of what changed between the previous and
new iteration. Called in parallel with eval and suggestions whenever a new
iteration is created.
"""

from __future__ import annotations

from .schemas import ChatMessage, Iteration, PMInput
from .llm_client import OpenRouterClient


_SUMMARY_SYSTEM = (
    "You produce extremely short summaries of how an answer changed between two "
    "versions, for users reviewing their work history. Plain English, 1-2 short "
    "sentences, past tense, no jargon. Describe what actually changed in substance "
    "— not the process the user took. Avoid filler words like 'updated' or "
    "'improved' on their own; say WHAT changed."
)


def _format_chat_history(chat_history: list[ChatMessage]) -> str:
    if not chat_history:
        return ""
    lines = []
    for m in chat_history:
        role = "User" if m.role == "user" else "Assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def build_summary_prompt(
    inputs: PMInput,
    prev_iter: Iteration,
    new_iter: Iteration,
    chat_history: list[ChatMessage],
    user_action: str,
) -> tuple[str, str]:
    """Build (system, user) prompt for the summary call."""
    chat_block = _format_chat_history(chat_history)
    chat_section = f"\n\nChat thread that led to the change:\n{chat_block}" if chat_block else ""

    user_prompt = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"User action: {user_action}\n"
        f"{chat_section}\n\n"
        f"PREVIOUS VERSION (#{prev_iter.iteration_number}):\n"
        f"{prev_iter.output}\n\n"
        f"NEW VERSION (#{new_iter.iteration_number}):\n"
        f"{new_iter.output}\n\n"
        "In 1-2 short sentences, summarize what the new version changed compared to "
        "the previous one. Be concrete. Do not mention the action or process."
    )
    return _SUMMARY_SYSTEM, user_prompt


async def generate_summary(
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    prev_iter: Iteration,
    new_iter: Iteration,
    chat_history: list[ChatMessage] | None = None,
    user_action: str = "",
) -> str:
    """Run the LLM call to generate a brief summary of what changed."""
    system, user = build_summary_prompt(
        inputs=inputs,
        prev_iter=prev_iter,
        new_iter=new_iter,
        chat_history=chat_history or [],
        user_action=user_action,
    )
    text = await client.chat(
        system_prompt=system,
        user_prompt=user,
        model=model,
        max_tokens=120,
        temperature=0.3,
    )
    return text.strip()
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && pytest tests/test_summaries.py -v
```
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/promptmaster/summaries.py backend/tests/test_summaries.py
git commit -m "feat(backend): add summaries.generate_summary for iteration diff summaries"
```

---

## Task 4: Build `conversation.py` — three prompt builders

**Files:**
- Create: `backend/promptmaster/conversation.py`
- Test: `backend/tests/test_conversation_prompts.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_conversation_prompts.py`:

```python
"""Tests for conversation prompt builders."""

from promptmaster.conversation import (
    build_apply_to_answer_prompt,
    build_chat_reply_prompt,
    build_save_as_new_version_prompt,
)
from promptmaster.schemas import ChatMessage


def _chat() -> list[ChatMessage]:
    return [
        ChatMessage(id="1", iteration_number=1, role="user", content="Make it shorter.", created_at="t"),
        ChatMessage(id="2", iteration_number=1, role="assistant", content="Sure.", created_at="t"),
    ]


# --- chat-reply ---

def test_chat_reply_includes_objective_and_output(basic_inputs, basic_iteration):
    system, user = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        user_message="What about the timeline?",
        iterations=[basic_iteration],
    )
    assert basic_inputs.objective in user
    assert basic_iteration.output in user


def test_chat_reply_includes_user_message(basic_inputs, basic_iteration):
    _, user = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=[],
        user_message="What about the timeline?",
        iterations=[basic_iteration],
    )
    assert "timeline" in user


def test_chat_reply_includes_chat_history(basic_inputs, basic_iteration):
    _, user = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        user_message="...",
        iterations=[basic_iteration],
    )
    assert "Make it shorter" in user


def test_chat_reply_system_includes_session_history(basic_inputs, basic_iteration):
    system, _ = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=[],
        user_message="...",
        iterations=[basic_iteration],
    )
    assert "Session history" in system or "iteration" in system.lower()


# --- apply-to-answer ---

def test_apply_to_answer_includes_objective_and_output(basic_inputs, basic_iteration):
    _, user = build_apply_to_answer_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        iterations=[basic_iteration],
    )
    assert basic_inputs.objective in user
    assert basic_iteration.output in user


def test_apply_to_answer_includes_chat(basic_inputs, basic_iteration):
    _, user = build_apply_to_answer_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        iterations=[basic_iteration],
    )
    assert "Make it shorter" in user


def test_apply_to_answer_system_instructs_to_revise(basic_inputs, basic_iteration):
    system, _ = build_apply_to_answer_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        iterations=[basic_iteration],
    )
    assert "revise" in system.lower() or "update" in system.lower()


# --- save-as-new-version ---

def test_save_as_new_version_omits_current_output(basic_inputs, basic_iteration):
    """Save creates a fresh version — should not pass the previous output as content to keep."""
    system, user = build_save_as_new_version_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        iterations=[basic_iteration],
    )
    # Objective and chat must be present
    assert basic_inputs.objective in user
    assert "Make it shorter" in user


def test_save_as_new_version_system_instructs_fresh_generation(basic_inputs, basic_iteration):
    system, _ = build_save_as_new_version_prompt(
        inputs=basic_inputs,
        active_iteration=basic_iteration,
        chat_history=_chat(),
        iterations=[basic_iteration],
    )
    assert "fresh" in system.lower() or "new" in system.lower()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_conversation_prompts.py -v
```
Expected: ImportError on `promptmaster.conversation`.

- [ ] **Step 3: Create `backend/promptmaster/conversation.py`**

```python
"""Prompt builders for the chat / apply / save-as-new-version flows.

Three flows share a common scaffolding (objective, audience, constraints,
session history with rating signals) and differ only in the system-prompt
instruction and what they put in the user message.
"""

from __future__ import annotations

from .modes import MODES
from .prompt_builder import build_prompt
from .schemas import ChatMessage, Iteration, PMInput
from .session_context import format_session_history


_PROMPTMASTER_CONTEXT = (
    "You are operating inside the PromptMaster Engine, a structured AI workflow "
    "system. The user is working through a defined objective in a specific mode. "
    "Stay aligned with the original objective at all times."
)


def _format_chat_thread(chat_history: list[ChatMessage]) -> str:
    if not chat_history:
        return "(no prior chat messages)"
    lines = []
    for m in chat_history:
        role = "User" if m.role == "user" else "Assistant"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def _shared_system(inputs: PMInput, iterations: list[Iteration], extra: str) -> str:
    """Build the shared system prompt: PromptMaster context + mode + history + extra."""
    base = build_prompt(inputs)
    history = format_session_history(iterations) if iterations else ""
    return (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"{base.system_prompt}\n\n"
        f"Session history:\n{history}\n\n"
        f"{extra}"
    )


# --------------------------------------------------------------------------
# 1. Chat reply — fluid, no eval, no iteration created
# --------------------------------------------------------------------------

_CHAT_REPLY_INSTRUCTION = (
    "CHAT MODE: The user is having a fluid conversation with you about a specific "
    "answer they generated. Reply naturally and helpfully, like a thoughtful "
    "collaborator. Do not produce a fully restructured 'next iteration' here — "
    "you are exploring ideas with the user. Stay grounded in the original "
    "objective; if the user asks something off-topic, gently steer back."
)


def build_chat_reply_prompt(
    inputs: PMInput,
    active_iteration: Iteration,
    chat_history: list[ChatMessage],
    user_message: str,
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompt for a fluid chat reply."""
    system = _shared_system(inputs, iterations, _CHAT_REPLY_INSTRUCTION)
    chat_block = _format_chat_thread(chat_history)
    user_prompt = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"CURRENT VERSION (#{active_iteration.iteration_number}):\n"
        f"{active_iteration.output}\n\n"
        f"CHAT SO FAR:\n{chat_block}\n\n"
        f"USER MESSAGE:\n{user_message}\n\n"
        "Reply to the user's message. Be conversational and concise."
    )
    return system, user_prompt


# --------------------------------------------------------------------------
# 2. Apply to answer — patch the active iteration's output
# --------------------------------------------------------------------------

_APPLY_INSTRUCTION = (
    "APPLY MODE: The user has had a chat about a specific answer and now wants "
    "you to revise that answer to incorporate the discussed insights, while "
    "preserving alignment with the original objective and constraints. Produce "
    "a complete updated version of the answer — full text, ready to read. Keep "
    "the structure and length appropriate to the objective."
)


def build_apply_to_answer_prompt(
    inputs: PMInput,
    active_iteration: Iteration,
    chat_history: list[ChatMessage],
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompt for Apply to Answer."""
    system = _shared_system(inputs, iterations, _APPLY_INSTRUCTION)
    chat_block = _format_chat_thread(chat_history)
    user_prompt = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"CURRENT VERSION (#{active_iteration.iteration_number}):\n"
        f"{active_iteration.output}\n\n"
        f"CHAT THREAD:\n{chat_block}\n\n"
        "Produce a revised version of the answer that incorporates the "
        "insights from the chat. Output only the revised answer text."
    )
    return system, user_prompt


# --------------------------------------------------------------------------
# 3. Save as new version — fresh generation using chat as additional context
# --------------------------------------------------------------------------

_SAVE_AS_NEW_INSTRUCTION = (
    "FRESH-GENERATION MODE: The user has had a chat about an existing answer and "
    "now wants a brand new version informed by that conversation. Treat the chat "
    "thread as additional constraints and guidance. Produce a fresh answer that "
    "fully addresses the original objective; do not simply copy the existing "
    "version's structure. Output only the new answer text."
)


def build_save_as_new_version_prompt(
    inputs: PMInput,
    active_iteration: Iteration,
    chat_history: list[ChatMessage],
    iterations: list[Iteration],
) -> tuple[str, str]:
    """Build (system, user) prompt for Save as New Version."""
    system = _shared_system(inputs, iterations, _SAVE_AS_NEW_INSTRUCTION)
    chat_block = _format_chat_thread(chat_history)
    user_prompt = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
        f"Constraints: {inputs.constraints or '(none)'}\n"
        f"Output format: {inputs.output_format or '(none)'}\n\n"
        f"CHAT THREAD:\n{chat_block}\n\n"
        f"(Reference: previous version was #{active_iteration.iteration_number}.)\n\n"
        "Produce a fresh new version of the answer."
    )
    return system, user_prompt
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_conversation_prompts.py -v
```
Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/promptmaster/conversation.py backend/tests/test_conversation_prompts.py
git commit -m "feat(backend): add conversation.py with chat/apply/save prompt builders"
```

---

## Task 5: Wire summary generation into existing endpoints

**Files:**
- Modify: `backend/routers/engine.py:127-242` (run-iteration and flow-trigger)
- Test: `backend/tests/test_engine_summary_wiring.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_engine_summary_wiring.py`:

```python
"""Verify that iteration-creating endpoints now include summary generation."""

import inspect

from routers import engine


def test_run_iteration_imports_generate_summary():
    src = inspect.getsource(engine)
    assert "generate_summary" in src, (
        "engine.py should call generate_summary as part of iteration creation"
    )


def test_run_iteration_includes_summary_assignment():
    src = inspect.getsource(engine.api_run_iteration)
    assert "summary" in src, "run-iteration should set Iteration.summary"


def test_flow_trigger_includes_summary_assignment():
    src = inspect.getsource(engine.api_flow_trigger)
    assert "summary" in src, "flow-trigger should set Iteration.summary for non-diagnostic triggers"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_engine_summary_wiring.py -v
```
Expected: 3 tests fail (no `generate_summary` import, no summary assignment).

- [ ] **Step 3: Modify `backend/routers/engine.py`**

Add to imports (after the `from promptmaster.guidance import generate_suggestions` line, around line 18):

```python
from promptmaster.summaries import generate_summary
from promptmaster.session_context import _label_trigger
```

Replace the body of `api_run_iteration` (the function starting at line 127) with this updated version that adds summary generation in parallel:

```python
@router.post("/run-iteration")
async def api_run_iteration(
    req: RunIterationRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run one generate-evaluate cycle. Generate first, then evaluate + suggestions + summary in parallel."""
    try:
        model = req.model or None
        history = req.iteration_history

        # Step 1: Generate output (must complete first)
        output = await generate(
            client=client,
            prompt_text=req.prompt_text,
            system_text=req.system_text,
            model=model,
        )

        # Build iteration draft (used for summary input)
        iteration_draft = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=req.prompt_text,
            system_prompt_used=req.system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=None,
            trigger_source=req.source,
        )

        # Step 2: Run evaluation, suggestions, and (if applicable) summary in parallel
        eval_task = evaluate_output(client, req.inputs, output, iterations=history, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            iterations=history,
            model=model,
        )

        if history and len(history) > 0:
            prev = history[-1]
            summary_task = generate_summary(
                client=client,
                model=model,
                inputs=req.inputs,
                prev_iter=prev,
                new_iter=iteration_draft,
                chat_history=[],
                user_action=_label_trigger(req.source),
            )
            evaluation, suggestions, summary = await asyncio.gather(
                eval_task, suggestions_task, summary_task
            )
        else:
            evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)
            summary = None

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=req.prompt_text,
            system_prompt_used=req.system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
            trigger_source=req.source,
            summary=summary,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

Replace the body of `api_flow_trigger` (the function starting near line 171) — only the non-diagnostic branch needs summary generation:

```python
@router.post("/flow-trigger")
async def api_flow_trigger(
    req: FlowTriggerRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Run a one-click flow trigger (Challenge, Self-Audit, Drift Alert, Refine).

    Builds a pre-configured prompt from the book's Ch1 S13-S14 techniques,
    then runs the full pipeline: generate -> (evaluate || suggestions || summary).
    """
    try:
        model = req.model or None
        history = req.iteration_history

        system_text, prompt_text = build_flow_trigger_prompt(
            inputs=req.inputs,
            current_output=req.current_output,
            trigger=req.trigger,
            evaluation=req.evaluation,
            iterations=history,
        )

        output = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )

        is_diagnostic = req.trigger in ("challenge", "self_audit", "reframe")

        if is_diagnostic:
            iteration = Iteration(
                iteration_number=req.iteration_number,
                prompt_sent=prompt_text,
                system_prompt_used=system_text,
                output=output,
                mode=req.inputs.mode,
                evaluation=None,
                trigger_source=req.trigger,
            )
            return RunIterationResponse(iteration=iteration, suggestions=[])

        # Non-diagnostic: full eval + suggestions + summary in parallel
        iteration_draft = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=prompt_text,
            system_prompt_used=system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=None,
            trigger_source=req.trigger,
        )

        eval_task = evaluate_output(client, req.inputs, output, iterations=history, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            iterations=history,
            model=model,
        )

        if history and len(history) > 0:
            prev = history[-1]
            summary_task = generate_summary(
                client=client,
                model=model,
                inputs=req.inputs,
                prev_iter=prev,
                new_iter=iteration_draft,
                chat_history=[],
                user_action=_label_trigger(req.trigger),
            )
            evaluation, suggestions, summary = await asyncio.gather(
                eval_task, suggestions_task, summary_task
            )
        else:
            evaluation, suggestions = await asyncio.gather(eval_task, suggestions_task)
            summary = None

        iteration = Iteration(
            iteration_number=req.iteration_number,
            prompt_sent=prompt_text,
            system_prompt_used=system_text,
            output=output,
            mode=req.inputs.mode,
            evaluation=evaluation,
            trigger_source=req.trigger,
            summary=summary,
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_engine_summary_wiring.py -v
```
Expected: All 3 tests pass.

- [ ] **Step 5: Sanity check existing tests still pass**

```bash
cd backend && pytest -v
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/engine.py backend/tests/test_engine_summary_wiring.py
git commit -m "feat(backend): wire generate_summary into run-iteration and flow-trigger"
```

---

## Task 6: Build conversation router with three endpoints

**Files:**
- Create: `backend/routers/conversation.py`
- Test: `backend/tests/test_conversation_router.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_conversation_router.py`:

```python
"""Smoke tests for the conversation router endpoints (request shapes only)."""

import inspect

from routers import conversation as conv


def test_chat_message_request_has_required_fields():
    fields = conv.ChatMessageRequest.model_fields
    for required in ("inputs", "active_iteration", "chat_history", "user_message", "model"):
        assert required in fields, f"missing field: {required}"


def test_apply_to_answer_request_has_required_fields():
    fields = conv.ApplyToAnswerRequest.model_fields
    for required in (
        "inputs",
        "active_iteration",
        "chat_history",
        "iteration_number",
        "iteration_history",
        "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_save_as_new_version_request_has_required_fields():
    fields = conv.SaveAsNewVersionRequest.model_fields
    for required in (
        "inputs",
        "active_iteration",
        "chat_history",
        "iteration_number",
        "iteration_history",
        "model",
    ):
        assert required in fields, f"missing field: {required}"


def test_router_registers_three_endpoints():
    paths = [r.path for r in conv.router.routes]
    assert "/api/chat-message" in paths
    assert "/api/apply-to-answer" in paths
    assert "/api/save-as-new-version" in paths


def test_apply_to_answer_uses_apply_prompt_builder():
    src = inspect.getsource(conv.api_apply_to_answer)
    assert "build_apply_to_answer_prompt" in src


def test_save_as_new_version_uses_save_prompt_builder():
    src = inspect.getsource(conv.api_save_as_new_version)
    assert "build_save_as_new_version_prompt" in src
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_conversation_router.py -v
```
Expected: ImportError on `routers.conversation`.

- [ ] **Step 3: Create `backend/routers/conversation.py`**

```python
"""Chat endpoints — fluid chat reply, apply-to-answer, save-as-new-version."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_client
from promptmaster.conversation import (
    build_apply_to_answer_prompt,
    build_chat_reply_prompt,
    build_save_as_new_version_prompt,
)
from promptmaster.engine import generate
from promptmaster.evaluator import evaluate_output
from promptmaster.guidance import generate_suggestions
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.schemas import ChatMessage, Iteration, PMInput
from promptmaster.summaries import generate_summary

router = APIRouter(prefix="/api", tags=["conversation"])


# --- Request / Response Models ---

class ChatMessageRequest(BaseModel):
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage] = []
    user_message: str
    iteration_history: list[Iteration] = []
    model: str = ""


class ChatMessageResponse(BaseModel):
    assistant_message: ChatMessage


class ApplyToAnswerRequest(BaseModel):
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage] = []
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


class SaveAsNewVersionRequest(BaseModel):
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage] = []
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""


class IterationFromConversationResponse(BaseModel):
    iteration: Iteration
    suggestions: list[str]


# --- Helpers ---

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _build_iteration_with_full_pipeline(
    *,
    client: OpenRouterClient,
    model: str | None,
    inputs: PMInput,
    output: str,
    iteration_number: int,
    system_text: str,
    prompt_text: str,
    trigger_source: str,
    active_iteration: Iteration,
    chat_history: list[ChatMessage],
    iteration_history: list[Iteration],
    user_action_label: str,
) -> tuple[Iteration, list[str]]:
    """Run eval + suggestions + summary in parallel, then assemble the iteration."""
    iteration_draft = Iteration(
        iteration_number=iteration_number,
        prompt_sent=prompt_text,
        system_prompt_used=system_text,
        output=output,
        mode=inputs.mode,
        evaluation=None,
        trigger_source=trigger_source,
    )

    eval_task = evaluate_output(client, inputs, output, iterations=iteration_history, model=model)
    suggestions_task = generate_suggestions(
        client=client,
        inputs=inputs,
        output=output,
        iterations=iteration_history,
        model=model,
    )
    summary_task = generate_summary(
        client=client,
        model=model,
        inputs=inputs,
        prev_iter=active_iteration,
        new_iter=iteration_draft,
        chat_history=chat_history,
        user_action=user_action_label,
    )

    evaluation, suggestions, summary = await asyncio.gather(
        eval_task, suggestions_task, summary_task
    )

    iteration = Iteration(
        iteration_number=iteration_number,
        prompt_sent=prompt_text,
        system_prompt_used=system_text,
        output=output,
        mode=inputs.mode,
        evaluation=evaluation,
        trigger_source=trigger_source,
        summary=summary,
    )
    return iteration, suggestions


# --- Endpoints ---

@router.post("/chat-message")
async def api_chat_message(
    req: ChatMessageRequest,
    client: OpenRouterClient = Depends(get_client),
) -> ChatMessageResponse:
    """Pure chat reply — 1 LLM call, no eval, no iteration created."""
    try:
        model = req.model or None
        system_text, prompt_text = build_chat_reply_prompt(
            inputs=req.inputs,
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            user_message=req.user_message,
            iterations=req.iteration_history,
        )
        reply = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )
        msg = ChatMessage(
            id=uuid.uuid4().hex,
            iteration_number=req.active_iteration.iteration_number,
            role="assistant",
            content=reply.strip(),
            created_at=_now_iso(),
        )
        return ChatMessageResponse(assistant_message=msg)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/apply-to-answer")
async def api_apply_to_answer(
    req: ApplyToAnswerRequest,
    client: OpenRouterClient = Depends(get_client),
) -> IterationFromConversationResponse:
    """Patch the active iteration's answer with conversation insights → new iteration."""
    try:
        model = req.model or None
        system_text, prompt_text = build_apply_to_answer_prompt(
            inputs=req.inputs,
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iterations=req.iteration_history,
        )
        output = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )
        iteration, suggestions = await _build_iteration_with_full_pipeline(
            client=client,
            model=model,
            inputs=req.inputs,
            output=output,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="apply_conversation",
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iteration_history=req.iteration_history,
            user_action_label="Applied chat to answer",
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


@router.post("/save-as-new-version")
async def api_save_as_new_version(
    req: SaveAsNewVersionRequest,
    client: OpenRouterClient = Depends(get_client),
) -> IterationFromConversationResponse:
    """Generate a fresh new version using chat as guidance → new iteration."""
    try:
        model = req.model or None
        system_text, prompt_text = build_save_as_new_version_prompt(
            inputs=req.inputs,
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iterations=req.iteration_history,
        )
        output = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )
        iteration, suggestions = await _build_iteration_with_full_pipeline(
            client=client,
            model=model,
            inputs=req.inputs,
            output=output,
            iteration_number=req.iteration_number,
            system_text=system_text,
            prompt_text=prompt_text,
            trigger_source="refined_from_conversation",
            active_iteration=req.active_iteration,
            chat_history=req.chat_history,
            iteration_history=req.iteration_history,
            user_action_label="New version from chat",
        )
        return IterationFromConversationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_conversation_router.py -v
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/conversation.py backend/tests/test_conversation_router.py
git commit -m "feat(backend): add conversation router with chat/apply/save endpoints"
```

---

## Task 7: Wire conversation router and remove old conversation-bridge code

**Files:**
- Modify: `backend/main.py:49-53`
- Modify: `backend/routers/engine.py` (remove `ConversationBridgeRequest` + `/api/conversation-bridge`)
- Modify: `backend/promptmaster/flow_triggers.py` (remove `build_conversation_prompt`)

- [ ] **Step 1: Wire the new router into `main.py`**

Replace the import block at the bottom (lines 49-53) with:

```python
from routers.meta import router as meta_router
from routers.engine import router as engine_router
from routers.conversation import router as conversation_router

app.include_router(meta_router)
app.include_router(engine_router)
app.include_router(conversation_router)
```

- [ ] **Step 2: Remove `ConversationBridgeRequest` from `backend/routers/engine.py`**

Delete lines 110-116 (the `ConversationBridgeRequest` class):

```python
# DELETE THIS BLOCK:
# class ConversationBridgeRequest(BaseModel):
#     inputs: PMInput
#     current_output: str
#     user_message: str
#     iteration_number: int
#     iteration_history: list[Iteration] = []
#     model: str = ""
```

Delete the `@router.post("/conversation-bridge")` endpoint and its body (lines ~298-350 in the current file — the `api_conversation_bridge` function).

Also remove `build_conversation_prompt` from the imports at the top of `engine.py`. Change:

```python
from promptmaster.flow_triggers import (
    build_flow_trigger_prompt,
    build_conversation_prompt,
    run_check_intent,
    run_confirm_understanding,
    run_analyze_pattern,
    run_ask_questions,
    FlowTriggerType,
    FlowInspectType,
)
```

to:

```python
from promptmaster.flow_triggers import (
    build_flow_trigger_prompt,
    run_check_intent,
    run_confirm_understanding,
    run_analyze_pattern,
    run_ask_questions,
    FlowTriggerType,
    FlowInspectType,
)
```

- [ ] **Step 3: Remove `build_conversation_prompt` from `backend/promptmaster/flow_triggers.py`**

Delete the entire `build_conversation_prompt` function (starts at line 243 in the current file). It is the function whose docstring mentions "Conversation Bridge". Delete from `def build_conversation_prompt(` through the closing `return system, user` of that function only — leave `build_flow_trigger_prompt` (next function) intact.

- [ ] **Step 4: Verify the backend still imports cleanly**

```bash
cd backend && python -c "import main; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Verify no test references the removed names**

```bash
cd backend && grep -rn "build_conversation_prompt\|conversation-bridge\|ConversationBridgeRequest" --include='*.py'
```
Expected: empty output (zero matches).

- [ ] **Step 6: Run all tests**

```bash
cd backend && pytest -v
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/routers/engine.py backend/promptmaster/flow_triggers.py
git commit -m "refactor(backend): wire conversation router, remove old conversation-bridge"
```

---

## Task 8: Frontend types — `ChatMessage`, request/response shapes, `Iteration.summary`

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `summary` to `Iteration` and add new chat types**

Replace the `Iteration` interface (lines 36-45 in the current file) and append new types at the end of the file. The full additions:

```typescript
// Replace the Iteration interface:
export interface Iteration {
  iteration_number: number;
  prompt_sent: string;
  system_prompt_used: string;
  output: string;
  mode: ModeType;
  evaluation: EvaluationResult | null;
  trigger_source?: string | null;
  user_rating?: UserRating | null;
  summary?: string | null;
}

// Add at end of file:

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  iteration_number: number;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface ChatMessageRequest {
  inputs: PMInput;
  active_iteration: Iteration;
  chat_history: ChatMessage[];
  user_message: string;
  iteration_history?: Iteration[];
  model?: string;
}

export interface ChatMessageResponse {
  assistant_message: ChatMessage;
}

export interface ApplyToAnswerRequest {
  inputs: PMInput;
  active_iteration: Iteration;
  chat_history: ChatMessage[];
  iteration_number: number;
  iteration_history?: Iteration[];
  model?: string;
}

export interface SaveAsNewVersionRequest {
  inputs: PMInput;
  active_iteration: Iteration;
  chat_history: ChatMessage[];
  iteration_number: number;
  iteration_history?: Iteration[];
  model?: string;
}

export interface IterationFromConversationResponse {
  iteration: Iteration;
  suggestions: string[];
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd frontend && npm run build
```
Expected: build succeeds. (It may surface usages of `conversationBridge` in `output-phase.tsx` — those will be removed in later tasks. If the build complains specifically about types, fix; if it complains about the still-existing-but-stale `conversationBridge` usage, that's expected.)

If a build error blocks the task, focus on type errors only — leave existing stale usages until their dedicated cleanup tasks.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add ChatMessage types and Iteration.summary field"
```

---

## Task 9: API client — add three new methods, remove `conversationBridge`

**Files:**
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: Replace the entire `client.ts` with this version**

```typescript
import type {
  PMInput,
  AssembledPrompt,
  Iteration,
  EvaluationResult,
  ModeConfig,
  FlowTriggerType,
  FlowInspectType,
  FlowInspectResult,
  ChatMessage,
  ChatMessageRequest,
  ChatMessageResponse,
  ApplyToAnswerRequest,
  SaveAsNewVersionRequest,
  IterationFromConversationResponse,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  async buildPrompt(inputs: PMInput): Promise<AssembledPrompt> {
    return apiFetch('/api/build-prompt', {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    });
  },

  async runIteration(req: {
    inputs: PMInput;
    prompt_text: string;
    system_text: string;
    iteration_number: number;
    iteration_history?: Iteration[];
    source?: string;
    model?: string;
  }): Promise<{ iteration: Iteration; suggestions: string[] }> {
    return apiFetch('/api/run-iteration', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async buildRealignment(req: {
    inputs: PMInput;
    evaluation: EvaluationResult;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<{ realignment_prompt: string }> {
    return apiFetch('/api/build-realignment', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async flowTrigger(req: {
    inputs: PMInput;
    current_output: string;
    trigger: FlowTriggerType;
    iteration_number: number;
    evaluation?: EvaluationResult | null;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<{ iteration: Iteration; suggestions: string[] }> {
    return apiFetch('/api/flow-trigger', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async flowInspect(req: {
    inputs: PMInput;
    current_output: string;
    inspection: FlowInspectType;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<FlowInspectResult> {
    return apiFetch('/api/flow-inspect', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async chatMessage(req: ChatMessageRequest): Promise<ChatMessageResponse> {
    return apiFetch('/api/chat-message', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async applyToAnswer(req: ApplyToAnswerRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/apply-to-answer', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async saveAsNewVersion(req: SaveAsNewVersionRequest): Promise<IterationFromConversationResponse> {
    return apiFetch('/api/save-as-new-version', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async runSelfAudit(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ audit: string }> {
    return apiFetch('/api/run-self-audit', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async hardResetLessons(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ lessons: string }> {
    return apiFetch('/api/hard-reset-lessons', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async formatSummary(req: {
    inputs: PMInput;
    iterations: Iteration[];
  }): Promise<{ summary: string }> {
    return apiFetch('/api/format-summary', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async exportSession(req: {
    inputs: PMInput;
    iterations: Iteration[];
    model?: string;
  }): Promise<{ json: string }> {
    return apiFetch('/api/export-session', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async getModels(): Promise<{ models: Array<{ id: string; name: string; context_length: number }> }> {
    return apiFetch('/api/models');
  },

  async getModes(): Promise<Record<string, ModeConfig>> {
    return apiFetch('/api/modes');
  },
};

// Re-export ChatMessage for convenience.
export type { ChatMessage };
```

- [ ] **Step 2: Verify the file compiles in isolation**

```bash
cd frontend && npx tsc --noEmit src/lib/api/client.ts
```
Expected: no errors. (`output-phase.tsx` will fail because `api.conversationBridge` no longer exists — that's an upcoming task; this isolated check should pass.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add chat/apply/save API methods, remove conversationBridge"
```

---

## Task 10: Supabase conversation CRUD module

**Files:**
- Create: `frontend/src/lib/supabase/conversation.ts`

- [ ] **Step 1: Inspect existing Supabase client patterns**

```bash
cat frontend/src/lib/supabase/presets.ts
```
Note the `getSupabaseClient` import and overall pattern.

- [ ] **Step 2: Create `frontend/src/lib/supabase/conversation.ts`**

```typescript
import { createClient } from './client';
import type { ChatMessage, ChatRole } from '@/types';

interface ConversationMessageRow {
  id: string;
  iteration_number: number;
  role: ChatRole;
  content: string;
  created_at: string;
}

function rowToMessage(row: ConversationMessageRow): ChatMessage {
  return {
    id: row.id,
    iteration_number: row.iteration_number,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  };
}

/**
 * Load all messages for a single (session, iteration) pair, ordered chronologically.
 * Returns empty array if user is unauthenticated or table query fails.
 */
export async function loadMessages(
  sessionId: string,
  iterationNumber: number
): Promise<ChatMessage[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, iteration_number, role, content, created_at')
    .eq('user_id', user.id)
    .eq('session_id', sessionId)
    .eq('iteration_number', iterationNumber)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(rowToMessage);
}

/**
 * Load every message for a session, grouped by iteration_number.
 */
export async function loadAllMessagesForSession(
  sessionId: string
): Promise<Record<number, ChatMessage[]>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, iteration_number, role, content, created_at')
    .eq('user_id', user.id)
    .eq('session_id', sessionId)
    .order('iteration_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data) return {};

  const grouped: Record<number, ChatMessage[]> = {};
  for (const row of data) {
    const msg = rowToMessage(row);
    if (!grouped[msg.iteration_number]) grouped[msg.iteration_number] = [];
    grouped[msg.iteration_number].push(msg);
  }
  return grouped;
}

/**
 * Persist a new message. Returns the saved row (with server-generated id +
 * created_at). For unauthenticated users, returns the input unchanged with
 * client-generated id/created_at — chat works in-memory only.
 */
export async function saveMessage(
  msg: Omit<ChatMessage, 'id' | 'created_at'> & { session_id: string }
): Promise<ChatMessage> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Unauthenticated: in-memory only. Generate id/timestamp client-side.
    return {
      id: crypto.randomUUID(),
      iteration_number: msg.iteration_number,
      role: msg.role,
      content: msg.content,
      created_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
      user_id: user.id,
      session_id: msg.session_id,
      iteration_number: msg.iteration_number,
      role: msg.role,
      content: msg.content,
    })
    .select('id, iteration_number, role, content, created_at')
    .single();

  if (error || !data) {
    // Don't block UX on persistence failure — return a client-side echo.
    return {
      id: crypto.randomUUID(),
      iteration_number: msg.iteration_number,
      role: msg.role,
      content: msg.content,
      created_at: new Date().toISOString(),
    };
  }
  return rowToMessage(data);
}
```

- [ ] **Step 3: Verify the module compiles**

```bash
cd frontend && npx tsc --noEmit src/lib/supabase/conversation.ts
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/supabase/conversation.ts
git commit -m "feat(frontend): add Supabase CRUD for conversation_messages"
```

---

## Task 11: Zustand store — chat state and actions

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 1: Add new types and state to `session-store.ts`**

Add to imports at the top (after the existing type imports):

```typescript
import type { ChatMessage } from '@/types';
```

Add the new fields to the `SessionState` interface (after the existing `customFormatPresets: string[];` line, before `// Actions`):

```typescript
  // Chat panel state
  activeIterationNumber: number | null;
  chatMessages: Record<number, ChatMessage[]>;
  chatPanelOpen: boolean;
  chatLoading: 'send' | 'apply' | 'save' | null;
```

Add the new action signatures inside `SessionState` (after the existing `removeCustomFormatPreset` line, before `finalize`):

```typescript
  setActiveIteration: (n: number | null) => void;
  appendChatMessage: (iteration: number, message: ChatMessage) => void;
  setChatMessages: (iteration: number, messages: ChatMessage[]) => void;
  loadAllChatMessages: (byIteration: Record<number, ChatMessage[]>) => void;
  setChatLoading: (state: 'send' | 'apply' | 'save' | null) => void;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
```

Add the new initial state values to `initialState` (before the closing `}`):

```typescript
  activeIterationNumber: null as number | null,
  chatMessages: {} as Record<number, ChatMessage[]>,
  chatPanelOpen: false,
  chatLoading: null as 'send' | 'apply' | 'save' | null,
```

Modify `appendIteration` to auto-advance `activeIterationNumber` and initialize an empty chat thread for the new iteration. Replace the existing implementation:

```typescript
      appendIteration: (iteration, suggestions) =>
        set((state) => ({
          iterations: [...state.iterations, iteration],
          currentOutput: iteration.output,
          currentEval: iteration.evaluation,
          suggestions,
          activeIterationNumber: iteration.iteration_number,
          chatMessages: {
            ...state.chatMessages,
            [iteration.iteration_number]: state.chatMessages[iteration.iteration_number] || [],
          },
        })),
```

Add the new action implementations (after `removeCustomFormatPreset` and before `finalize`):

```typescript
      setActiveIteration: (n) => set((state) => {
        if (n === null) return { activeIterationNumber: null };
        const iter = state.iterations.find((it) => it.iteration_number === n);
        if (!iter) return {};
        return {
          activeIterationNumber: n,
          currentOutput: iter.output,
          currentEval: iter.evaluation,
        };
      }),
      appendChatMessage: (iteration, message) =>
        set((state) => ({
          chatMessages: {
            ...state.chatMessages,
            [iteration]: [...(state.chatMessages[iteration] || []), message],
          },
        })),
      setChatMessages: (iteration, messages) =>
        set((state) => ({
          chatMessages: { ...state.chatMessages, [iteration]: messages },
        })),
      loadAllChatMessages: (byIteration) =>
        set({ chatMessages: byIteration }),
      setChatLoading: (chatLoading) => set({ chatLoading }),
      setChatPanelOpen: (chatPanelOpen) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('pm-chat-panel-open', chatPanelOpen ? '1' : '0');
        }
        set({ chatPanelOpen });
      },
      toggleChatPanel: () => set((state) => {
        const next = !state.chatPanelOpen;
        if (typeof window !== 'undefined') {
          localStorage.setItem('pm-chat-panel-open', next ? '1' : '0');
        }
        return { chatPanelOpen: next };
      }),
```

Modify `loadSession` to set `activeIterationNumber` (replace the existing implementation):

```typescript
      loadSession: (session) =>
        set({
          objective: session.objective,
          audience: session.audience,
          constraints: session.constraints,
          outputFormat: session.output_format,
          mode: session.mode,
          model: session.model || DEFAULT_MODEL,
          iterations: session.iterations,
          finalized: session.finalized,
          currentOutput: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].output : null,
          currentEval: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].evaluation : null,
          phase: session.finalized ? 'summary' : 'output',
          sessionSaved: true,
          activeIterationNumber: session.iterations.length > 0 ? session.iterations[session.iterations.length - 1].iteration_number : null,
          chatMessages: {},
        }),
```

Modify `resetSession` and `carryLessonsForward` to clear chat state too:

```typescript
      resetSession: () => set({ ...initialState }),
      carryLessonsForward: (objective, constraints) =>
        set({ ...initialState, objective, constraints }),
```

(These already use `...initialState`; the new chat fields are now part of `initialState` so they reset automatically.)

- [ ] **Step 2: Verify the store compiles**

```bash
cd frontend && npx tsc --noEmit src/stores/session-store.ts
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add chat panel state and actions to Zustand store"
```

---

## Task 12: Build `chat-message-bubble.tsx` and `chat-message-list.tsx`

**Files:**
- Create: `frontend/src/components/chat/chat-message-bubble.tsx`
- Create: `frontend/src/components/chat/chat-message-list.tsx`

- [ ] **Step 1: Create `chat-message-bubble.tsx`**

```tsx
'use client';

import type { ChatMessage } from '@/types';
import { MarkdownOutput } from '@/components/shared/markdown-output';

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[var(--pm-primary-container)] text-white text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-[var(--surface-container-low)] text-[var(--on-surface)] text-sm">
        <MarkdownOutput content={message.content} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `chat-message-list.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';
import { ChatMessageBubble } from './chat-message-bubble';

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
}

export function ChatMessageList({ messages, loading }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-sm text-[var(--on-surface-variant)] italic">
          Ask a follow-up about this answer, or just think out loud.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m) => (
        <ChatMessageBubble key={m.id} message={m} />
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-[var(--surface-container-low)]">
            <div className="flex gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse [animation-delay:0.15s]" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--on-surface-variant)] animate-pulse [animation-delay:0.3s]" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Build the frontend to verify these compile**

```bash
cd frontend && npm run build
```
Expected: build succeeds (or fails only on `output-phase.tsx` references to `conversationBridge`, which we'll fix later).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/chat-message-bubble.tsx frontend/src/components/chat/chat-message-list.tsx
git commit -m "feat(frontend): add ChatMessageBubble and ChatMessageList components"
```

---

## Task 13: Build `chat-input.tsx` and `chat-action-bar.tsx`

**Files:**
- Create: `frontend/src/components/chat/chat-input.tsx`
- Create: `frontend/src/components/chat/chat-action-bar.tsx`

- [ ] **Step 1: Create `chat-input.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface ChatInputProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="border-t border-[var(--outline-variant)]/30 px-4 py-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type a message…"
        rows={2}
        disabled={disabled}
        className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 focus:bg-white transition-all duration-200 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--on-surface-variant)]">Cmd+Enter to send</span>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[14px]">send</span>
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `chat-action-bar.tsx`**

```tsx
'use client';

interface ChatActionBarProps {
  onApplyToAnswer: () => void;
  onSaveAsNewVersion: () => void;
  disabled: boolean;
  loading: 'apply' | 'save' | null;
}

export function ChatActionBar({
  onApplyToAnswer,
  onSaveAsNewVersion,
  disabled,
  loading,
}: ChatActionBarProps) {
  return (
    <div className="border-t border-[var(--outline-variant)]/30 px-4 py-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onApplyToAnswer}
        disabled={disabled}
        title={disabled ? 'Send a message first.' : 'Update this version using what you discussed.'}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--on-surface)] bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading === 'apply' ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--on-surface)] border-t-transparent" />
            Updating…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Apply to answer
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onSaveAsNewVersion}
        disabled={disabled}
        title={disabled ? 'Send a message first.' : 'Create a new version using your chat as a guide.'}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--pm-primary)] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading === 'save' ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Saving…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[14px]">add_circle</span>
            Save as new version
          </>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
cd frontend && npm run build
```
Expected: succeeds (modulo pre-existing `conversationBridge` references).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/chat-input.tsx frontend/src/components/chat/chat-action-bar.tsx
git commit -m "feat(frontend): add ChatInput and ChatActionBar components"
```

---

## Task 14: Build `version-selector.tsx`

**Files:**
- Create: `frontend/src/components/chat/version-selector.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Iteration } from '@/types';

interface VersionSelectorProps {
  versions: Iteration[];
  activeNumber: number | null;
  onSelect: (n: number) => void;
}

function ratingBadge(rating: 'positive' | 'negative' | null | undefined) {
  if (!rating) return null;
  const isPositive = rating === 'positive';
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
      title={isPositive ? 'Marked as strong' : 'Marked as poor'}
    >
      <span
        className="material-symbols-outlined text-[12px]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {isPositive ? 'thumb_up' : 'thumb_down'}
      </span>
    </span>
  );
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

export function VersionSelector({ versions, activeNumber, onSelect }: VersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (versions.length === 0) {
    return (
      <span className="text-xs font-semibold text-[var(--on-surface-variant)]">
        No versions yet
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors"
      >
        <span>Discussing: Version {activeNumber ?? versions[versions.length - 1].iteration_number}</span>
        <span className="material-symbols-outlined text-[14px]">expand_more</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-white rounded-lg shadow-lg border border-[var(--outline-variant)]/30 z-30">
          {versions.map((iter) => {
            const isActive = iter.iteration_number === activeNumber;
            return (
              <button
                key={iter.iteration_number}
                type="button"
                onClick={() => {
                  onSelect(iter.iteration_number);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-[var(--surface-container-low)] transition-colors ${
                  isActive ? 'bg-[var(--surface-container-low)]' : ''
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[var(--on-surface)]">
                    Version {iter.iteration_number}
                  </span>
                  {ratingBadge(iter.user_rating)}
                </div>
                {iter.summary && (
                  <p className="text-[11px] text-[var(--on-surface-variant)] italic mt-0.5">
                    {truncate(iter.summary, 80)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/version-selector.tsx
git commit -m "feat(frontend): add VersionSelector dropdown for chat panel"
```

---

## Task 15: Build `chat-panel-toggle.tsx` and `chat-panel.tsx`

**Files:**
- Create: `frontend/src/components/chat/chat-panel-toggle.tsx`
- Create: `frontend/src/components/chat/chat-panel.tsx`

- [ ] **Step 1: Create `chat-panel-toggle.tsx`**

```tsx
'use client';

interface ChatPanelToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatPanelToggle({ isOpen, onToggle }: ChatPanelToggleProps) {
  if (isOpen) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Open chat"
      aria-label="Open chat"
      className="fixed right-6 bottom-6 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-[var(--pm-primary)] text-white shadow-ambient hover:opacity-90 active:scale-[0.98] transition-all"
    >
      <span className="material-symbols-outlined text-[22px]">chat_bubble</span>
    </button>
  );
}
```

- [ ] **Step 2: Create `chat-panel.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api/client';
import { loadAllMessagesForSession, saveMessage } from '@/lib/supabase/conversation';
import type { ChatMessage, PMInput, Iteration } from '@/types';
import { ChatMessageList } from './chat-message-list';
import { ChatActionBar } from './chat-action-bar';
import { ChatInput } from './chat-input';
import { VersionSelector } from './version-selector';

const AUTO_OPEN_KEY = 'pm-chat-panel-auto-opened';
const PANEL_OPEN_KEY = 'pm-chat-panel-open';

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ChatPanel({ sessionId }: { sessionId: string | null }) {
  const phase = useSessionStore((s) => s.phase);
  const iterations = useSessionStore((s) => s.iterations);
  const activeIterationNumber = useSessionStore((s) => s.activeIterationNumber);
  const chatMessages = useSessionStore((s) => s.chatMessages);
  const chatPanelOpen = useSessionStore((s) => s.chatPanelOpen);
  const chatLoading = useSessionStore((s) => s.chatLoading);

  const objective = useSessionStore((s) => s.objective);
  const audience = useSessionStore((s) => s.audience);
  const constraints = useSessionStore((s) => s.constraints);
  const outputFormat = useSessionStore((s) => s.outputFormat);
  const mode = useSessionStore((s) => s.mode);
  const customName = useSessionStore((s) => s.customName);
  const customPreamble = useSessionStore((s) => s.customPreamble);
  const customTone = useSessionStore((s) => s.customTone);
  const sessionFacts = useSessionStore((s) => s.sessionFacts);
  const model = useSessionStore((s) => s.model);

  const setActiveIteration = useSessionStore((s) => s.setActiveIteration);
  const appendChatMessage = useSessionStore((s) => s.appendChatMessage);
  const loadAllChatMessages = useSessionStore((s) => s.loadAllChatMessages);
  const setChatLoading = useSessionStore((s) => s.setChatLoading);
  const setChatPanelOpen = useSessionStore((s) => s.setChatPanelOpen);
  const setError = useSessionStore((s) => s.setError);
  const appendIteration = useSessionStore((s) => s.appendIteration);

  const hydratedSessionRef = useRef<string | null>(null);

  // Hydrate persisted open/closed state from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(PANEL_OPEN_KEY);
    if (stored !== null) {
      setChatPanelOpen(stored === '1');
    }
  }, [setChatPanelOpen]);

  // Auto-open the first time an iteration appears.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (iterations.length === 0) return;
    const autoOpened = localStorage.getItem(AUTO_OPEN_KEY);
    if (!autoOpened) {
      setChatPanelOpen(true);
      localStorage.setItem(AUTO_OPEN_KEY, '1');
    }
  }, [iterations.length, setChatPanelOpen]);

  // When a session is loaded, hydrate chat messages from Supabase once.
  useEffect(() => {
    if (!sessionId) return;
    if (hydratedSessionRef.current === sessionId) return;
    hydratedSessionRef.current = sessionId;
    loadAllMessagesForSession(sessionId).then((byIter) => {
      loadAllChatMessages(byIter);
    });
  }, [sessionId, loadAllChatMessages]);

  if (phase !== 'output' || !chatPanelOpen) return null;

  const activeIteration: Iteration | undefined =
    activeIterationNumber !== null
      ? iterations.find((it) => it.iteration_number === activeIterationNumber)
      : iterations[iterations.length - 1];

  if (!activeIteration) return null;

  const messages = chatMessages[activeIteration.iteration_number] || [];

  function buildInputs(): PMInput {
    return {
      objective,
      audience,
      constraints,
      output_format: outputFormat,
      mode,
      session_facts: sessionFacts,
      ...(mode === 'custom' ? { custom_name: customName, custom_preamble: customPreamble, custom_tone: customTone } : {}),
    };
  }

  async function handleSend(text: string) {
    if (!activeIteration) return;
    const userMsg: ChatMessage = {
      id: genId(),
      iteration_number: activeIteration.iteration_number,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    appendChatMessage(activeIteration.iteration_number, userMsg);
    setChatLoading('send');
    setError(null);

    if (sessionId) {
      saveMessage({
        session_id: sessionId,
        iteration_number: activeIteration.iteration_number,
        role: 'user',
        content: text,
      }).catch(() => { /* swallow — UX continues */ });
    }

    try {
      const res = await api.chatMessage({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        user_message: text,
        iteration_history: iterations,
        model,
      });
      appendChatMessage(activeIteration.iteration_number, res.assistant_message);
      if (sessionId) {
        saveMessage({
          session_id: sessionId,
          iteration_number: activeIteration.iteration_number,
          role: 'assistant',
          content: res.assistant_message.content,
        }).catch(() => { /* swallow */ });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat reply failed.');
    } finally {
      setChatLoading(null);
    }
  }

  async function handleApply() {
    if (!activeIteration || messages.length === 0) return;
    setChatLoading('apply');
    setError(null);
    try {
      const res = await api.applyToAnswer({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      appendIteration(res.iteration, res.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply to answer failed.');
    } finally {
      setChatLoading(null);
    }
  }

  async function handleSaveAsNew() {
    if (!activeIteration || messages.length === 0) return;
    setChatLoading('save');
    setError(null);
    try {
      const res = await api.saveAsNewVersion({
        inputs: buildInputs(),
        active_iteration: activeIteration,
        chat_history: messages,
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      appendIteration(res.iteration, res.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save as new version failed.');
    } finally {
      setChatLoading(null);
    }
  }

  return (
    <aside className="hidden md:flex fixed top-16 right-0 bottom-0 w-[380px] bg-white shadow-ambient border-l border-[var(--outline-variant)]/20 flex-col z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]">chat_bubble</span>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">Chat</span>
        </div>
        <button
          type="button"
          onClick={() => setChatPanelOpen(false)}
          aria-label="Close chat"
          className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Version selector */}
      <div className="px-4 py-2 border-b border-[var(--outline-variant)]/20">
        <VersionSelector
          versions={iterations}
          activeNumber={activeIterationNumber}
          onSelect={(n) => setActiveIteration(n)}
        />
      </div>

      {/* Messages */}
      <ChatMessageList messages={messages} loading={chatLoading === 'send'} />

      {/* Actions */}
      <ChatActionBar
        onApplyToAnswer={handleApply}
        onSaveAsNewVersion={handleSaveAsNew}
        disabled={chatLoading !== null || messages.length === 0}
        loading={chatLoading === 'apply' ? 'apply' : chatLoading === 'save' ? 'save' : null}
      />

      {/* Input */}
      <ChatInput
        disabled={chatLoading !== null}
        onSend={handleSend}
      />
    </aside>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
cd frontend && npm run build
```
Expected: succeeds (modulo `output-phase.tsx` cleanup later).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/chat-panel.tsx frontend/src/components/chat/chat-panel-toggle.tsx
git commit -m "feat(frontend): add ChatPanel orchestrator and toggle button"
```

---

## Task 16: Wire chat panel into session shell + top-nav toggle button

**Files:**
- Modify: `frontend/src/app/session/session-shell.tsx`
- Modify: `frontend/src/components/layout/top-nav.tsx`

- [ ] **Step 1: Modify `session-shell.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { TopNav } from '@/components/layout/top-nav';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ChatPanelToggle } from '@/components/chat/chat-panel-toggle';
import { useSessionStore } from '@/stores/session-store';

export function SessionShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const phase = useSessionStore((s) => s.phase);
  const chatPanelOpen = useSessionStore((s) => s.chatPanelOpen);
  const toggleChatPanel = useSessionStore((s) => s.toggleChatPanel);

  // Read session_id from sessionStorage if it exists (client-side persistence pattern).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('pm-session-id');
    setSessionId(stored);
  }, []);

  const showChatRail = phase === 'output' && chatPanelOpen;

  return (
    <TutorialProvider>
      <div className="flex min-h-screen">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[90] md:hidden">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 w-[280px] h-full">
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        <TopNav onMenuToggle={() => setMobileMenuOpen((v) => !v)} />

        <main
          className={`md:ml-[260px] pt-16 md:pt-24 pb-20 px-4 md:px-8 flex-1 w-full transition-all ${
            showChatRail ? 'md:pr-[396px]' : ''
          }`}
        >
          <div className="content-well">
            {children}
          </div>
        </main>

        {/* Chat panel — only rendered on Output phase, only when open */}
        <ChatPanel sessionId={sessionId} />

        {/* Floating toggle when panel is closed and we're on Output phase */}
        {phase === 'output' && !chatPanelOpen && (
          <ChatPanelToggle isOpen={chatPanelOpen} onToggle={toggleChatPanel} />
        )}
      </div>
    </TutorialProvider>
  );
}
```

- [ ] **Step 2: Add a chat-toggle icon button to `top-nav.tsx`**

Read the current file:

```bash
cat frontend/src/components/layout/top-nav.tsx
```

In the existing top-nav, add a chat-toggle button that appears only when on the Output phase. Add this import at the top of the file alongside the existing imports:

```typescript
import { useSessionStore } from '@/stores/session-store';
```

Inside the component body, read state:

```typescript
const phase = useSessionStore((s) => s.phase);
const chatPanelOpen = useSessionStore((s) => s.chatPanelOpen);
const toggleChatPanel = useSessionStore((s) => s.toggleChatPanel);
```

Insert this button into the rightmost group of nav buttons (the area where the existing nav controls live; place it as the last visible button before any user/account control):

```tsx
{phase === 'output' && (
  <button
    type="button"
    onClick={toggleChatPanel}
    title={chatPanelOpen ? 'Close chat' : 'Open chat'}
    aria-label={chatPanelOpen ? 'Close chat' : 'Open chat'}
    className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] transition-colors"
  >
    <span
      className="material-symbols-outlined text-[20px]"
      style={chatPanelOpen ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      chat_bubble
    </span>
  </button>
)}
```

(If the existing top-nav layout uses a different structural element, place the button at the equivalent right-aligned spot — e.g., inside whichever flex container holds the rightmost icon group.)

- [ ] **Step 3: Build the frontend**

```bash
cd frontend && npm run build
```
Expected: succeeds (modulo `output-phase.tsx` `conversationBridge` references — those are removed in Task 17).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/session/session-shell.tsx frontend/src/components/layout/top-nav.tsx
git commit -m "feat(frontend): wire ChatPanel into shell + chat toggle in top nav"
```

---

## Task 17: Refactor `output-phase.tsx`

**Files:**
- Modify: `frontend/src/components/phases/output-phase.tsx`

This is the largest single edit. Goal: remove inline conversation bridge, switch reads to `activeIterationNumber`, surface `summary` on history rows, replace user-facing "Iteration" with "Version".

- [ ] **Step 1: Remove inline conversation bridge state and handler**

Open the file. Delete:
- The `conversationMessage` and `conversationLoading` state declarations (lines ~92-93).
- The `handleConversationBridge` function (lines ~268-288).
- The entire `{/* Conversation Bridge — free-form follow-up */}` block (lines ~378-422).
- The `conversationLoading` term inside the `anyLoading` definition (line ~294).

The new `anyLoading` line:

```typescript
const anyLoading = realignLoading || refineLoading || flowLoading !== null;
```

- [ ] **Step 2: Switch reads to active iteration**

Add to the existing store reads (near the top of the component body, alongside `iterations`):

```typescript
const activeIterationNumber = useSessionStore((s) => s.activeIterationNumber);
const setActiveIteration = useSessionStore((s) => s.setActiveIteration);
```

Replace the `currentIteration` derivation:

```typescript
const currentIteration =
  activeIterationNumber !== null
    ? iterations.find((it) => it.iteration_number === activeIterationNumber) ?? iterations[iterations.length - 1]
    : iterations[iterations.length - 1];
```

Replace `currentOutput` and `currentEval` reads with derived values from `currentIteration`:

```typescript
// Remove these lines (currently from the store):
// const currentOutput = useSessionStore((s) => s.currentOutput);
// const currentEval = useSessionStore((s) => s.currentEval);

// Replace with:
const currentOutput = currentIteration?.output ?? null;
const currentEval = currentIteration?.evaluation ?? null;
```

(The store still maintains `currentOutput` / `currentEval` for backwards-compat, but the Output phase derives from `activeIterationNumber` for correct version display.)

- [ ] **Step 3: Update copy "Iteration" → "Version" in user-visible strings**

Find and replace these specific substrings inside JSX text content:
- `"Iteration History ({iterations.length} iterations)"` → `"Version History ({iterations.length} versions)"`
- `"Mode for next iteration:"` → `"Mode for next version:"`
- `\`Iteration ${iter.iteration_number} (${modeLabel})\`` → `\`Version ${iter.iteration_number} (${modeLabel})\``
- The download filename: `\`promptmaster_iteration_${iterations.length}.txt\`` → keep file name (this is technical, not user-facing)

- [ ] **Step 4: Make iteration history rows click-to-activate**

In the iteration history `<details>` section, find where each row renders (`<div key={iter.iteration_number} className="px-8 py-5">...`). Replace the outer `<div>` with a `<button>` so the whole row is clickable, and add the `onClick` handler. Concretely:

Replace:

```tsx
<div key={iter.iteration_number} className="px-8 py-5">
```

with:

```tsx
<div
  key={iter.iteration_number}
  className={`px-8 py-5 cursor-pointer transition-colors ${
    iter.iteration_number === activeIterationNumber ? 'bg-[var(--surface-container-low)]/40' : 'hover:bg-[var(--surface-container-low)]/20'
  }`}
  onClick={() => setActiveIteration(iter.iteration_number)}
  role="button"
>
```

Inside that block, find buttons whose clicks should *not* trigger the active-version switch (the rate buttons, expand button) and add `e.stopPropagation()` to their onClick handlers. Example for the rate-up button:

```tsx
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    setIterationRating(
      iter.iteration_number,
      rating === 'positive' ? null : 'positive'
    );
  }}
  // ...rest unchanged
>
```

Apply the same `e.stopPropagation()` pattern to the rate-down button and the "Show output / Hide output" toggle button.

- [ ] **Step 5: Surface `iter.summary` on each history row**

Inside the iteration row, after the title row (the one containing `Version {iter.iteration_number} ({modeLabel})`), add a summary line if present:

```tsx
{iter.summary && (
  <p className="text-xs text-[var(--on-surface-variant)] italic mb-2">
    {iter.summary}
  </p>
)}
```

Place this right after the closing `</div>` of the title flex container and before the `flex items-center gap-4 mb-2` controls row.

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build
```
Expected: build passes.

- [ ] **Step 7: Manual smoke check (commit anyway, since we have no UI tests)**

Confirm visually in dev: `npm run dev`, navigate to a session with multiple iterations, verify:
- Version history rows are clickable and switch the main column.
- Summary text appears under iteration title (will be empty if backend hasn't generated yet — manual test by running a 2nd iteration after Task 5).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/phases/output-phase.tsx
git commit -m "refactor(frontend): output phase reads active iteration, removes inline chat, plain copy"
```

---

## Task 18: Add rating confirmation toasts

**Files:**
- Create: `frontend/src/components/shared/inline-toast.tsx`
- Modify: `frontend/src/components/phases/output-phase.tsx` (rate handlers)

- [ ] **Step 1: Create a small inline-toast component**

Create `frontend/src/components/shared/inline-toast.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

interface InlineToastProps {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

export function InlineToast({ message, onDismiss, durationMs = 3000 }: InlineToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-container)] text-[11px] text-[var(--on-surface)] shadow-sm"
    >
      <span className="material-symbols-outlined text-[14px] text-emerald-600">check</span>
      {message}
    </div>
  );
}
```

- [ ] **Step 2: Use the toast in `output-phase.tsx`**

Add to imports at the top of `output-phase.tsx`:

```typescript
import { InlineToast } from '@/components/shared/inline-toast';
```

Add a state variable:

```typescript
const [ratingToast, setRatingToast] = useState<string | null>(null);
```

Update `handleRate` to set the toast message:

```typescript
function handleRate(rating: 'positive' | 'negative') {
  if (!currentIteration) return;
  const next = currentRating === rating ? null : rating;
  setIterationRating(currentIteration.iteration_number, next);
  if (next === 'positive') {
    setRatingToast("Got it — I'll favor this style going forward.");
  } else if (next === 'negative') {
    setRatingToast("Got it — I'll avoid this approach going forward.");
  } else {
    setRatingToast('Rating cleared.');
  }
}
```

Render the toast next to the rating buttons. Find the `<div className="flex items-center gap-1">` block that wraps the thumb-up/thumb-down/copy buttons in the "Generated Output" card, and add the toast right after the closing `</div>` of that block (still inside the `flex items-center justify-between mb-6` wrapper):

```tsx
{ratingToast && (
  <InlineToast message={ratingToast} onDismiss={() => setRatingToast(null)} />
)}
```

For best layout, restructure to put the toast inside the same container as the rating controls. Specifically, change the parent flex from `flex items-center justify-between mb-6` to flow with the toast as a peer:

```tsx
<div className="flex items-center justify-between mb-6 gap-3">
  <span className="text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
    Generated Output
  </span>
  <div className="flex items-center gap-2">
    {ratingToast && (
      <InlineToast message={ratingToast} onDismiss={() => setRatingToast(null)} />
    )}
    <div className="flex items-center gap-1">
      {/* existing thumb up / thumb down / copy buttons unchanged */}
    </div>
  </div>
</div>
```

Apply the same toast pattern in the `setIterationRating` calls inside the iteration history rows. For each `setIterationRating` in the history rows, also set `setRatingToast` with the appropriate message.

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/inline-toast.tsx frontend/src/components/phases/output-phase.tsx
git commit -m "feat(frontend): visible rating confirmation toasts"
```

---

## Task 19: Remove "Get Started" button on landing page

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Inspect the current page**

```bash
grep -n "Get Started\|Sign In\|sign in" frontend/src/app/page.tsx
```

- [ ] **Step 2: Remove the "Get Started" button**

Delete the JSX element/button containing the text "Get Started" (around line 105). If the button is wrapped in a flex container alongside "Sign In", keep "Sign In" centered or as a single CTA, depending on the existing style. Concretely:

- Find the JSX containing `Get Started` (it is a `<Link>` or `<button>`).
- Delete that entire element.
- If the parent container's classes assume two children (e.g., `gap-4`, `flex flex-row`), simplify the container to a single-CTA layout.

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(frontend): remove duplicate Get Started CTA on landing page"
```

---

## Task 20: Audit — ensure all rating-aware prompts include session history

**Files:**
- Test: `backend/tests/test_rating_signal_in_prompts.py`

This is a verification task: confirm every iteration-creating endpoint passes session history (which carries rating signals) into the LLM prompt.

- [ ] **Step 1: Write the test**

Create `backend/tests/test_rating_signal_in_prompts.py`:

```python
"""Verify rating signals propagate into chat / apply / save prompts.

format_session_history adds an explicit instruction to the LLM about user
ratings whenever any iteration in the list is rated. These tests ensure the
new conversation prompt builders include session history in their system
prompts (and therefore that ratings flow through).
"""

from promptmaster.conversation import (
    build_apply_to_answer_prompt,
    build_chat_reply_prompt,
    build_save_as_new_version_prompt,
)
from promptmaster.schemas import (
    DimensionScore,
    EvaluationResult,
    Iteration,
    PMInput,
)


def _rated_iter(rating: str = "positive") -> Iteration:
    return Iteration(
        iteration_number=1,
        prompt_sent="...",
        system_prompt_used="...",
        output="An answer the user liked.",
        mode="architect",
        evaluation=EvaluationResult(
            alignment=DimensionScore(score="High", explanation="."),
            clarity=DimensionScore(score="High", explanation="."),
            drift=DimensionScore(score="Low", explanation="."),
        ),
        user_rating=rating,
    )


def test_chat_reply_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("positive")
    system, _ = build_chat_reply_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        user_message="Hi",
        iterations=[rated],
    )
    assert "STRONG" in system or "rated" in system.lower()


def test_apply_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("negative")
    system, _ = build_apply_to_answer_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        iterations=[rated],
    )
    assert "POOR" in system or "rated" in system.lower()


def test_save_as_new_version_system_includes_rating_directive(basic_inputs):
    rated = _rated_iter("positive")
    system, _ = build_save_as_new_version_prompt(
        inputs=basic_inputs,
        active_iteration=rated,
        chat_history=[],
        iterations=[rated],
    )
    assert "STRONG" in system or "rated" in system.lower()
```

- [ ] **Step 2: Run tests**

```bash
cd backend && pytest tests/test_rating_signal_in_prompts.py -v
```
Expected: All 3 tests pass (since `_shared_system` calls `format_session_history` which emits the directive).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_rating_signal_in_prompts.py
git commit -m "test(backend): verify rating signals propagate into conversation prompts"
```

---

## Task 21: Final smoke verification

**Files:**
- (No file changes — this is end-to-end verification)

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend && pytest -v
```
Expected: All tests pass.

- [ ] **Step 2: Build the frontend**

```bash
cd frontend && npm run build
```
Expected: build succeeds, no type errors.

- [ ] **Step 3: Audit for lingering references to removed names**

```bash
grep -rn "conversationBridge\|conversation-bridge\|build_conversation_prompt\|ConversationBridgeRequest" \
  frontend/src backend --include='*.ts' --include='*.tsx' --include='*.py'
```
Expected: empty output.

- [ ] **Step 4: Audit frontend for `any` / `unknown` in new files**

```bash
grep -rn ": any\|as any\|: unknown" frontend/src/components/chat frontend/src/lib/supabase/conversation.ts frontend/src/lib/api/client.ts
```
Expected: empty output (no `any` / `unknown` in new code).

- [ ] **Step 5: Manual end-to-end smoke (in browser)**

Bring up the app locally (`npm run dev`, backend `uvicorn main:app`). Walk through:

1. Open landing page — confirm only "Sign In" CTA (no "Get Started").
2. Sign in (or stay anonymous), start a new session.
3. Generate the first version. Chat panel auto-opens; iteration #1 has no summary (expected).
4. Send a chat message. See user bubble + assistant reply. No iteration is created.
5. Click **Apply to answer**. New iteration #2 is created. Switch to V2: it has a summary.
6. Click **Save as new version**. New iteration #3 is created with a summary describing the conversation-driven change.
7. Use the version selector to switch between V1 / V2 / V3. Main column + chat panel both update.
8. Click 👍 on a version. Toast appears: *"Got it — I'll favor this style going forward."*
9. Click 👎 on another version. Toast appears with the avoid message.
10. Close chat panel via × — floating button appears. Click to reopen.
11. Refresh page (signed-in user) — chat messages reload from Supabase.

- [ ] **Step 6: Commit any final fixes**

If smoke testing surfaced issues, fix and commit. If everything works:

```bash
git status
```
Expected: clean working tree (no uncommitted changes).

- [ ] **Step 7: Tag the work**

```bash
git log --oneline -25
```
Confirm the commit graph reflects the full Project A scope.

---

## Self-Review Checklist (run after writing this plan)

- ✅ Spec coverage — every section of the design spec maps to at least one task above.
- ✅ No placeholders — every step has exact paths and complete code.
- ✅ Type consistency — `ChatMessage`, `ChatMessageRequest`, etc. are spelled the same way across tasks.
- ✅ Frequent commits — every task ends with a commit step.
- ✅ TDD where it pays — backend prompt builders, summary helper, schema changes all have tests written first.
- ✅ Frontend verification falls back to `npm run build` (no test infra) but type strictness is enforced.

---

## Out of scope (deferred to Project B / C / D specs)

- Completion detection / state continuity / "Continue Document" — Project B
- Smart Setup — Project C
- "Why this works" interpretation, Audit→Action — Project D
