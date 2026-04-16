# Conversation Bridge & Custom Presets — Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Source:** Sean's emails April 8-13 2026 + follow-up message on custom presets

---

## Feature 1: Conversation Bridge

### Problem

After output is generated, users want to interact naturally — ask follow-ups, challenge specific points, go deeper — without picking a specific Flow Trigger or restarting the full flow. Sean's April 12 email: "users still want the ability to interact with the output more naturally."

### Solution

A free-form text input on the Output phase. The user types a message, it gets sent with full session context to the LLM, and the result comes back as a new evaluated iteration.

### Backend

**New endpoint:** `POST /api/conversation-bridge`

Request model (`ConversationBridgeRequest`):
- `inputs: PMInput` — current session inputs
- `current_output: str` — the output the user is responding to
- `user_message: str` — the user's free-form follow-up
- `iteration_number: int`
- `iteration_history: list[Iteration]` — full session history
- `model: str`

Response: `RunIterationResponse` (same as `run-iteration` and `flow-trigger`)

**Prompt construction:** New function `build_conversation_prompt()` in `flow_triggers.py`:
1. System prompt: current mode's system prompt (via `build_prompt`) with full PromptMaster methodology context (`_PROMPTMASTER_CONTEXT`), session history (`format_session_history`), and USER RATINGS instruction
2. User prompt: structured as "Here is the current output, the user's follow-up message, and the original objective. Respond to the user's request while maintaining alignment with the objective."
3. Full eval pipeline: generate -> (eval + suggestions) in parallel

**Session context:** Add `"conversation": "Conversation follow-up"` to `_TRIGGER_LABELS` in `session_context.py`.

### Frontend

**UI location:** Output phase, between the "Generated Output" card and the "Mode for next iteration" card.

**Components:**
- Text area: placeholder "Ask a follow-up, challenge a specific point, or go deeper..."
- Send button with loading spinner
- On success: `appendIteration()` clears text area, new iteration renders with full eval scores
- Disabled when `anyLoading` is true or no `currentOutput`

**API client:** New `api.conversationBridge(req)` method in `client.ts`.

### What it is NOT
- Not a chat interface — single message produces a full evaluated iteration
- Not replacing "Ask Questions" — that's AI-initiated structured Q&A; this is user-initiated free-form
- Not bypassing the evaluation system — every conversation response gets scored

---

## Feature 2: Custom Presets

### Problem

Sean: "should we make the preset constraints and adjacent features customizable where they can add their own or delete them? So like they could have the ones they use most often already registered like presets on a car radio with the ones we have now as the defaults?"

### Solution

Users can add custom constraint and format presets alongside the defaults. Custom presets persist per-user in Supabase (with localStorage fallback for unauthenticated users).

### Storage

**Supabase table: `user_presets`**

```sql
create table user_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('constraint', 'format')),
  label text not null,
  created_at timestamptz default now()
);

alter table user_presets enable row level security;
create policy "Users manage own presets" on user_presets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create unique index user_presets_unique on user_presets(user_id, type, label);
```

**localStorage fallback key:** `pm-custom-presets` — shape `{ constraint: string[], format: string[] }`

### Frontend

**New file: `frontend/src/lib/supabase/presets.ts`**

CRUD following the `templates.ts` pattern:
- `listPresets(type?: 'constraint' | 'format')` — fetch user's custom presets
- `addPreset(type, label, userId)` — insert one preset
- `deletePreset(id)` — remove one preset

**Zustand store additions (session-store.ts):**
- `customConstraintPresets: string[]`
- `customFormatPresets: string[]`
- `setCustomConstraintPresets(presets: string[])` — bulk set (for initial load)
- `setCustomFormatPresets(presets: string[])` — bulk set
- `addCustomConstraintPreset(label: string)` / `addCustomFormatPreset(label: string)`
- `removeCustomConstraintPreset(label: string)` / `removeCustomFormatPreset(label: string)`

**Input phase UI changes:**

Constraint pills section:
1. Default pills from `CONSTRAINT_PRESETS` constant (not deletable)
2. Custom pills from `customConstraintPresets` store — shown with a small "x" delete icon
3. "+" button at the end that expands an inline text input + "Add" button

Same pattern for format pills section with `FORMAT_PRESETS` / `customFormatPresets`.

**Data flow on mount:**
1. Authenticated: fetch from Supabase `user_presets` table, populate store
2. Unauthenticated: load from localStorage `pm-custom-presets`
3. Render: `[...CONSTRAINT_PRESETS, ...customConstraintPresets]` as toggle-able pills

**Handling toggled presets:** When a custom preset is toggled on/off, it goes into `constraintPresets` / `formatPresets` (the existing selected-presets arrays) — same as default presets. The custom presets list is just the available pool.

### What's NOT changing
- Backend is not involved in presets (presets are combined into the `constraints` string before API call)
- Assembled prompt format unchanged
- Default presets stay hardcoded in `constants.ts`
- No migration of localStorage presets to Supabase on login (v1 simplification)

---

## Files to Create/Modify

### Feature 1 (Conversation Bridge)
| Action | File | Description |
|--------|------|-------------|
| Modify | `backend/promptmaster/flow_triggers.py` | Add `build_conversation_prompt()` |
| Modify | `backend/promptmaster/session_context.py` | Add "conversation" to `_TRIGGER_LABELS` |
| Modify | `backend/routers/engine.py` | Add `ConversationBridgeRequest` + `POST /api/conversation-bridge` endpoint |
| Modify | `frontend/src/lib/api/client.ts` | Add `api.conversationBridge()` |
| Modify | `frontend/src/types/index.ts` | Add "conversation" to `FlowTriggerType` if needed |
| Modify | `frontend/src/components/phases/output-phase.tsx` | Add conversation bridge UI section |

### Feature 2 (Custom Presets)
| Action | File | Description |
|--------|------|-------------|
| Create | Supabase migration (run via dashboard) | `user_presets` table + RLS + index |
| Create | `frontend/src/lib/supabase/presets.ts` | CRUD for user_presets table |
| Modify | `frontend/src/stores/session-store.ts` | Add custom preset state + actions |
| Modify | `frontend/src/types/index.ts` | Add `UserPreset` type |
| Modify | `frontend/src/components/phases/input-phase.tsx` | Custom preset pills + add/remove UI |
