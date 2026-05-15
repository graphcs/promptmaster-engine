# Custom Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom modes a first-class, reusable persona library — users can create, save, edit, and reuse custom personas across sessions via a modal that opens when "Custom" is picked in any mode picker.

**Architecture:** New Supabase `custom_modes` table (user-scoped, RLS). New frontend data layer (`custom-modes.ts`) mirrors the existing `templates.ts` pattern. New `PersonaModal` component (with `PersonaListView`, `PersonaRow`, `PersonaEditor` children) opens when "Custom" is clicked. Picked personas snapshot into existing `customName/customPreamble/customTone` session fields — no backend or backend-schema changes.

**Tech Stack:** Supabase Postgres + RLS, Next.js 16 (App Router), Tailwind v4, Zustand with `persist`, `@supabase/ssr`, Material Symbols Outlined.

**Spec:** `docs/superpowers/specs/2026-05-15-custom-modes-design.md`

---

## Pre-flight

- HEAD is on `main`. No uncommitted changes.
- Working dir: `/root/code/PromptMaster`. Frontend at `frontend/`, no migrations folder exists yet (the `templates` table was applied via Supabase dashboard SQL; we'll commit our SQL script for reference and the user runs it in Supabase dashboard).
- Frontend has no test framework. Verification per task is `npx tsc --noEmit` + `npm run build` + manual browser smoke (for UI tasks).
- Existing patterns to mirror: `frontend/src/lib/supabase/templates.ts` (CRUD shape), `frontend/src/components/shared/template-modal.tsx` (modal layout).

---

## File Structure

**New files**

- `supabase/migrations/2026-05-15_custom_modes.sql` — SQL to create the table + RLS (user runs in Supabase dashboard; committed for reference)
- `frontend/src/lib/supabase/custom-modes.ts` — CRUD data layer
- `frontend/src/components/persona/persona-editor.tsx` — name/preamble/tone form
- `frontend/src/components/persona/persona-row.tsx` — single row in list (use/edit/delete)
- `frontend/src/components/persona/persona-list-view.tsx` — empty state + list of rows
- `frontend/src/components/persona/persona-modal.tsx` — orchestrator (list ↔ editor)

**Modified files**

- `frontend/src/types/index.ts` — add `CustomMode`, `CustomModeInput`
- `frontend/src/stores/session-store.ts` — add `customModes`, `customModesLoading`, setters
- `frontend/src/components/shared/mode-grid.tsx` — intercept "Custom" tile click, display active persona name
- `frontend/src/components/input/setup-summary-bar.tsx` — display active persona name in Mode chip value; intercept "Custom" selection

---

## Task 1: SQL migration for `custom_modes` table

**Files:**
- Create: `supabase/migrations/2026-05-15_custom_modes.sql`

This task creates the SQL script and commits it. The user runs it manually in the Supabase dashboard's SQL editor (matches how `templates` and `sessions` were created — no migrations tooling exists in this repo).

- [ ] **Step 1: Create the SQL file**

Path: `supabase/migrations/2026-05-15_custom_modes.sql`

```sql
-- Custom Modes table — user-scoped persona library for Project E.
-- Mirrors the templates table pattern: RLS-protected, indexed for the
-- common "list a user's items newest first" query.

create table if not exists custom_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preamble text not null,
  tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_modes_user_id_idx
  on custom_modes (user_id, created_at desc);

alter table custom_modes enable row level security;

create policy "custom_modes_owner_select" on custom_modes
  for select using (auth.uid() = user_id);

create policy "custom_modes_owner_insert" on custom_modes
  for insert with check (auth.uid() = user_id);

create policy "custom_modes_owner_update" on custom_modes
  for update using (auth.uid() = user_id);

create policy "custom_modes_owner_delete" on custom_modes
  for delete using (auth.uid() = user_id);

-- Touch updated_at on UPDATE.
create or replace function custom_modes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_modes_set_updated_at on custom_modes;
create trigger custom_modes_set_updated_at
  before update on custom_modes
  for each row execute function custom_modes_touch_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/2026-05-15_custom_modes.sql
git commit -m "feat(db): add custom_modes table SQL migration"
```

- [ ] **Step 3: Hand off to user**

After committing, surface this message to the user in your final report:

> The SQL migration is at `supabase/migrations/2026-05-15_custom_modes.sql`. Run it in the Supabase dashboard SQL editor before testing the feature in the browser.

---

## Task 2: Frontend types — `CustomMode`, `CustomModeInput`

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Append new types**

At the end of `frontend/src/types/index.ts`, append:

```typescript

// --- Custom Modes (Project E) ---

export interface CustomMode {
  id: string;
  user_id?: string;
  name: string;
  preamble: string;
  tone: string;
  created_at: string;
  updated_at: string;
}

export interface CustomModeInput {
  name: string;
  preamble: string;
  tone: string;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean (no output).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add CustomMode and CustomModeInput types"
```

---

## Task 3: Data layer — `custom-modes.ts`

**Files:**
- Create: `frontend/src/lib/supabase/custom-modes.ts`

Mirrors `templates.ts` exactly. RLS handles access control — the queries trust the auth session.

- [ ] **Step 1: Create the file**

Path: `frontend/src/lib/supabase/custom-modes.ts`

```typescript
import { createClient } from './client';
import type { CustomMode, CustomModeInput } from '@/types';

export async function listCustomModes(): Promise<CustomMode[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as CustomMode[];
}

export async function getCustomMode(id: string): Promise<CustomMode | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as CustomMode;
}

export async function createCustomMode(
  input: CustomModeInput,
  userId: string
): Promise<CustomMode> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      preamble: input.preamble.trim(),
      tone: input.tone.trim(),
    })
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .single();

  if (error || !data) throw error ?? new Error('Failed to create custom mode');
  return data as CustomMode;
}

export async function updateCustomMode(
  id: string,
  input: CustomModeInput
): Promise<CustomMode> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .update({
      name: input.name.trim(),
      preamble: input.preamble.trim(),
      tone: input.tone.trim(),
    })
    .eq('id', id)
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .single();

  if (error || !data) throw error ?? new Error('Failed to update custom mode');
  return data as CustomMode;
}

export async function deleteCustomMode(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('custom_modes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/supabase/custom-modes.ts
git commit -m "feat(frontend): add Supabase data layer for custom_modes"
```

---

## Task 4: Zustand store — library cache + loading flag

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

The actual *selected persona snapshot* already lives in `customName/customPreamble/customTone` — we only add the **library cache** for the modal.

- [ ] **Step 1: Add `CustomMode` to type imports**

Find the existing import block (around line 3). Update to include `CustomMode`:

```typescript
import type { Phase, ModeType, AssembledPrompt, Iteration, EvaluationResult, Session, UserRating, ChatMessage, SetupSuggestion, AuditFinding, CustomMode } from '@/types';
```

- [ ] **Step 2: Add state fields to `SessionState` interface**

Find the `// Audit → Action` block (added in Project D). Add immediately after the audit fields, before `// Session ID`:

```typescript
  // Custom Modes library (Project E)
  customModes: CustomMode[];
  customModesLoading: boolean;
```

- [ ] **Step 3: Add action signatures**

Find the `setApplyAuditLoading: (b: boolean) => void;` line. Add immediately after it:

```typescript
  setCustomModes: (m: CustomMode[]) => void;
  setCustomModesLoading: (b: boolean) => void;
```

- [ ] **Step 4: Add to `initialState`**

Find `applyAuditLoading: false,` in the `initialState` object. Add immediately after it:

```typescript
  customModes: [] as CustomMode[],
  customModesLoading: false,
```

- [ ] **Step 5: Implement the actions**

Find the `setApplyAuditLoading: (applyAuditLoading) => set({ applyAuditLoading }),` line. Add immediately after it:

```typescript
      setCustomModes: (customModes) => set({ customModes }),
      setCustomModesLoading: (customModesLoading) => set({ customModesLoading }),
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "feat(frontend): add custom modes library cache to Zustand store"
```

---

## Task 5: `PersonaEditor` component

**Files:**
- Create: `frontend/src/components/persona/persona-editor.tsx`

Form for create and edit. The parent (`PersonaModal`) handles the actual save call — this component is pure form state + validation.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /root/code/PromptMaster/frontend/src/components/persona
```

- [ ] **Step 2: Create `persona-editor.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { CustomMode, CustomModeInput } from '@/types';

const NAME_MAX = 60;
const PREAMBLE_MAX = 2000;
const TONE_MAX = 200;

interface PersonaEditorProps {
  mode: 'create' | 'edit';
  initial?: CustomMode | null;
  onCancel: () => void;
  onSave: (input: CustomModeInput) => Promise<void>;
}

export function PersonaEditor({ mode, initial, onCancel, onSave }: PersonaEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [preamble, setPreamble] = useState(initial?.preamble ?? '');
  const [tone, setTone] = useState(initial?.tone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedPreamble = preamble.trim();
  const trimmedTone = tone.trim();

  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX;
  const preambleValid = trimmedPreamble.length >= 1 && trimmedPreamble.length <= PREAMBLE_MAX;
  const toneValid = trimmedTone.length <= TONE_MAX;
  const canSave = nameValid && preambleValid && toneValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmedName, preamble: trimmedPreamble, tone: trimmedTone });
    } catch {
      setError("Couldn't save your persona. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const preambleCount = preamble.length;
  const preambleCountClass =
    preambleCount > PREAMBLE_MAX
      ? 'text-red-600'
      : preambleCount > PREAMBLE_MAX - 100
      ? 'text-amber-600'
      : 'text-[var(--outline)]';

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border-l-4 border-red-400 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {mode === 'edit' && (
        <p className="rounded-lg bg-[var(--surface-container-low)] px-4 py-3 text-[12px] italic text-[var(--on-surface-variant)]">
          Edits apply to future sessions. Re-pick this persona to use the updated version in this session.
        </p>
      )}

      {/* Name */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX + 10}
          placeholder="e.g. Skeptical Investor"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
        />
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          Short label to help you find this persona later.
        </p>
      </div>

      {/* Preamble */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Persona instructions
        </label>
        <textarea
          value={preamble}
          onChange={(e) => setPreamble(e.target.value)}
          rows={6}
          placeholder="You are a numbers-first investor who pushes back on optimistic claims and asks for evidence…"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] text-[var(--on-surface-variant)]">
            How the AI should think and behave as this persona.
          </p>
          <p className={`text-[11px] ${preambleCountClass}`}>
            {preambleCount} / {PREAMBLE_MAX}
          </p>
        </div>
      </div>

      {/* Tone */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-1">
          Tone <span className="font-normal lowercase text-[var(--outline)]">(optional)</span>
        </label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          maxLength={TONE_MAX + 10}
          placeholder="e.g. blunt, evidence-based, no hedging"
          className="w-full bg-[var(--surface-container-low)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--outline)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--pm-primary)]/40 transition-all"
        />
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          A short phrase about voice or style (kept separate from the instructions).
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-2 px-5 py-2 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">check</span>
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/persona/persona-editor.tsx
git commit -m "feat(frontend): add PersonaEditor component"
```

---

## Task 6: `PersonaRow` component

**Files:**
- Create: `frontend/src/components/persona/persona-row.tsx`

Single row in the list view. Click row body to use; pencil to edit; trash for inline delete confirm.

- [ ] **Step 1: Create the file**

Path: `frontend/src/components/persona/persona-row.tsx`

```tsx
'use client';

import { useState } from 'react';
import type { CustomMode } from '@/types';

interface PersonaRowProps {
  persona: CustomMode;
  isActive: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function PersonaRow({ persona, isActive, onUse, onEdit, onDelete }: PersonaRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between p-4 rounded-xl bg-red-50 border-l-4 border-red-400">
        <span className="text-sm text-red-900">
          Delete &ldquo;{persona.name}&rdquo;?
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--on-surface-variant)] hover:bg-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    );
  }

  const previewLength = 90;
  const preview =
    persona.preamble.length > previewLength
      ? persona.preamble.slice(0, previewLength) + '…'
      : persona.preamble;

  return (
    <div
      onClick={onUse}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onUse();
        }
      }}
      className={`group flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-colors ${
        isActive
          ? 'bg-white ring-1 ring-[var(--pm-primary)]'
          : 'bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--on-surface)] truncate">
            {persona.name}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--pm-primary)]/10 text-[var(--pm-primary)]">
              <span
                className="material-symbols-outlined text-[12px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              Active
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--on-surface-variant)] leading-relaxed mt-1">
          {preview}
        </p>
        {persona.tone && (
          <p className="text-[11px] italic text-[var(--outline)] mt-1">
            Tone: {persona.tone}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
          aria-label={`Edit ${persona.name}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--on-surface-variant)] hover:bg-white hover:text-[var(--on-surface)] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(true);
          }}
          title="Delete"
          aria-label={`Delete ${persona.name}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--on-surface-variant)] hover:bg-white hover:text-red-600 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/persona/persona-row.tsx
git commit -m "feat(frontend): add PersonaRow component"
```

---

## Task 7: `PersonaListView` component

**Files:**
- Create: `frontend/src/components/persona/persona-list-view.tsx`

Empty state OR stack of `PersonaRow` items. Receives the active persona name from props so it can mark the matching row.

- [ ] **Step 1: Create the file**

Path: `frontend/src/components/persona/persona-list-view.tsx`

```tsx
'use client';

import type { CustomMode } from '@/types';
import { PersonaRow } from './persona-row';

interface PersonaListViewProps {
  personas: CustomMode[];
  activePersonaName: string;
  loading: boolean;
  onUse: (persona: CustomMode) => void;
  onEdit: (persona: CustomMode) => void;
  onDelete: (persona: CustomMode) => Promise<void>;
  onCreateNew: () => void;
}

export function PersonaListView({
  personas,
  activePersonaName,
  loading,
  onUse,
  onEdit,
  onDelete,
  onCreateNew,
}: PersonaListViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <span className="material-symbols-outlined text-[var(--outline)] animate-spin text-[28px]">
          progress_activity
        </span>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[260px] text-center px-6">
        <span className="material-symbols-outlined text-[40px] text-[var(--outline)] mb-3">
          theater_comedy
        </span>
        <p className="text-sm font-semibold text-[var(--on-surface)] mb-1">
          No personas yet
        </p>
        <p className="text-[12px] text-[var(--on-surface-variant)] mb-4 max-w-[300px]">
          A custom persona is your own AI character — name it, write what it should do, set the tone, then reuse it any time.
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Create your first persona
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {personas.map((p) => (
        <PersonaRow
          key={p.id}
          persona={p}
          isActive={p.name === activePersonaName}
          onUse={() => onUse(p)}
          onEdit={() => onEdit(p)}
          onDelete={() => onDelete(p)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/persona/persona-list-view.tsx
git commit -m "feat(frontend): add PersonaListView component"
```

---

## Task 8: `PersonaModal` orchestrator

**Files:**
- Create: `frontend/src/components/persona/persona-modal.tsx`

The orchestrator. Lazy-loads the library on first open, hosts list ↔ editor view state, calls the CRUD layer, updates the Zustand store optimistically with rollback on failure, and snapshots the picked persona into the session.

- [ ] **Step 1: Create the file**

Path: `frontend/src/components/persona/persona-modal.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import {
  listCustomModes,
  createCustomMode,
  updateCustomMode,
  deleteCustomMode,
} from '@/lib/supabase/custom-modes';
import type { CustomMode, CustomModeInput } from '@/types';
import { PersonaListView } from './persona-list-view';
import { PersonaEditor } from './persona-editor';

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; persona: CustomMode };

interface PersonaModalProps {
  open: boolean;
  onClose: () => void;
}

export function PersonaModal({ open, onClose }: PersonaModalProps) {
  const { user, loading: authLoading } = useAuth();

  const customModes = useSessionStore((s) => s.customModes);
  const customModesLoading = useSessionStore((s) => s.customModesLoading);
  const setCustomModes = useSessionStore((s) => s.setCustomModes);
  const setCustomModesLoading = useSessionStore((s) => s.setCustomModesLoading);

  const customName = useSessionStore((s) => s.customName);
  const setMode = useSessionStore((s) => s.setMode);
  const setCustomMode = useSessionStore((s) => s.setCustomMode);

  const [view, setView] = useState<View>({ kind: 'list' });
  const [listError, setListError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Lazy-load on first open (or on user change).
  useEffect(() => {
    if (!open || !user || loadedOnce) return;
    let cancelled = false;
    setCustomModesLoading(true);
    setListError(null);
    listCustomModes()
      .then((list) => {
        if (cancelled) return;
        setCustomModes(list);
        setLoadedOnce(true);
      })
      .catch(() => {
        if (cancelled) return;
        setListError("Couldn't load your personas. Try again.");
      })
      .finally(() => {
        if (!cancelled) setCustomModesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, loadedOnce, setCustomModes, setCustomModesLoading]);

  // Reset to list view whenever the modal opens.
  useEffect(() => {
    if (open) setView({ kind: 'list' });
  }, [open]);

  if (!open) return null;

  function snapshotIntoSession(persona: CustomMode) {
    setMode('custom');
    setCustomMode(persona.name, persona.preamble, persona.tone);
  }

  async function handleCreateSave(input: CustomModeInput) {
    if (!user) return;
    const created = await createCustomMode(input, user.id);
    setCustomModes([created, ...customModes]);
    snapshotIntoSession(created);
    onClose();
  }

  async function handleEditSave(input: CustomModeInput) {
    if (view.kind !== 'edit') return;
    const updated = await updateCustomMode(view.persona.id, input);
    setCustomModes(customModes.map((m) => (m.id === updated.id ? updated : m)));
    setView({ kind: 'list' });
  }

  async function handleDelete(persona: CustomMode) {
    const previous = customModes;
    setCustomModes(customModes.filter((m) => m.id !== persona.id));
    try {
      await deleteCustomMode(persona.id);
    } catch {
      setCustomModes(previous);
      setListError("Couldn't delete that persona. Try again.");
    }
  }

  function handleUse(persona: CustomMode) {
    snapshotIntoSession(persona);
    onClose();
  }

  const title =
    view.kind === 'create'
      ? 'New persona'
      : view.kind === 'edit'
      ? 'Edit persona'
      : 'Custom personas';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[var(--pm-primary)]">theater_comedy</span>
            <h2 className="text-lg font-semibold text-[var(--on-surface)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-[var(--surface-container-low)] transition-colors"
          >
            <span className="material-symbols-outlined text-[var(--outline)]">close</span>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {!user && !authLoading ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <span className="material-symbols-outlined text-[40px] text-[var(--outline)] mb-2">
                lock
              </span>
              <p className="text-sm text-[var(--on-surface)]">
                Sign in to save and reuse personas.
              </p>
            </div>
          ) : view.kind === 'list' ? (
            <>
              {listError && (
                <div className="mb-3 rounded-lg bg-red-50 border-l-4 border-red-400 px-4 py-3 text-sm text-red-800">
                  {listError}
                </div>
              )}
              <PersonaListView
                personas={customModes}
                activePersonaName={customName}
                loading={customModesLoading}
                onUse={handleUse}
                onEdit={(p) => setView({ kind: 'edit', persona: p })}
                onDelete={handleDelete}
                onCreateNew={() => setView({ kind: 'create' })}
              />
            </>
          ) : view.kind === 'create' ? (
            <PersonaEditor
              mode="create"
              initial={null}
              onCancel={() => setView({ kind: 'list' })}
              onSave={handleCreateSave}
            />
          ) : (
            <PersonaEditor
              mode="edit"
              initial={view.persona}
              onCancel={() => setView({ kind: 'list' })}
              onSave={handleEditSave}
            />
          )}
        </div>

        {/* Footer: only show in list view */}
        {view.kind === 'list' && user && customModes.length > 0 && (
          <div className="flex items-center justify-end px-6 py-4">
            <button
              type="button"
              onClick={() => setView({ kind: 'create' })}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--pm-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New persona
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Verify production build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/persona/persona-modal.tsx
git commit -m "feat(frontend): add PersonaModal orchestrator with lazy library load"
```

---

## Task 9: Wire `ModeGrid` "Custom" tile to open the modal + show active persona name

**Files:**
- Modify: `frontend/src/components/shared/mode-grid.tsx`

`ModeGrid` is used by both `AdvancedSection` (variant='grid') and `SetupSummaryBar` (variant='list'). We want clicking "Custom" to **open the persona modal**, not just call `onSelect('custom')`. We also want the "Custom" tile to display the active persona name when one is active.

The cleanest way: have `ModeGrid` render and own the modal itself (so callers don't need to wire it). When "Custom" is clicked, intercept locally and open the modal — `onSelect` is NOT called. When the user picks a persona inside the modal, the modal handles the snapshot via the store, so `onSelect` is still not called (and that's fine — the chip/page reading the store will react).

- [ ] **Step 1: Update the file**

Read the current file first, then apply these changes:

(a) Add imports:

```typescript
import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { PersonaModal } from '@/components/persona/persona-modal';
```

(b) Replace the entire `MODES` const to make the Custom tile's display dynamic. Keep the existing 8 entries but rename `'Custom'` row's static `name`/`desc` — we'll override in the JSX. Actual edit: leave MODES unchanged, and override per-tile at render time.

(c) Inside `ModeGrid`, add at the top:

```typescript
const [personaModalOpen, setPersonaModalOpen] = useState(false);
const customName = useSessionStore((s) => s.customName);

function handleSelectInternal(modeKey: ModeType) {
  if (modeKey === 'custom') {
    setPersonaModalOpen(true);
    return;
  }
  onSelect(modeKey);
}
```

(d) In the **list variant**, change the button's `onClick` from `() => onSelect(mode.key)` to `() => handleSelectInternal(mode.key)`. Update the displayed `name` so that when `mode.key === 'custom'` and `customName` is set, it shows the persona name instead of "Custom":

Find the button block:

```tsx
<button
  key={mode.key}
  type="button"
  onClick={() => onSelect(mode.key)}
  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
    isSelected
      ? 'bg-[var(--pm-primary)]/10 ring-1 ring-[var(--pm-primary)]'
      : 'bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]'
  }`}
