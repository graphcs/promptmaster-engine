# Conversation / Iteration Refactor — Design Spec

**Date:** 2026-05-01
**Status:** Approved
**Source:** Sean Moran's emails April 17-29, 2026 (specifically Emails 1, 5, 13, 14)
**Project:** A — first of three planned projects (B = Completion + State Continuity, C = Smart Setup, D = Output Interpretation + Audit→Action)

---

## Problem

The conversation-bridge feature shipped in mid-April auto-promotes every chat follow-up into a structured, evaluated iteration. Sean reviewed it in production and pushed back: this conflates two separate user intents.

> *"It may help to separate 'conversation' from 'structured iteration' a bit more clearly. Right now, follow-ups are feeding back into iterations, but in more conversational use cases it can feel a bit rigid."* — Email 1
>
> *"Conversation = fluid workspace (exploration, back-and-forth, no automatic saving) — Iterations = intentional saved versions (checkpoints the user chooses to keep)."* — Email 5

The new model: **chat is exploration, iterations are checkpoints**. The user explicitly decides when to bring conversation back into the structured workflow.

---

## Solution Summary

Replace the inline conversation textarea on the Output phase with a **dedicated right-side chat panel** that:

1. Has its own chat thread **per version** (each iteration carries its own conversation).
2. Sends pure chat replies (no eval pipeline per message) for fast, fluid back-and-forth.
3. Offers two explicit actions to bring chat insights into structured form:
   - **Apply to answer** → patches the active version's output, becomes a new iteration.
   - **Save as new version** → generates a fresh refined version using chat as input, becomes a new iteration.
4. Persists messages to Supabase so users can resume previous conversations across devices.

Plus several connected pieces:
- **Iteration summaries** ("what changed in this version") generated automatically by an LLM call when iterations are created.
- **Active-version selector** in the chat panel header (and clickable rows in version history) — lets users switch which version they're discussing.
- **Visible feedback for 👍/👎 ratings** so users see that their ratings affect future replies.
- **Plain-language UI copy** site-wide ("Version" not "Iteration", "Chat" not "Conversation Bridge").
- **Removal of the "Get Started" button** on the landing page (Sean Email 1).

---

## Architecture

### Mental Model

```
┌──────────────────────────────────┬─────────────────────────────┐
│  Sidebar (existing)              │                             │
├──────────────────────────────────┤   ┌─────────────────────┐   │
│  Top nav (+ Chat toggle button)  │   │ Chat                │   │
├──────────────────────────────────┤   │ Discussing: V2 ▾    │   │
│                                  │   ├─────────────────────┤   │
│   Generated Output (Version 2)   │   │ [chat messages]     │   │
│   Eval scores                    │   │                     │   │
│   Suggestions                    │   ├─────────────────────┤   │
│   Flow triggers                  │   │ [Apply to answer]   │   │
│   Refine / Finalize buttons      │   │ [Save as new version]│   │
│   Version history                │   ├─────────────────────┤   │
│                                  │   │ [Type a message…]   │   │
│                                  │   └─────────────────────┘   │
└──────────────────────────────────┴─────────────────────────────┘
```

Chat panel only appears on the **Output phase**. Default-closed before the first generation; auto-opens once the first version exists; remembers the user's open/closed preference in `localStorage` thereafter.

### Layer Responsibilities

| Layer | Responsibility |
|---|---|
| Chat panel UI | Display chat thread per active version, send messages, expose Apply/Save actions |
| Backend chat endpoint | Pure LLM reply (1 call), no eval, no iteration created |
| Backend Apply/Save endpoints | Generate new iteration from conversation + run eval/suggestions/summary in parallel |
| Supabase | Persist messages per-user, per-session, per-iteration |
| Zustand store | Hold active iteration, per-iteration message map, panel open/closed state |

---

## Data Model

### Supabase: New `conversation_messages` Table

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

Notes:
- `session_id` is `text` (matches existing 8-hex `sessions.session_id`); no FK to keep client-side session creation flexible.
- Composite index covers the primary access pattern: load all messages for a session+iteration ordered by time.
- RLS scoped to `user_id` (same pattern as `templates`, `sessions`, `user_presets`).

### Backend Schema Changes (`backend/promptmaster/schemas.py`)

```python
class Iteration(BaseModel):
    # ...existing fields...
    summary: str | None = Field(
        default=None,
        description="Brief LLM-generated summary of what changed from the previous version.",
    )

class ChatMessage(BaseModel):
    id: str
    iteration_number: int = Field(..., ge=1)
    role: Literal['user', 'assistant']
    content: str
    created_at: str
```

