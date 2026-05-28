# Phase C-1 — Long-Form Document Orchestration

**Date:** 2026-05-28
**Status:** Spec, ready for implementation plan
**Sources:** Sean emails May 11–26, 2026, items #3, #4, #5, #10, #11, #12
**Builds on:** Project B (Completion Detection + Continue Document, shipped 2026-05-07)

## Problem

PromptMaster generates one response per execute, then offers Continue Document when output is incomplete. Stress testing showed this is insufficient for long-form work (BRDs, white papers, books):

- The model conflates planning and execution in a single call ("blueprint" / "outline" prose instead of the actual deliverable).
- Continuation eventually transitions into prose mode, but the user has no visibility into what phase the document is in.
- Context limits hit around ~100 pages because each continuation re-receives the full document.
- Users naturally want an outline-first scaffold they can review before generation runs.

Sean's three-email arc on May 20 (#3, #4, #5) names the underlying need: explicit workflow state, outline-first orchestration, and persistent continuity scaffolding across continuations.

## Goals

1. Detect when a user is asking for a long-form document and propose an outline-first workflow.
2. Generate an outline (titles + abstracts) the user can review and edit before any prose is written.
3. Execute sections one at a time, auto-advancing, with visible state.
4. Persist outline + section state across page refresh and tab close.
5. Survive long documents by bounding per-section context (outline + rolling continuity snapshot + previous section verbatim) rather than re-sending the full document each call.

## Non-goals (deferred to later Phase C specs)