>
  <span ...>{mode.icon}</span>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-semibold text-[var(--on-surface)]">{mode.name}</div>
    <div className="text-[11px] text-[var(--on-surface-variant)] leading-tight">{mode.desc}</div>
  </div>
  {isSelected && (...)}
</button>
```

Replace with:

```tsx
<button
  key={mode.key}
  type="button"
  onClick={() => handleSelectInternal(mode.key)}
  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
    isSelected
      ? 'bg-[var(--pm-primary)]/10 ring-1 ring-[var(--pm-primary)]'
      : 'bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)]'
  }`}
>
  <span
    className={`material-symbols-outlined text-[20px] flex-shrink-0 ${
      isSelected ? 'text-[var(--pm-primary)]' : 'text-[var(--outline)]'
    }`}
  >
    {mode.icon}
  </span>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-semibold text-[var(--on-surface)] truncate">
      {mode.key === 'custom' && customName ? customName : mode.name}
    </div>
    <div className="text-[11px] text-[var(--on-surface-variant)] leading-tight truncate">
      {mode.key === 'custom' && customName ? 'Custom persona — click to manage' : mode.desc}
    </div>
  </div>
  {isSelected && (
    <span className="material-symbols-outlined text-[18px] text-[var(--pm-primary)] flex-shrink-0">
      check
    </span>
  )}
</button>
```