### Frontend State (`frontend/src/stores/session-store.ts`)

New state:
- `activeIterationNumber: number | null` — the version visible in the main column AND in the chat panel
- `chatMessages: Record<number, ChatMessage[]>` — keyed by iteration number
- `chatPanelOpen: boolean` — synced with `localStorage` key `pm-chat-panel-open`
- `chatLoading: boolean`

New actions:
- `setActiveIteration(n: number)`
- `appendChatMessage(iter: number, msg: ChatMessage)`
- `loadChatMessages(iter: number, msgs: ChatMessage[])`
- `setChatLoading(b: boolean)`
- `toggleChatPanel()`
- `setChatPanelOpen(b: boolean)`

Behavior change in existing readers: `currentOutput`, `currentEval`, `suggestions` now derive from `iterations[activeIterationNumber - 1]`, not `iterations[iterations.length - 1]`. When a new iteration is appended, `activeIterationNumber` auto-advances to it.

---

## Backend API

### New Endpoints

| Endpoint | Purpose | LLM calls | Returns |
|---|---|---|---|
| `POST /api/chat-message` | Pure chat reply, no eval, no iteration | 1 | `{ assistant_message: ChatMessage }` |
| `POST /api/apply-to-answer` | Patch active version with chat insights → new iteration | 4 (parallel) | `{ iteration, suggestions }` |
| `POST /api/save-as-new-version` | Generate fresh version from chat context → new iteration | 4 (parallel) | `{ iteration, suggestions }` |

### Request / Response Shapes

```python
class ChatMessageRequest(BaseModel):
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage]
    user_message: str
    model: str

class ChatMessageResponse(BaseModel):
    assistant_message: ChatMessage

class ApplyToAnswerRequest(BaseModel):
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage]
    iteration_number: int  # next number to assign
    iteration_history: list[Iteration]
    model: str

class SaveAsNewVersionRequest(BaseModel):
    # Same shape as ApplyToAnswerRequest
    inputs: PMInput
    active_iteration: Iteration
    chat_history: list[ChatMessage]
    iteration_number: int
    iteration_history: list[Iteration]
    model: str

class IterationFromConversationResponse(BaseModel):
    iteration: Iteration
    suggestions: list[str]
```

### Prompt Builders

New module `backend/promptmaster/conversation.py`:

- `build_chat_reply_prompt(inputs, active_iteration, chat_history, user_message) -> tuple[str, str]`
  - System: PromptMaster context + mode system prompt + `format_session_history(iteration_history)` + chat-mode instruction ("you are continuing a fluid conversation about this answer; reply naturally")
  - User: original objective + active version output + chat thread + user_message

- `build_apply_to_answer_prompt(inputs, active_iteration, chat_history) -> tuple[str, str]`
  - System: same context, plus instruction "revise the existing answer to incorporate the conversation insights while preserving alignment to the original objective"
  - User: objective + current output + chat thread

- `build_save_as_new_version_prompt(inputs, active_iteration, chat_history) -> tuple[str, str]`
  - System: same context, plus instruction "produce a new improved answer informed by the conversation; treat conversation as additional constraints"
  - User: objective + audience + constraints + format + chat thread (no current output passed — fresh generation)

### Summary Helper

New module `backend/promptmaster/summaries.py`:

```python
async def generate_summary(
    client: OpenRouterClient,
    model: str,
    inputs: PMInput,
    prev_iter: Iteration,
    new_iter: Iteration,
    chat_history: list[ChatMessage] | None = None,
    user_action: str = "",
) -> str:
    """Generate a 1-2 sentence summary of what changed.

    Includes objective, audience, constraints, prev output, new output,
    user_action (e.g. trigger source label), and chat history if relevant.
    """
```

The summary prompt explicitly receives:
- Original objective
- Audience
- Constraints / output format
- Previous iteration's output
- New iteration's output
- User action label (e.g. "Apply to answer", "Refine: more concrete", "Challenge This")
- Chat thread that led to this version (if any)

This matches the user's directive to give the summary call full context.

### Endpoints That Get Updated

`/api/run-iteration`, `/api/flow-trigger`, `/api/apply-to-answer`, and `/api/save-as-new-version` all create iterations. Each runs `generate_summary` in parallel via `asyncio.gather` alongside the existing eval + suggestions calls. Iteration #1 skips summary generation (nothing to compare to).

