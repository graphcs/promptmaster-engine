# Conversation Bridge & Custom Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-form conversation follow-up on the output phase and user-customizable constraint/format presets.

**Architecture:** Two independent features. Conversation Bridge adds a new backend endpoint + prompt builder + frontend UI section on the output phase. Custom Presets adds a Supabase table + frontend CRUD + Zustand state + input phase UI pills with add/remove.

**Tech Stack:** FastAPI (Python), Next.js 16, Tailwind CSS v4, Zustand, Supabase (RLS), localStorage fallback

**Verification:** This project has no test suite. All verification is via `npm run build` (TypeScript compilation) and backend server start (`uvicorn main:app`). Manual browser testing for UI.

---

### Task 1: Backend — Session context + conversation prompt builder

**Files:**
- Modify: `backend/promptmaster/session_context.py:13-26` (add trigger label)
- Modify: `backend/promptmaster/flow_triggers.py` (add `build_conversation_prompt`)

- [ ] **Step 1: Add "conversation" trigger label to session_context.py**

In `backend/promptmaster/session_context.py`, add `"conversation"` to the `_TRIGGER_LABELS` dict:

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
    "conversation": "Conversation follow-up",
}
```

- [ ] **Step 2: Add `build_conversation_prompt()` to flow_triggers.py**

Add this function after `build_refine_prompt()` and before `build_flow_trigger_prompt()` in `backend/promptmaster/flow_triggers.py`:

```python
def build_conversation_prompt(
    inputs: PMInput,
    current_output: str,
    user_message: str,
    iterations: list[Iteration] | None = None,
) -> tuple[str, str]:
    """Conversation Bridge — user sends a free-form follow-up on the output.

    Unlike flow triggers (which have pre-defined prompts), this lets the user
    interact naturally with the output: ask follow-ups, challenge specific parts,
    or request deeper exploration.
    """
    base = build_prompt(inputs)
    mode_display = (
        inputs.custom_name or "Custom"
        if inputs.mode == "custom"
        else MODES[inputs.mode]["display_name"]
    )

    system = (
        f"{_PROMPTMASTER_CONTEXT}\n\n"
        f"{base.system_prompt}\n\n"
        "CONVERSATION BRIDGE: The user is interacting directly with the previous output. "
        "They may be asking a follow-up question, challenging a specific point, requesting "
        "more depth on a section, or giving new direction. Respond to their message while "
        "maintaining alignment with the original objective. Do not repeat the previous output "
        "verbatim — produce a new, focused response that addresses what the user asked."
    )
    user = (
        f"Original objective: {inputs.objective}\n"
        f"Audience: {inputs.audience}\n"
    )
    if inputs.constraints.strip():
        user += f"Constraints: {inputs.constraints}\n"
    if inputs.output_format.strip():
        user += f"Format: {inputs.output_format}\n"
    user += (
        f"\n{format_session_history(iterations or [])}\n\n"
        f"--- CURRENT OUTPUT (what the user is responding to) ---\n{current_output}\n--- END CURRENT OUTPUT ---\n\n"
        f"--- USER'S MESSAGE ---\n{user_message}\n--- END USER'S MESSAGE ---\n\n"
        f"Respond to the user's message. Stay in {mode_display} Mode. "
        "Keep your response aligned with the original objective."
    )
    return system, user
```

- [ ] **Step 3: Verify backend starts cleanly**

Run: `cd /root/code/PromptMaster/backend && python -c "from promptmaster.flow_triggers import build_conversation_prompt; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/promptmaster/session_context.py backend/promptmaster/flow_triggers.py
git commit -m "feat(backend): add conversation bridge prompt builder and trigger label"
```

---

### Task 2: Backend — Conversation bridge endpoint

**Files:**
- Modify: `backend/routers/engine.py` (add request model + endpoint)

- [ ] **Step 1: Add ConversationBridgeRequest model**

In `backend/routers/engine.py`, add after the `FlowInspectResponse` class (around line 107):

```python
class ConversationBridgeRequest(BaseModel):
    inputs: PMInput
    current_output: str
    user_message: str
    iteration_number: int
    iteration_history: list[Iteration] = []
    model: str = ""