(e) In the **grid variant**, change `onClick={() => onSelect(mode.key)}` to `onClick={() => handleSelectInternal(mode.key)}`. Apply the same name/desc override for the Custom tile:

Find:

```tsx
<div
  key={mode.key}
  onClick={() => onSelect(mode.key)}
  className={...}
>
  <span className={`material-symbols-outlined mb-2 ${...}`}>{mode.icon}</span>
  <div className="text-sm font-semibold text-[var(--on-surface)]">{mode.name}</div>
  <div className="text-[11px] text-[var(--on-surface-variant)] leading-tight">{mode.desc}</div>
</div>
```

Replace with:

```tsx
<div
  key={mode.key}
  onClick={() => handleSelectInternal(mode.key)}
  className={`p-4 bg-white rounded-xl cursor-pointer transition-all ${
    isSelected
      ? 'shadow-ambient border-2 border-[var(--pm-primary)]'
      : 'hover:bg-[var(--surface-container-high)]'
  }`}
>
  <span
    className={`material-symbols-outlined mb-2 ${
      isSelected ? 'text-[var(--pm-primary)]' : 'text-[var(--outline)]'
    }`}
  >
    {mode.icon}
  </span>
  <div className="text-sm font-semibold text-[var(--on-surface)] truncate">
    {mode.key === 'custom' && customName ? customName : mode.name}
  </div>
  <div className="text-[11px] text-[var(--on-surface-variant)] leading-tight truncate">
    {mode.key === 'custom' && customName ? 'Custom persona — click to manage' : mode.desc}
  </div>
</div>
```