### New Router

`backend/routers/conversation.py` hosts the three new endpoints. Wired into `main.py`. Keeps `engine.py` from growing further.

### Removed

- `POST /api/conversation-bridge` (in `engine.py`)
- `ConversationBridgeRequest` model
- `build_conversation_prompt` (in `flow_triggers.py`)

### Backwards Compatibility

`Iteration.trigger_source = "conversation"` remains a valid historical label in `_TRIGGER_LABELS` so old saved sessions render correctly. New iterations from chat use:
- `"apply_conversation"` (Apply to answer)
- `"refined_from_conversation"` (Save as new version)

These are added to `_TRIGGER_LABELS` with friendly labels.

### Rating-Aware Prompts

All new endpoints (`chat-message`, `apply-to-answer`, `save-as-new-version`) include `format_session_history(iterations)` in their system prompt. The existing `format_session_history` already weaves user ratings (👍/👎) into the LLM's instructions:

> *"NOTE: The user has explicitly rated some iterations STRONG or POOR. Treat these ratings as direct signal about their preferences. Favor approaches from STRONG iterations; avoid repeating approaches from POOR iterations."*

This ensures ratings carry through into chat replies, applied updates, and new versions.

---

## Frontend Components

### New Directory: `frontend/src/components/chat/`

```
chat/
├── chat-panel.tsx          # Main container (right rail), open/close logic, layout
├── chat-message-list.tsx   # Scrollable thread, auto-scroll on new message
├── chat-message-bubble.tsx # Single message — user (right) / assistant (left)
├── chat-input.tsx          # Textarea + Send button, Cmd+Enter handler
├── chat-action-bar.tsx     # "Apply to answer" + "Save as new version" buttons
├── version-selector.tsx    # Dropdown of all versions w/ summaries + ratings
└── chat-panel-toggle.tsx   # Floating open/close button when collapsed
```

Each component has one responsibility. Target file size: under 150 lines. Presentational components take props; orchestration logic lives only in `chat-panel.tsx`.

### Component Interfaces

```typescript
interface ChatPanelProps {
  // No props — reads everything from store
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

interface ChatInputProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

interface ChatActionBarProps {
  onApplyToAnswer: () => void;
  onSaveAsNewVersion: () => void;
  disabled: boolean;
  loading: 'apply' | 'save' | null;
}

interface VersionSelectorProps {
  versions: Iteration[];
  activeNumber: number | null;
  onSelect: (n: number) => void;
}

interface ChatPanelToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}
```

### New Module: `frontend/src/lib/supabase/conversation.ts`

```typescript
export async function loadMessages(
  sessionId: string,
  iterationNumber: number
): Promise<ChatMessage[]>;

export async function saveMessage(
  msg: Omit<ChatMessage, 'id' | 'created_at'>
): Promise<ChatMessage>;

export async function loadAllMessagesForSession(
  sessionId: string
): Promise<Record<number, ChatMessage[]>>;
```

Anonymous users: in-memory only. No localStorage fallback (chat threads can grow large; ephemeral is the right default for unauthenticated state). A subtle "Sign in to save your chats" hint appears below the chat input.

### API Client (`frontend/src/lib/api/client.ts`)

```typescript
api.chatMessage(req: ChatMessageRequest): Promise<ChatMessageResponse>
api.applyToAnswer(req: ApplyToAnswerRequest): Promise<IterationFromConversationResponse>
api.saveAsNewVersion(req: SaveAsNewVersionRequest): Promise<IterationFromConversationResponse>
```

Removed: `api.conversationBridge`.

### Type Additions (`frontend/src/types/index.ts`)

```typescript
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  iteration_number: number;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface ChatMessageRequest { /* ... */ }
export interface ChatMessageResponse { /* ... */ }
export interface ApplyToAnswerRequest { /* ... */ }
export interface SaveAsNewVersionRequest { /* ... */ }
export interface IterationFromConversationResponse { /* ... */ }
```

`Iteration` interface gains `summary?: string`.

### Modifications to Existing Components

**`output-phase.tsx`:**
- Remove the inline "Continue the conversation" textarea, related state (`conversationMessage`, `conversationLoading`), and `handleConversationBridge`.
- Read from `activeIterationNumber` everywhere instead of `iterations.length - 1`.
- Iteration history rows: clicking a row sets `activeIterationNumber`. Show `iter.summary` below the iteration number when present (italic, muted color).
- Rename "Iteration" → "Version" in user-facing strings.