```

- [ ] **Step 2: Add the import for build_conversation_prompt**

Update the import from `promptmaster.flow_triggers` at the top of `engine.py`:

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

- [ ] **Step 3: Add the endpoint**

Add after the `/flow-inspect` endpoint (after line 285):

```python
@router.post("/conversation-bridge")
async def api_conversation_bridge(
    req: ConversationBridgeRequest,
    client: OpenRouterClient = Depends(get_client),
) -> RunIterationResponse:
    """Conversation Bridge — user sends a free-form follow-up on the output.

    Builds a context-rich prompt from the user's message + session history,
    then runs the full pipeline: generate -> (evaluate || suggestions) in parallel.
    """
    try:
        model = req.model or None
        history = req.iteration_history

        system_text, prompt_text = build_conversation_prompt(
            inputs=req.inputs,
            current_output=req.current_output,
            user_message=req.user_message,
            iterations=history,
        )

        # Generate
        output = await generate(
            client=client,
            prompt_text=prompt_text,
            system_text=system_text,
            model=model,
        )

        # Evaluate + suggestions in parallel
        eval_task = evaluate_output(client, req.inputs, output, iterations=history, model=model)
        suggestions_task = generate_suggestions(
            client=client,
            inputs=req.inputs,
            output=output,
            iterations=history,
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
            trigger_source="conversation",
        )

        return RunIterationResponse(iteration=iteration, suggestions=suggestions)
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
```

- [ ] **Step 4: Verify backend starts cleanly**

Run: `cd /root/code/PromptMaster/backend && python -c "from routers.engine import router; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/engine.py
git commit -m "feat(backend): add POST /api/conversation-bridge endpoint"
```

---

### Task 3: Frontend — Conversation bridge API client + types

**Files:**
- Modify: `frontend/src/lib/api/client.ts` (add `conversationBridge` method)

- [ ] **Step 1: Add `api.conversationBridge()` method**

In `frontend/src/lib/api/client.ts`, add after the `flowInspect` method (after line 87):

```typescript
  async conversationBridge(req: {
    inputs: PMInput;
    current_output: string;
    user_message: string;
    iteration_number: number;
    iteration_history?: Iteration[];
    model?: string;
  }): Promise<{ iteration: Iteration; suggestions: string[] }> {
    return apiFetch('/api/conversation-bridge', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
```

- [ ] **Step 2: Verify build passes**

Run: `cd /root/code/PromptMaster/frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add conversationBridge API client method"
```

---

### Task 4: Frontend — Conversation bridge UI

**Files:**
- Modify: `frontend/src/components/phases/output-phase.tsx`

- [ ] **Step 1: Add conversation bridge state**

In the `OutputPhase` component, add these state variables after the existing `refineMenuRef` line (around line 90):

```typescript
  const [conversationMessage, setConversationMessage] = useState('');
  const [conversationLoading, setConversationLoading] = useState(false);
```

Update `anyLoading` (around line 269) to include conversationLoading:

```typescript
  const anyLoading = realignLoading || refineLoading || flowLoading !== null || conversationLoading;
```

- [ ] **Step 2: Add handleConversationBridge function**

Add after the `handleCopy` function (after line 263):

```typescript
  async function handleConversationBridge() {
    if (!currentOutput || !conversationMessage.trim()) return;
    setError(null);
    setConversationLoading(true);
    try {
      const result = await api.conversationBridge({
        inputs: buildInputs(),
        current_output: currentOutput,
        user_message: conversationMessage.trim(),
        iteration_number: iterations.length + 1,
        iteration_history: iterations,
        model,
      });
      appendIteration(result.iteration, result.suggestions);
      setConversationMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversation follow-up failed.');
    } finally {
      setConversationLoading(false);
    }
  }
```

- [ ] **Step 3: Add conversation bridge UI section**

Insert this JSX block after the "Generated Output" card closing `</div>` (after line 351) and before the "Mode for next iteration" card (line 353):

```tsx
      {/* Conversation Bridge — free-form follow-up */}
      {currentOutput && (
        <div className="bg-white rounded-xl shadow-ambient p-6 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">
            Continue the conversation
          </label>
          <textarea
            value={conversationMessage}
            onChange={(e) => setConversationMessage(e.target.value)}
            placeholder="Ask a follow-up, challenge a specific point, or go deeper..."
            rows={3}
            disabled={anyLoading}
            className="w-full bg-[var(--surface-container-low)] rounded-lg px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 focus:bg-white transition-all duration-200 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleConversationBridge();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--on-surface-variant)]">
              Cmd+Enter to send
            </span>
            <button
              type="button"
              onClick={handleConversationBridge}
              disabled={anyLoading || !conversationMessage.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {conversationLoading ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify build passes**

Run: `cd /root/code/PromptMaster/frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/phases/output-phase.tsx
git commit -m "feat(frontend): add conversation bridge UI on output phase"
```

---

### Task 5: Supabase — Create user_presets table

**Files:**
- Run SQL via Supabase dashboard or CLI

- [ ] **Step 1: Create the table via Supabase SQL editor**

Run this SQL in the Supabase dashboard SQL editor:

```sql
create table user_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('constraint', 'format')),
  label text not null,
  created_at timestamptz default now()
);

alter table user_presets enable row level security;

create policy "Users manage own presets"
  on user_presets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create unique index user_presets_unique on user_presets(user_id, type, label);
```

- [ ] **Step 2: Verify the table exists**

In Supabase SQL editor, run: `select count(*) from user_presets;`
Expected: `0` (empty table, no errors)

---

### Task 6: Frontend — Supabase presets CRUD + localStorage fallback

**Files:**
- Create: `frontend/src/lib/supabase/presets.ts`

- [ ] **Step 1: Create presets.ts**

Create `frontend/src/lib/supabase/presets.ts`:

```typescript
import { createClient } from './client';

export interface UserPreset {
  id: string;
  type: 'constraint' | 'format';
  label: string;
}

const LOCAL_STORAGE_KEY = 'pm-custom-presets';

// --- Supabase CRUD (authenticated users) ---

export async function listPresets(
  type?: 'constraint' | 'format'
): Promise<UserPreset[]> {
  const supabase = createClient();
  let query = supabase
    .from('user_presets')
    .select('id, type, label')
    .order('created_at', { ascending: true });

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserPreset[];
}

export async function addPreset(
  type: 'constraint' | 'format',
  label: string,
  userId: string
): Promise<UserPreset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_presets')
    .insert({ user_id: userId, type, label })
    .select('id, type, label')
    .single();

  if (error) throw error;
  return data as UserPreset;
}

export async function deletePreset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_presets')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// --- localStorage fallback (unauthenticated users) ---

interface LocalPresets {
  constraint: string[];
  format: string[];
}

function getLocalPresets(): LocalPresets {
  if (typeof window === 'undefined') return { constraint: [], format: [] };
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { constraint: [], format: [] };
    return JSON.parse(raw) as LocalPresets;
  } catch {
    return { constraint: [], format: [] };
  }
}

function saveLocalPresets(presets: LocalPresets): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(presets));
}

export function listLocalPresets(type: 'constraint' | 'format'): string[] {
  return getLocalPresets()[type];
}

export function addLocalPreset(type: 'constraint' | 'format', label: string): void {
  const presets = getLocalPresets();
  if (!presets[type].includes(label)) {
    presets[type].push(label);
    saveLocalPresets(presets);
  }
}

export function removeLocalPreset(type: 'constraint' | 'format', label: string): void {
  const presets = getLocalPresets();
  presets[type] = presets[type].filter((p) => p !== label);
  saveLocalPresets(presets);
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /root/code/PromptMaster/frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/supabase/presets.ts
git commit -m "feat(frontend): add Supabase presets CRUD with localStorage fallback"
```

---

### Task 7: Frontend — Zustand store additions for custom presets

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

- [ ] **Step 1: Add custom preset state and actions to the interface**

In the `SessionState` interface (around line 6), add after `activeStackId` (line 50):

```typescript
  // User's custom presets (loaded from Supabase or localStorage)
  customConstraintPresets: string[];
  customFormatPresets: string[];
```

Add these actions to the interface after `setActiveStack` (line 78):

```typescript
  setCustomConstraintPresets: (presets: string[]) => void;
  setCustomFormatPresets: (presets: string[]) => void;
  addCustomConstraintPreset: (label: string) => void;
  removeCustomConstraintPreset: (label: string) => void;
  addCustomFormatPreset: (label: string) => void;
  removeCustomFormatPreset: (label: string) => void;
```

- [ ] **Step 2: Add initial state values**

In the `initialState` object, add after `activeStackId: null` (line 114):

```typescript
  customConstraintPresets: [] as string[],
  customFormatPresets: [] as string[],
```

- [ ] **Step 3: Add action implementations**

In the store implementation (inside `persist((set) => ({ ... }))`), add after `setActiveStack`:

```typescript
      setCustomConstraintPresets: (customConstraintPresets) => set({ customConstraintPresets }),
      setCustomFormatPresets: (customFormatPresets) => set({ customFormatPresets }),
      addCustomConstraintPreset: (label) =>
        set((state) => ({
          customConstraintPresets: state.customConstraintPresets.includes(label)
            ? state.customConstraintPresets
            : [...state.customConstraintPresets, label],
        })),
      removeCustomConstraintPreset: (label) =>
        set((state) => ({
          customConstraintPresets: state.customConstraintPresets.filter((p) => p !== label),
          constraintPresets: state.constraintPresets.filter((p) => p !== label),
        })),
      addCustomFormatPreset: (label) =>
        set((state) => ({
          customFormatPresets: state.customFormatPresets.includes(label)
            ? state.customFormatPresets
            : [...state.customFormatPresets, label],
        })),
      removeCustomFormatPreset: (label) =>
        set((state) => ({
          customFormatPresets: state.customFormatPresets.filter((p) => p !== label),
          formatPresets: state.formatPresets.filter((p) => p !== label),
        })),
```

Note: `removeCustomConstraintPreset` and `removeCustomFormatPreset` also clear the label from the selected presets (`constraintPresets`/`formatPresets`) so a deleted preset doesn't stay toggled on.

- [ ] **Step 4: Verify build passes**

Run: `cd /root/code/PromptMaster/frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add custom preset state and actions to Zustand store"
```

---

### Task 8: Frontend — Extend ConstraintPills component + update input phase

**Files:**
- Modify: `frontend/src/components/shared/constraint-pills.tsx` (add custom presets support)
- Modify: `frontend/src/components/phases/input-phase.tsx` (wire custom presets)

- [ ] **Step 1: Extend ConstraintPills to support custom presets**

Replace the contents of `frontend/src/components/shared/constraint-pills.tsx` with:

```tsx
'use client';

import { useState } from 'react';

interface ConstraintPillsProps {
  presets: string[];
  selected: string[];
  onToggle: (preset: string) => void;
  customPresets?: string[];
  onAddCustom?: (label: string) => void;
  onRemoveCustom?: (label: string) => void;
}

export function ConstraintPills({
  presets,
  selected,
  onToggle,
  customPresets = [],
  onAddCustom,
  onRemoveCustom,
}: ConstraintPillsProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  function handleAdd() {
    const label = newLabel.trim();
    if (!label || !onAddCustom) return;
    onAddCustom(label);
    setNewLabel('');
    setAdding(false);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {/* Default presets */}
      {presets.map((preset) => {
        const isActive = selected.includes(preset);
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onToggle(preset)}
            className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-[var(--pm-primary-container)] text-white'
                : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'
            }`}
          >
            <span>{preset}</span>
            <span
              className={`material-symbols-outlined text-[18px] ${isActive ? '' : 'opacity-20'}`}
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {isActive ? 'check_circle' : 'add_circle'}
            </span>
          </button>
        );
      })}

      {/* Custom presets (with remove button) */}
      {customPresets.map((preset) => {
        const isActive = selected.includes(preset);
        return (
          <div key={`custom-${preset}`} className="flex items-stretch gap-0">
            <button
              type="button"
              onClick={() => onToggle(preset)}
              className={`flex-1 flex items-center justify-between px-4 py-3 rounded-l-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--pm-primary-container)] text-white'
                  : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'
              }`}
            >
              <span>{preset}</span>
              <span
                className={`material-symbols-outlined text-[18px] ${isActive ? '' : 'opacity-20'}`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {isActive ? 'check_circle' : 'add_circle'}
              </span>
            </button>
            {onRemoveCustom && (
              <button
                type="button"
                onClick={() => onRemoveCustom(preset)}
                title="Remove custom preset"
                className={`flex items-center px-2 rounded-r-xl text-sm transition-all ${
                  isActive
                    ? 'bg-[var(--pm-primary-container)] text-white/70 hover:text-white'
                    : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:text-red-600 hover:bg-red-50'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        );
      })}

      {/* Add custom preset inline input or "+" button */}
      {onAddCustom && (
        adding ? (
          <div className="flex items-center gap-1.5 col-span-1 md:col-span-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
              placeholder="Type a preset..."
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl text-sm bg-white border border-[var(--outline-variant)]/40 text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              className="px-4 py-3 rounded-xl text-sm font-medium bg-[var(--pm-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewLabel(''); }}
              className="px-3 py-3 rounded-xl text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Add custom preset"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] border border-dashed border-[var(--outline-variant)]/40 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Custom
          </button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add imports and state to input-phase.tsx**

Add `useEffect` to the React import (line 1):

```typescript
import { useState, useEffect } from 'react';
```

Add the Supabase preset imports at the top of `input-phase.tsx`:

```typescript
import {
  listPresets,
  addPreset,
  deletePreset,
  listLocalPresets,
  addLocalPreset,
  removeLocalPreset,
} from '@/lib/supabase/presets';
```

Inside the `InputPhase` component, add these store selectors (after the existing selectors):

```typescript
  const customConstraintPresets = useSessionStore((s) => s.customConstraintPresets);
  const customFormatPresets = useSessionStore((s) => s.customFormatPresets);
  const setCustomConstraintPresets = useSessionStore((s) => s.setCustomConstraintPresets);
  const setCustomFormatPresets = useSessionStore((s) => s.setCustomFormatPresets);
  const addCustomConstraintPreset = useSessionStore((s) => s.addCustomConstraintPreset);
  const removeCustomConstraintPreset = useSessionStore((s) => s.removeCustomConstraintPreset);
  const addCustomFormatPreset = useSessionStore((s) => s.addCustomFormatPreset);
  const removeCustomFormatPreset = useSessionStore((s) => s.removeCustomFormatPreset);
```

- [ ] **Step 3: Add preset loading effect**

Add a `useEffect` to load custom presets on mount:

```typescript
  useEffect(() => {
    async function loadCustomPresets() {
      if (user) {
        try {
          const presets = await listPresets();
          setCustomConstraintPresets(
            presets.filter((p) => p.type === 'constraint').map((p) => p.label)
          );
          setCustomFormatPresets(
            presets.filter((p) => p.type === 'format').map((p) => p.label)
          );
        } catch {
          setCustomConstraintPresets(listLocalPresets('constraint'));
          setCustomFormatPresets(listLocalPresets('format'));
        }
      } else {
        setCustomConstraintPresets(listLocalPresets('constraint'));
        setCustomFormatPresets(listLocalPresets('format'));
      }
    }
    loadCustomPresets();
  }, [user, setCustomConstraintPresets, setCustomFormatPresets]);
```

- [ ] **Step 4: Add add/remove handlers**

```typescript
  async function handleAddCustomConstraint(label: string) {
    addCustomConstraintPreset(label);
    if (user) {
      try { await addPreset('constraint', label, user.id); } catch { /* stored in store already */ }
    } else {
      addLocalPreset('constraint', label);
    }
  }

  async function handleRemoveCustomConstraint(label: string) {
    removeCustomConstraintPreset(label);
    if (user) {
      try {
        const presets = await listPresets('constraint');
        const preset = presets.find((p) => p.label === label);
        if (preset) await deletePreset(preset.id);
      } catch { /* already removed from store */ }
    } else {
      removeLocalPreset('constraint', label);
    }
  }

  async function handleAddCustomFormat(label: string) {
    addCustomFormatPreset(label);
    if (user) {
      try { await addPreset('format', label, user.id); } catch { /* stored in store already */ }
    } else {
      addLocalPreset('format', label);
    }
  }

  async function handleRemoveCustomFormat(label: string) {
    removeCustomFormatPreset(label);
    if (user) {
      try {
        const presets = await listPresets('format');
        const preset = presets.find((p) => p.label === label);
        if (preset) await deletePreset(preset.id);
      } catch { /* already removed from store */ }
    } else {
      removeLocalPreset('format', label);
    }
  }
```

- [ ] **Step 5: Update constraint pills section to include custom presets + handleToggleConstraintPreset for custom presets**

The existing constraint section (around line 418-428) currently uses:

```tsx
        <ConstraintPills
          presets={CONSTRAINT_PRESETS}
          selected={constraintPresets}
          onToggle={handleToggleConstraintPreset}
        />
```

Replace with:

```tsx
        <ConstraintPills
          presets={CONSTRAINT_PRESETS}
          selected={constraintPresets}
          onToggle={handleToggleConstraintPreset}
          customPresets={customConstraintPresets}
          onAddCustom={handleAddCustomConstraint}
          onRemoveCustom={handleRemoveCustomConstraint}
        />
```

- [ ] **Step 6: Update format pills section**

The existing format section (around line 448-457) currently uses:

```tsx
        <ConstraintPills
          presets={FORMAT_PRESETS}
          selected={formatPresets}
          onToggle={handleToggleFormatPreset}
        />
```

Replace with:

```tsx
        <ConstraintPills
          presets={FORMAT_PRESETS}
          selected={formatPresets}
          onToggle={handleToggleFormatPreset}
          customPresets={customFormatPresets}
          onAddCustom={handleAddCustomFormat}
          onRemoveCustom={handleRemoveCustomFormat}
        />
```

- [ ] **Step 7: Update handleAssemble to include custom presets in constraints**

In the `handleAssemble` function (around line 127-130), the `parts` already combines `constraintPresets` + free text. Custom presets that are toggled on already land in `constraintPresets` (the selected array), so no change is needed here. Same for `formatPresets`.

Verify this is the case — the `handleToggleConstraintPreset` function adds/removes from `constraintPresets` regardless of whether the preset is default or custom.

- [ ] **Step 8: Verify build passes**

Run: `cd /root/code/PromptMaster/frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/shared/constraint-pills.tsx frontend/src/components/phases/input-phase.tsx
git commit -m "feat(frontend): add custom preset pills with add/remove on input phase"
```

---

### Task 9: Final build verification + combined commit

- [ ] **Step 1: Full frontend build**

Run: `cd /root/code/PromptMaster/frontend && npm run build`
Expected: build succeeds with no errors

- [ ] **Step 2: Backend import check**

Run: `cd /root/code/PromptMaster/backend && python -c "from routers.engine import router; from promptmaster.flow_triggers import build_conversation_prompt; print('All imports OK')"`
Expected: `All imports OK`

- [ ] **Step 3: Manual browser verification**

Start both servers and verify in browser:
1. Output phase shows the conversation bridge text area below the generated output
2. Input phase shows constraint/format pills with "+" Custom button at end
3. Clicking "+" shows inline input, typing + Enter/Add creates a custom pill
4. Custom pills show "x" to remove
5. Custom pills can be toggled on/off same as defaults