(f) At the very end of the `return` for BOTH variants, render the `PersonaModal`. The simplest way: wrap each variant's return in a fragment and append the modal. Update list variant return to:

```tsx
if (variant === 'list') {
  return (
    <>
      <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto p-1">
        {/* ...existing buttons... */}
      </div>
      <PersonaModal open={personaModalOpen} onClose={() => setPersonaModalOpen(false)} />
    </>
  );
}
```

Update grid variant return to:

```tsx
return (
  <>
    <div className="space-y-4">
      {/* ...existing grid + about-this-mode block... */}
    </div>
    <PersonaModal open={personaModalOpen} onClose={() => setPersonaModalOpen(false)} />
  </>
);
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Verify production build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/mode-grid.tsx
git commit -m "feat(frontend): wire ModeGrid Custom tile to open PersonaModal; show active persona name"
```

---

## Task 10: Update `SetupSummaryBar` Mode chip value to show persona name

**Files:**
- Modify: `frontend/src/components/input/setup-summary-bar.tsx`

The Mode chip shows `MODE_DISPLAY[mode]?.display_name` as its value. When `mode === 'custom'` and a persona is active, show the persona's name instead.

- [ ] **Step 1: Update the file**

Find the existing `modeLabel` derivation:

```typescript
const modeLabel = MODE_DISPLAY[mode]?.display_name ?? mode;
```

