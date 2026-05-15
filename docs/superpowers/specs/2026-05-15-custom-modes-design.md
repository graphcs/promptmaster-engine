# Custom Modes — Project E Design Spec

**Date:** 2026-05-15
**Status:** Draft for review
**Author:** John Maheswaran

## Goal

Make custom modes a first-class, reusable persona library. Users can create, save, edit, and reuse custom personas across sessions. Backend schema and prompt builder already support custom modes — Project E closes the UX gap.

## Background

Custom modes are partially implemented today:

- **Backend:** `PMInput` and `PromptTemplate` already carry `custom_name`, `custom_preamble`, `custom_tone`. The prompt builder injects them when `mode='custom'`.
- **Frontend:** types, Zustand store (`setCustomMode`), and all four phase components (input, review, realign, output) thread the custom fields through into prompt requests.
- **Templates:** can save custom personas as part of a full template (mode + audience + constraints + format bundled together).

What's missing:

- **No UI** to create or edit a custom persona. Selecting "Custom" in the mode grid sets `mode='custom'` but no editor opens.
- **No library.** Templates exist but bundle the entire setup; you can't save *just* a persona and pair it with any audience/constraints.
- **No reuse.** A persona defined in one session must be retyped or rescued from a template in the next.

## Goals

- Users can create, name, save, edit, and delete custom personas (Name + Preamble + Tone).
- Personas live in a dedicated, user-scoped Supabase table.
- Selecting "Custom" in any mode picker opens a modal showing the library and an editor.
- Picked personas snapshot into the session — old sessions replay correctly even if the persona is later deleted or edited.
- Smart Setup is unchanged (built-in modes only).

## Non-Goals

- Sharing personas between users.
- Importing/exporting personas as JSON.
- LLM-assisted persona generation from objective.
- Versioned personas (history of edits).
- Smart Setup recommending custom personas.
- Realtime sync between browser tabs.

## Architecture

A user-scoped persona library backed by a new Supabase table, surfaced via a modal that opens when the user picks "Custom" in any mode picker. Picked personas are **snapshotted** into `PMInput` (no foreign key), so old sessions remain replayable even if a persona is later edited or deleted.

```
┌────────────────────────────────────────────────────────┐
│ Supabase: custom_modes table (RLS scoped to user)      │
│   user_id, id, name, preamble, tone, timestamps        │
└────────────────────────────────────────────────────────┘
                        ▲
              CRUD via @supabase/ssr
                        │
┌────────────────────────────────────────────────────────┐
│ frontend/src/lib/supabase/custom-modes.ts              │
│   listCustomModes, createCustomMode, updateCustomMode, │
│   deleteCustomMode                                     │
└────────────────────────────────────────────────────────┘
                        ▲
                        │
┌────────────────────────────────────────────────────────┐
│ <PersonaModal />                                       │
│   ├─ List view (empty state OR list of personas)       │
│   └─ Editor (name + preamble + tone form)              │
└────────────────────────────────────────────────────────┘
                        ▲
                        │ "Custom" clicked
                        │
┌────────────────────────────────────────────────────────┐
│ ModeGrid: "Custom" tile → opens PersonaModal           │
│ SetupChip "Mode" popover → "Custom" entry opens modal  │
└────────────────────────────────────────────────────────┘
```

**Backend is untouched.** The existing schema and prompt builder already accept `custom_name`, `custom_preamble`, `custom_tone`. Project E only adds a data layer and UI.

## Data Layer

### Supabase table

```sql
create table custom_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preamble text not null,
  tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_modes_user_id_idx on custom_modes (user_id, created_at desc);

alter table custom_modes enable row level security;

create policy "custom_modes_owner_select" on custom_modes
  for select using (auth.uid() = user_id);
create policy "custom_modes_owner_insert" on custom_modes
  for insert with check (auth.uid() = user_id);
create policy "custom_modes_owner_update" on custom_modes
  for update using (auth.uid() = user_id);
create policy "custom_modes_owner_delete" on custom_modes
  for delete using (auth.uid() = user_id);
```