**`session-shell.tsx`:**
- Render `<ChatPanel />` as a sibling of the content well when on Output phase.
- Adjust content well max-width / padding when chat panel is open.

**`top-nav.tsx`:**
- Add a `chat_bubble_outline` icon button, visible on Output phase only. Click toggles `chatPanelOpen`.

**`page.tsx` (landing):**
- Remove the "Get Started" button.

---

## UI Copy & Visual Details

### Naming Convention

User-facing copy uses **"Version"** instead of **"Iteration"**:
- "Iteration history" → "Version history"
- "Mode for next iteration" → "Mode for next version"
- "Iteration 3" → "Version 3"

Internal code keeps `iteration` / `iteration_number` / `Iteration` type names — this is a copy/UX change, not a refactor.

### Chat Panel Strings

| Location | Copy |
|---|---|
| Panel header | **Chat** |
| Selector closed state | **Discussing: Version 2** |
| Selector dropdown row | **Version 1** + summary preview (truncated ~60 chars) + rating badge if present |
| Empty thread placeholder | *"Ask a follow-up about this answer, or just think out loud."* |
| Input placeholder | *"Type a message…"* |
| Send button | **Send** / **Sending…** while loading |
| Cmd+Enter hint | *"Cmd+Enter to send"* |
| Apply button | **Apply to answer** / **Updating…** while loading |
| Save button | **Save as new version** / **Saving…** while loading |
| Apply tooltip | *"Update this version using what you discussed."* |
| Save tooltip | *"Create a new version using your chat as a guide."* |
| Disabled-when-empty tooltip | *"Send a message first."* |
| Network error toast | *"Couldn't reach the server. Try again?"* |
| Closed-state floating button | tooltip *"Open chat"* |
| Anonymous user banner | *"Sign in to save your chats."* |

### Rating Confirmation Toasts

Clicking 👍 / 👎 / clearing surfaces a small auto-dismissing toast (~3s):
- 👍 → *"Got it — I'll favor this style going forward."*
- 👎 → *"Got it — I'll avoid this approach going forward."*
- Clear → *"Rating cleared."*

### Version History Row Layout

```
Version 3 (Architect) 👎               Alignment: High  Drift: Low  Clarity: High
Made the answer more concrete and added specific examples.
[Show output] [👍] [👎]
```

Summary in `text-[var(--on-surface-variant)]`, italic, smaller. Rating badge appears beside the version label when set.

### Visual Treatment

- Panel: `bg-white`, `shadow-ambient`, ~380px wide on desktop.
- Header strip: `bg-[var(--surface-container-low)]` with version selector + close (×).
- User bubbles: right-aligned, `bg-[var(--pm-primary-container)]`, white text, plain text rendering.
- Assistant bubbles: left-aligned, `bg-[var(--surface-container-low)]`, dark text, rendered via existing `MarkdownOutput`.
- Auto-scroll to bottom on new message; "Jump to latest" pill if user has scrolled up.

### Responsive

- ≥768px: 380px right rail; main content well shrinks.
- <768px: panel becomes a fullscreen drawer triggered by chat icon in top nav.

---

## Data Flow Walkthroughs

### Flow 1 — First Output Appears

1. User clicks Execute on Review phase. `/api/run-iteration` runs.
2. Iteration #1 lands. Backend skips summary generation (no prior iteration).
3. `setActiveIteration(1)`.
4. Chat panel auto-opens (first time only — sentinel `pm-chat-panel-auto-opened` set in `localStorage`).
5. `chatMessages[1] = []`. Empty state visible.

### Flow 2 — User Sends a Chat Message

1. User types, hits Send (or Cmd+Enter).
2. Optimistic append: user message goes into store immediately.
3. `setChatLoading(true)`. Send button disabled.
4. Two parallel calls:
   - `saveMessage()` to Supabase
   - `api.chatMessage(...)`
5. Backend returns `assistant_message`. Append to store. Persist to Supabase.
6. `setChatLoading(false)`. Auto-scroll to bottom.

Single in-flight rule: send button disabled until reply lands. Prevents race conditions.

### Flow 3 — Apply to Answer