Replace with:

```typescript
const customName = useSessionStore((s) => s.customName);
const modeLabel =
  mode === 'custom' && customName
    ? customName
    : MODE_DISPLAY[mode]?.display_name ?? mode;
```

(Add the `customName` selector alongside the other `useSessionStore` calls at the top of the component.)

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Verify production build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/input/setup-summary-bar.tsx
git commit -m "feat(frontend): show active persona name in SetupSummaryBar Mode chip value"
```

---

## Task 11: Reset persona snapshot when switching to a built-in mode

**Files:**
- Modify: `frontend/src/stores/session-store.ts`

Currently `setMode('architect')` leaves the old `customName/customPreamble/customTone` strings in the store. We want picking any non-custom mode to clear them, per the spec edge case: *"User picks a built-in mode while a custom is active → built-in mode replaces the snapshot."*

- [ ] **Step 1: Update `setMode` to clear custom fields when switching to a non-custom mode**

Find the existing `setMode` implementation:

```typescript
      setMode: (mode) => set({ mode }),
```

Replace with:

```typescript
      setMode: (mode) =>
        set(
          mode === 'custom'
            ? { mode }
            : { mode, customName: '', customPreamble: '', customTone: '' }
        ),
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/code/PromptMaster/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Verify production build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/session-store.ts
git commit -m "fix(frontend): clear custom persona snapshot when switching to a built-in mode"
```

---

## Task 12: Final smoke verification

**Files:**
- No file changes — verification only.

- [ ] **Step 1: Run full backend test suite (regression check)**

```bash
cd /root/code/PromptMaster/backend && /root/code/PromptMaster/.venv/bin/python -m pytest -q
```
Expected: 106 passed (no backend changes were made).

- [ ] **Step 2: Frontend production build**

```bash
cd /root/code/PromptMaster/frontend && npm run build
```
Expected: clean — all routes (`/`, `/session`, `/auth/login`, `/auth/signup`, `/auth/callback`) generate.

- [ ] **Step 3: Verify file inventory**

Run:

```bash
ls /root/code/PromptMaster/frontend/src/components/persona/
ls /root/code/PromptMaster/frontend/src/lib/supabase/custom-modes.ts
ls /root/code/PromptMaster/supabase/migrations/2026-05-15_custom_modes.sql
```

Expected output:

```
/root/code/PromptMaster/frontend/src/components/persona/:
persona-editor.tsx
persona-list-view.tsx
persona-modal.tsx
persona-row.tsx