Mirrors the `templates` table pattern: user-scoped, RLS-protected, indexed for the common query (list a user's personas newest first).

### Frontend types

Added to `frontend/src/types/index.ts`:

```typescript
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

### Data layer module

**File:** `frontend/src/lib/supabase/custom-modes.ts`

```typescript
listCustomModes(): Promise<CustomMode[]>          // newest first
getCustomMode(id: string): Promise<CustomMode | null>
createCustomMode(input: CustomModeInput, userId: string): Promise<CustomMode>
updateCustomMode(id: string, input: CustomModeInput): Promise<CustomMode>
deleteCustomMode(id: string): Promise<void>
```

Mirrors `templates.ts` exactly — same patterns, same error handling, same auth assumptions. RLS does the access control.

### Validation rules

- `name`: 1–60 chars, trimmed
- `preamble`: 1–2000 chars
- `tone`: 0–200 chars (optional)

Client-side validation in the form. Backend has no specific endpoints — Supabase + RLS is the boundary.

## UI Components

### Component tree

```
PersonaModal (new)
├── PersonaListView (empty state OR list)
│   └── PersonaRow × N
└── PersonaEditor (form)
```

**Directory:** `frontend/src/components/persona/`

### PersonaModal

Two views (list ↔ editor), single column, modal overlay. Foundry Slate design: tonal surfaces, ambient shadow, no 1px borders, Material Symbols Outlined icons.

- **Header:** title + close `×`. Title is "Custom Personas" on list view, "New persona" or "Edit persona" on editor view.
- **Footer (list view):** primary `+ New persona` button.
- **Footer (editor view):** secondary `Cancel`, primary `Save`.

### PersonaListView

Two states:

- **Empty:** centered icon + "No personas yet" + "Create your first persona" CTA (same primary button as footer).
- **List:** vertical stack of `PersonaRow` items.

Each `PersonaRow`:

```
┌──────────────────────────────────────────────────┐
│ Skeptical Investor                     ✎  🗑    │
│ You are a numbers-first investor who…            │
│ Tone: blunt, evidence-based                      │
└──────────────────────────────────────────────────┘
```

- Click anywhere on the row (except action icons) → **Use this persona**: snapshots `name`, `preamble`, `tone` into the session, sets `mode='custom'`, closes the modal.
- Pencil icon → switch to editor view, pre-filled.
- Trash icon → confirm-and-delete inline: the row's content is replaced with "Delete '…'?  Cancel  Delete". No nested modal.
- If the currently-active persona matches the row, show a primary-color check badge + subtle ring.

### PersonaEditor

Three fields:

| Field    | Control             | Constraints                |
|----------|---------------------|----------------------------|
| Name     | `<input>`           | required, 1–60 chars       |
| Preamble | `<textarea rows=6>` | required, 1–2000 chars     |
| Tone     | `<input>`           | optional, 0–200 chars      |

Each field has a small "what is this?" caption below (one line, plain English).

Inline character counter on Preamble (right-aligned, dim text, turns amber near limit).

Save is disabled until `name` and `preamble` are both non-empty and within limits. On submit:

- Create flow → `createCustomMode(...)` → snapshot the new persona into the session (sets `mode='custom'` and fills `customName/Preamble/Tone`) → close the modal. The user just authored it; they're ready to use it.
- Edit flow → `updateCustomMode(...)` → return to list view. The session snapshot is **not** retroactively updated — see edge cases.

Errors render as a plain-language inline banner above the form. Raw API errors are logged to console only.

### Entry points

The modal opens from two places, both already-existing surfaces:

1. **`ModeGrid` "Custom" tile** (both grid and list variants): clicking it opens the modal instead of just setting `mode='custom'`. If a persona is already active, the modal opens on list view with that row marked.
2. **`SetupSummaryBar` Mode chip popover** ("Mode" list): the "Custom" entry opens the modal.

### Displaying the active persona

- **Mode chip value**: when `mode='custom'` and `customName` is non-empty, the chip's value text reads the persona name (e.g., "Skeptical Investor") instead of the generic "Custom".
- **ModeGrid "Custom" tile**: when active, shows the persona name and a small `edit` icon to re-open the modal.

### Clearing / switching off

Picking any non-custom mode (Architect, Critic, etc.) replaces the active persona snapshot with that built-in mode's defaults. No explicit "Clear" button is needed.

## Data Flow

### Happy path

```
User clicks Mode chip → popover opens
  │
  ├─ User clicks "Custom" entry
  │   └─ PersonaModal opens (list view)
  │       │
  │       ├─ Empty → user clicks "Create your first persona"
  │       │   └─ PersonaEditor (create) → Save
  │       │       └─ createCustomMode(input, userId)
  │       │           └─ returns CustomMode with server id
  │       │           └─ snapshot new persona into session-store
  │       │           └─ modal closes
  │       │
  │       └─ Has personas → user clicks a row
  │           └─ snapshot into session-store:
  │               setMode('custom')
  │               setCustomMode(name, preamble, tone)
  │           └─ modal closes
  │
  └─ Mode chip now displays persona name
      └─ Next prompt build sends custom_name/preamble/tone in PMInput
```

### Zustand store additions

Two new state fields — purely transient UI state for the modal library cache:

```typescript
customModes: CustomMode[];               // loaded once per session
customModesLoading: boolean;
setCustomModes: (m: CustomMode[]) => void;
setCustomModesLoading: (b: boolean) => void;
```

The actual selected persona snapshot lives in the already-existing `customName`, `customPreamble`, `customTone` fields. No further store schema changes are needed.

**Loading strategy:** `customModes` is fetched lazily — first time the modal opens — and cached in the store for the rest of the session. CRUD actions (create/update/delete) update the store optimistically and roll back on error.

## Edge Cases

| Case | Behavior |
|------|----------|
| User not signed in | The modal shows a sign-in-required state (matches how Templates already behave). |
| User has 0 personas | Empty state with single primary CTA. |
| User deletes the currently-active persona | The session's snapshot is unchanged — the prompt still runs. After delete, the Mode chip still shows the (now-orphaned) name. Re-opening the modal shows a clean list. No mid-session disruption. |
| User edits the currently-active persona | The modal closes after save. The session's snapshot is **not** auto-updated (snapshot-at-pick semantics). A small inline notice in the editor: *"Edits apply to future sessions. Re-pick this persona to use the updated version now."* |
| User picks a built-in mode while a custom is active | Built-in mode replaces the snapshot (`mode='architect'`, `customName=''`, `customPreamble=''`, `customTone=''`). |
| User loads an old saved session that referenced a persona by snapshot | Works — the session has its own copy of `name/preamble/tone`. The persona library is irrelevant for replay. |
| Two browser tabs open, one creates a persona | The other tab's `customModes` cache is stale until next modal open. Acceptable for v1 (no realtime sync). |
| Validation failure on save | Inline plain-language error banner above the form; Save button stays disabled until fields are valid. |
| Supabase RPC error | Plain-language banner: "Couldn't save your persona. Try again." Raw error → `console.error` only. |

## Error Handling

Same as Project C: never expose raw API errors. Banner text is always plain English. Console gets the raw error for debugging.

## Testing Approach

- **Data layer** (`custom-modes.ts`): manual smoke (covered by build + sign-in flow). No separate test infra — the existing `templates.ts` has none either.
- **Components**: TypeScript compile + manual browser smoke. The codebase has no frontend test framework, so we don't introduce one here.
- **Backend**: no changes → existing 106 backend tests stay green.

## Out of Scope (deferred)

- Persona sharing between users
- Importing/exporting personas as JSON
- LLM-assisted persona generation from objective
- Versioned personas (history of edits)
- Smart Setup recommending a custom persona
- Realtime sync between browser tabs