1. Apply button disabled when `chatMessages[activeIterationNumber].length === 0`.
2. Click → `setChatLoading('apply')`.
3. `api.applyToAnswer(...)`. Backend runs generation + eval + suggestions + summary in parallel.
4. Returns `{ iteration, suggestions }`. Store appends iteration.
5. `setActiveIteration(new_iteration_number)` auto-jumps to it.
6. New version starts with empty chat. Old chat preserved on its previous iteration.

### Flow 4 — Save as New Version

Same as Flow 3 with the `save-as-new-version` endpoint and prompt.

### Flow 5 — Switching Versions

1. User picks Version N from selector (or clicks a row in version history).
2. `setActiveIteration(N)`.
3. Main column re-renders from `iterations[N - 1]`.
4. Chat panel switches to `chatMessages[N]`.
5. If `chatMessages[N]` is `undefined` (post-refresh case), fetch via `loadMessages(sessionId, N)`.

### Flow 6 — Resuming a Saved Session

1. Existing Supabase session load happens.
2. Additional call: `loadAllMessagesForSession(sessionId)` populates `chatMessages`.
3. `setActiveIteration(iterations.length)` resumes on the latest version.
4. `chatPanelOpen` honors the user's persisted preference.

### Flow 7 — Panel Open / Close

- `toggleChatPanel()` flips `chatPanelOpen` and writes to `localStorage`.
- Closed state: floating chat icon button appears at the right edge. Top-nav chat icon also toggles.

---

## Edge Cases

- Apply / Save buttons disabled when chat thread is empty (no signal to apply).
- Flow triggers (Challenge / Self-audit / Reframe / Drift Alert / Refine-as / Realignment) still create iterations and auto-advance `activeIterationNumber`.
- Realignment iterations also receive a summary via the parallel summary call.
- LLM in-flight on chat → cannot send another message. Apply/Save still possible if you click them, but their requests will use the chat history captured at click time.
- Anonymous users: chat lives in Zustand only, lost on tab close. Anonymous banner shown.
- Supabase save failure during chat: log error, do not block UI. User still sees the reply.
- Old sessions with `trigger_source = "conversation"` iterations from the previous bridge: render as "Conversation follow-up" (legacy label). No chat panel data exists for them; their chat threads start empty.

---

## Removals

- `frontend/src/components/phases/output-phase.tsx`: in-line conversation bridge UI, related state, handler.
- `frontend/src/lib/api/client.ts`: `api.conversationBridge`.
- `backend/routers/engine.py`: `ConversationBridgeRequest` + `/api/conversation-bridge`.
- `backend/promptmaster/flow_triggers.py`: `build_conversation_prompt`.
- `frontend/src/app/page.tsx`: "Get Started" button.

---

## Out of Scope

Explicitly deferred (each will get its own design spec):

- Trigger-source jargon audit in eval text — Project D
- "Why this works" interpretation layer above eval — Project D
- Smart Setup auto-generate — Project C
- Completion detection / "Continue Document" — Project B
- State continuity / structured snapshots — Project B
- Audit→Action workflow — Project D
- Cross-session learning — not now (Sean's directive)
- LLM tool calling — revisit during Project B (better fit there)

---

## Testing Strategy

Backend: introduce `pytest` test infrastructure (new under `backend/tests/`).

Initial test suites:
- `tests/test_conversation_prompts.py` — assert that each new prompt builder includes objective, audience, active output, chat history, and `format_session_history` output.
- `tests/test_summaries.py` — assert summary prompt includes all required context fields.
- `tests/test_session_context.py` — assert `format_session_history` includes the rating directive when iterations have ratings.
- `tests/test_endpoint_shapes.py` — Pydantic round-trip tests for new request/response models.

Configuration:
- Add `pytest` and `pytest-asyncio` to `backend/requirements.txt`.
- Add `pyproject.toml` or `pytest.ini` with sensible defaults.
- Tests must not call OpenRouter — all LLM calls mocked or asserted against the assembled prompt strings only.

Frontend:
- Continue relying on `npm run build` + TypeScript strict mode for type safety.
- No `any` / `unknown` types in new code.
- Manual smoke testing in dev for the chat panel and persistence.
- Vitest setup deferred (would be its own task; pytest gives us the highest-leverage coverage now).

---

## Migration

User runs the SQL migration block (above) in the Supabase SQL editor before this work ships. The localStorage sentinel `pm-chat-panel-auto-opened` is set after the first auto-open so we don't keep auto-opening on every session.

No data migration needed for existing sessions — old iterations carry no chat messages, and that's fine.

---

## Open Questions Remaining

None. All design decisions resolved during brainstorming.