/root/code/PromptMaster/frontend/src/lib/supabase/custom-modes.ts
/root/code/PromptMaster/supabase/migrations/2026-05-15_custom_modes.sql
```

- [ ] **Step 4: Verify the SQL migration is in the repo**

```bash
grep -l "create table if not exists custom_modes" /root/code/PromptMaster/supabase/migrations/2026-05-15_custom_modes.sql
```
Expected: file path printed.

- [ ] **Step 5: Manual browser smoke (skip if dev server not running)**

If `npm run dev` is running and you're signed in:

1. Run `supabase/migrations/2026-05-15_custom_modes.sql` in the Supabase dashboard SQL editor.
2. Open `/session`. Generate a setup so the Recommended Approach card appears.
3. Click Mode chip → popover → click "Custom".
   - Expect: PersonaModal opens, empty state with "Create your first persona" CTA.
4. Click the CTA. Fill in: Name "Skeptical Investor", Preamble "You are…", Tone "blunt".
   - Expect: Save enabled. Click Save.
   - Expect: Modal closes. Mode chip value now reads "Skeptical Investor".
5. Re-open Mode chip popover → click "Custom" again.
   - Expect: Modal opens on list view, "Skeptical Investor" row marked Active.
6. Click pencil icon on the row → editor opens pre-filled.
   - Expect: notice "Edits apply to future sessions" visible. Cancel returns to list.
7. Click trash icon → inline confirm appears.
   - Expect: clicking Delete removes the row. Modal stays open.
8. Switch Mode to "Architect" via Mode chip.
   - Expect: chip value reads "Architect". `customName` cleared.
9. Run an iteration end-to-end.
   - Expect: with a custom persona active, the system prompt should reflect the persona (visible in Review phase's assembled prompt).

- [ ] **Step 6: Final commit if anything was tweaked during smoke**

If smoke caught issues that you fixed, commit them. Otherwise, no commit needed at this step.

- [ ] **Step 7: Report**

Surface to the user:

> **Project E shipped.** Tasks 1–12 complete on `main`. Backend untouched (106/106 tests still passing). Frontend build clean.
>
> **Action required from you:** run `supabase/migrations/2026-05-15_custom_modes.sql` in the Supabase dashboard SQL editor — the table doesn't exist in Supabase yet.
>
> Once that's run, hit `/session` and try creating a custom persona via the Mode chip → "Custom" entry.

---

## Self-Review Checklist

**Spec coverage:**
- Goal: persona library with CRUD → Tasks 1, 3, 5, 6, 7, 8 ✓
- Supabase table + RLS → Task 1 ✓
- Frontend types → Task 2 ✓
- Data layer → Task 3 ✓
- Zustand cache → Task 4 ✓
- PersonaEditor → Task 5 ✓
- PersonaRow → Task 6 ✓
- PersonaListView (empty + list) → Task 7 ✓
- PersonaModal (list ↔ editor, lazy load, snapshot, optimistic CRUD) → Task 8 ✓
- ModeGrid "Custom" intercept + display active persona name → Task 9 ✓
- SetupSummaryBar Mode chip value reads persona name → Task 10 ✓
- Picking built-in mode clears snapshot → Task 11 ✓
- Validation rules (1–60 name, 1–2000 preamble, 0–200 tone) → Task 5 ✓
- Plain-language error banners → Tasks 5, 8 ✓
- Snapshot-at-pick semantics → Task 8 (`handleUse`, `handleCreateSave`) ✓
- "Edits apply to future sessions" notice → Task 5 ✓
- Sign-in-required state → Task 8 ✓
- Smart Setup unchanged → no task touches `setup-suggester.py` or related ✓

**No placeholders:** every step contains the actual code or command.

**Type consistency:** `CustomMode`/`CustomModeInput` defined in Task 2 are used identically in Tasks 3, 4, 5, 6, 7, 8. Function names `listCustomModes`, `createCustomMode`, `updateCustomMode`, `deleteCustomMode` defined in Task 3 are called with matching signatures in Task 8.

## Out of Scope (deferred)

- Persona sharing between users
- Importing/exporting personas as JSON
- LLM-assisted persona generation from objective
- Versioned personas (history of edits)
- Smart Setup recommending a custom persona
- Realtime sync between browser tabs
- Frontend test framework (not present in codebase)