- Composable refinement stacking (Phase C-2; Sean #5)
- ~100-page ceiling root-cause investigation (Phase C-3; Sean #10)
- Section-level realignment / mid-stream eval
- Direct text edit of completed sections
- Outline edit while writing is in progress
- Section-level chat / inline modification UI
- Tutorial step for long-form
- Multi-document library / dedicated `documents` table
- Citation pass / final polish phases

## User flow

1. **Input phase** — unchanged.
2. **Review phase** — on Execute, a cheap classifier (`POST /api/detect-long-form`) runs against objective + audience + format.
3. **Output phase, "long-form proposed" sub-state** (only if classifier returns true) — proposal card:
   - "Plan It Out" → enters long-form state machine.
   - "Just Generate" → falls back to today's single-output flow inside Output phase.
4. **Long-form state machine inside Output phase:** `outlining → review_outline → writing → complete`. Plus `paused`.
5. **Complete** — merged document becomes a new Iteration; existing Realign / Finalize / Carry-over / Export flows work against it.

## States

| State | Meaning | Visible label |
|-------|---------|---------------|
| `outlining` | LLM call to generate outline in flight | "Building outline…" |
| `review_outline` | User reviewing/editing outline | "Review outline" |
| `writing` | Auto-advance loop running through sections | "Writing section N of M…" |
| `paused` | User paused, or section errored | "Paused" |
| `complete` | All sections done | "Done" |

State transitions:
- `outlining → review_outline` when outline LLM call returns.
- `review_outline → writing` on user's "Start Writing" click.
- `writing → paused` on user's Pause click or section error.
- `paused → writing` on Resume.
- `writing → complete` when `current_section_index === outline.length`.

## Data model

New optional field on `sessions.data` (JSONB; backwards-compatible — absent means non-long-form session):

```ts
long_form: {
  state: "outlining" | "review_outline" | "writing" | "paused" | "complete",
  current_section_index: number,    // 0-based; -1 before writing starts
  outline: OutlineSection[],
  continuity_snapshot: ContinuitySnapshot | null,  // reuses Project B type
  started_at: string,                // ISO timestamp
  completed_at: string | null,
}

OutlineSection = {
  id: string,                        // stable UUID
  title: string,
  abstract: string,                  // 1-sentence description
  status: "pending" | "writing" | "complete" | "error",
  content: string,                   // empty until status=complete
  revision: number,                  // bumps on regenerate
  finish_reason: string | null,      // "stop" | "length" per section
  error: string | null,              // populated on status=error
  generated_at: string | null,
}
```

Decisions:
- Outline lives at the session level (one outline per session). The merged final document becomes a new `Iteration` at Complete, so existing version-history / export / eval / realign all keep working.
- Section `content` stored verbatim. Continuity snapshot regenerated and overwritten after each section completes (no snapshot history — matches Project B).
- `revision` lets activity log distinguish first write vs regenerate.
- `status="error"` is its own terminal per section — Retry button on that section rather than blocking the whole loop.

## Backend

New router: `backend/routers/long_form.py`. Four endpoints. Reuses `OpenRouterClient.generate_with_meta()`, `continuity.py`, and `build_iteration_with_full_pipeline` from Project B.

| Method | Path | LLM calls | Inputs | Returns |
|--------|------|-----------|--------|---------|
| POST | `/api/detect-long-form` | 1 small | `inputs: PMInput` | `{is_long_form: bool, suggested_section_count: int, reason: str}` |
| POST | `/api/generate-outline` | 1 | `inputs: PMInput, suggested_section_count: int` | `{outline: OutlineSection[]}` (status="pending", content="", revision=0) |
| POST | `/api/generate-section` | 1–2 | `inputs, outline, section_index, prior_snapshot, prev_section_content` | `{content, finish_reason, new_snapshot}` |
| POST | `/api/finalize-long-form` | 3 (parallel) | `inputs, merged_content, outline` | Full `Iteration` with `evaluation`, `suggestions`, `summary` |

New schemas in `backend/promptmaster/schemas.py`: `OutlineSection`, `LongFormState`, `DetectLongFormResponse`, `GenerateOutlineResponse`, `GenerateSectionResponse`. Existing types untouched.

`engine.py` and `conversation.py` are untouched. Per-section regenerate calls `/api/generate-section` with the existing section_index — overwrites content, bumps revision client-side.

`/api/finalize-long-form` reuses `build_iteration_with_full_pipeline` (extracted to `backend/routers/_pipeline.py` in Project B) — runs eval + suggestions + summary in parallel on the pre-generated merged document. No regeneration. `trigger_source` on the resulting Iteration is `"long_form_finalize"` (new label added to `_TRIGGER_LABELS` in `session_context.py`).

**Backend remains stateless.** Auto-advance loop runs on the frontend; backend has no knowledge of session state, no in-memory document store. Each endpoint is a pure transformation.

## Frontend

New directory: `frontend/src/components/long-form/`.

| File | Purpose |
|------|---------|
| `state-pill.tsx` | Top of output-phase content well. Shows current state + progress. Material Symbols icons. |
| `long-form-proposal.tsx` | Proposal card after detect=true. Plan It Out / Just Generate buttons. |
| `outline-panel.tsx` | Outline editor in `outlining` and `review_outline`. Per-row: title input, abstract input, delete, reorder. Add Section. Start Writing button. |
| `section-list.tsx` | Renders sections in writing/complete states. Status icon + title + collapsible content. Per-section Regenerate on complete, Retry on error. |
| `long-form-view.tsx` | Top-level wrapper. Owns auto-advance loop, calls API client in sequence, writes to Zustand, persists to Supabase between sections. |

Modified:

| File | Change |
|------|--------|
| `frontend/src/components/phases/output-phase.tsx` | Conditionally renders `<LongFormView />` when `sessionStore.longForm` is present and active. Continue Document card hidden when long-form active. |
| `frontend/src/stores/session-store.ts` | New slice: `longForm: LongFormState \| null` with actions `setLongFormState`, `updateOutline`, `setSectionContent`, `setCurrentSectionIndex`, `setLongFormPaused`, `clearLongForm`. |
| `frontend/src/lib/api/client.ts` | Three new methods: `detectLongForm`, `generateOutline`, `generateSection`. |
| `frontend/src/types/index.ts` | Mirrors of `OutlineSection`, `LongFormState`, three response types. |

`frontend/src/lib/supabase/sessions.ts` — `updateSession` already supports arbitrary `data` JSONB; called from `long-form-view.tsx` after each section completes.

### UI copy (plain language per existing feedback)

- States in pill: "Building outline…", "Review outline", "Writing section 4 of 12…", "Paused", "Done"
- Proposal card body: "This looks like a long-form document — I can plan it section by section first for more coherent results."
- Proposal buttons: "Plan It Out" / "Just Generate"
- Per-section error state: "Couldn't generate this section. [Retry]"
- No exposure of `state`, `current_section_index`, `continuity_snapshot`, `finish_reason`, or other internal terminology.

## Auto-advance loop (frontend orchestration)

```
for section in outline:
  if state === "paused": break
  set section.status = "writing"
  persist to Supabase
  call /api/generate-section
    inputs: { inputs, outline, section_index, prior_snapshot, prev_section_content }
  if call errors after retry:
    set section.status = "error", section.error = msg
    set state = "paused"
    persist; break
  set section.content = response.content
  set section.status = "complete"
  set section.finish_reason = response.finish_reason
  if finish_reason === "length":
    retry this section once with raised max_tokens
    accept whatever returns
  continuity_snapshot = response.new_snapshot
  current_section_index += 1
  persist to Supabase

if current_section_index === outline.length:
  set state = "complete"
  merged_content = outline.map(s => s.content).join("\n\n")
  call /api/finalize-long-form with { inputs, merged_content, outline }
  append returned Iteration to iterations array
  persist
```

Pause check happens between sections (not mid-call). In-flight section tokens are paid; pause takes effect on the next iteration.

## Per-section grounding

Each `/api/generate-section` call receives:
- `inputs` — full PMInput (objective, audience, mode, constraints, format)
- `outline` — full outline with all titles + abstracts (lets the section know what came before structurally and what comes after)
- `section_index` — which section to write
- `prior_snapshot` — `ContinuitySnapshot` from after the previous section, or `null` for section 0
- `prev_section_content` — verbatim content of the immediately preceding section, or `null` for section 0

Token cost stays bounded per section regardless of total document length. Avoids the ~100-page ceiling Sean hit (#10).

## Edge cases

| Case | Behavior |
|------|----------|
| Detect false positive | Proposal card's "Just Generate" is one-click escape |
| `/api/generate-section` fails after client retries | Mark section `status="error"`, store error, set state to `paused`, show Retry button |
| `finish_reason="length"` on one section | Auto-retry that section once with raised `max_tokens`; if still length, accept partial and surface to user for manual regenerate |
| Refresh / tab close mid-writing | Resume on reload in `paused` state; in-flight section is lost and loop continues from next pending |
| Skip on proposal then regret | C-1: no recovery; "Switch to long-form" is Phase C.next |
| Mode interaction | Long-form works with all 8 modes + custom. Mode's system prompt used for outline AND each section. Mode shapes prose tone, not workflow |
| Existing saved sessions | `long_form` field optional; absent means today's flow |
| Realignment + long-form | C-1: realignment on merged document only. Section-level is Phase C.next |
| Chat panel during writing | Pause the loop while chat action is in flight (`chatLoading` guard pattern from Project B fix) |
| Outline edit while writing | Disabled. User must Pause first. C-1 keeps it simple |
| Continue Document for non-long-form | Unchanged. Project B behavior preserved |

## Testing

**Backend (pytest, ~15–18 new tests in `backend/tests/test_long_form.py`):**
- Detect classifier: true positives (BRD, white paper, book chapter, 50-page request), true negatives (short objectives), edge cases
- Outline generation: returns valid `OutlineSection[]`, abstracts non-empty, count matches `suggested_section_count`
- Section generation: receives all grounding fields correctly, snapshot regenerated, `finish_reason` propagated
- Finalize: takes pre-generated merged content, returns Iteration with eval+suggestions+summary, `trigger_source="long_form_finalize"`
- `force_incomplete_on_length` already covered by Project B tests
- Error paths: invalid model, OpenRouter failure, malformed JSON

**Frontend (manual smoke per existing project convention; no Vitest infra yet):**
- 15-section BRD objective → detect=true → Plan It Out → outline generated → edit a section title → Start Writing → state pill updates per section → Pause mid-writing → refresh page → Resume → finishes → Complete state shows eval card
- Per-section Regenerate: only that section updates; revision bumps; other sections untouched
- Error path: simulate failed section (network throttle), Retry button works
- Skip path: Just Generate falls back to today's flow with no long-form state in sessions.data
- Backwards compat: open a saved session from before Phase C — renders today's flow, no long_form references

## Open questions resolved during brainstorming

| Question | Decision |
|----------|----------|
| Activation trigger | Auto-detect with user accept/skip |
| Outline shape | Headers + 1-sentence abstract per section |
| Execution model | Section-by-section serial auto-advance |
| Persistence | Full Supabase via `sessions.data` JSONB |
| State machine granularity | 4 core states + paused |
| Phase router fit | Sub-view inside Output phase (not new top-level phase) |
| Section grounding | Outline + rolling snapshot + prev section verbatim |
| Eval cadence | Once at Complete, on whole document |
| Continue Document interaction | Hidden in long-form mode |
| Section revision | Per-section Regenerate button only (no manual text edit in C-1) |
| Run controls | Pause / Resume only |

## Dependencies

- Project B (shipped 2026-05-07): reuses `CompletenessResult`, `ContinuitySnapshot`, `continuity.py` (`generate_continuity_snapshot`, `_shared_system`), `OpenRouterClient.generate_with_meta()`, `force_incomplete_on_length`.

## Risks

| Risk | Mitigation |
|------|------------|
| Detect classifier false negatives (Sean hits "should be long-form" but gets single-output) | User can manually re-enter Input and add hint to objective; or Phase C.next adds a "Plan section-by-section" toggle in Review phase |
| Section LLM call cost on long docs (12-section doc = ~13 LLM calls vs 1 today) | Acceptable — Sean's stress tests show today's single-call approach already fails; user picks Just Generate if cost is a concern |
| User edits outline mid-flow not supported in C-1 | Pause-then-edit is documented; if it becomes a frequent ask, Phase C.next adds in-flight outline editing |
| Per-section continuity snapshot is lossy | Project B's snapshot has worked for Continue Document; same structure here. If sections start drifting in long docs, expand snapshot fields in Phase C.next |
| Chat panel race conditions | Pause auto-advance during chat actions (existing `chatLoading` pattern) |
