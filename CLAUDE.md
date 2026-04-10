# PromptMaster Engine

## What This Is

PromptMaster Engine is a professional AI workflow platform that structures interactions with LLMs using modes, evaluation, and iterative refinement. It is NOT a chatbot — it's a 5-phase guided workflow for analysts, auditors, lawyers, and strategists who need aligned, evaluated AI outputs.

The system is based on a book ("How to Become a PromptMaster" by Sean Moran) and has a provisional patent covering the structured interaction + evaluation loop.

## Architecture

**Monorepo with two deployable units:**

- `frontend/` — Next.js 16 (App Router) deployed on Vercel
- `backend/` — FastAPI (Python) deployed on Vercel as a separate project

**External services:**
- **Supabase** — Auth (Google OAuth + email/password) and data (sessions, templates, usage tracking)
- **OpenRouter** — LLM API proxy (backend calls OpenRouter, frontend never talks to LLMs directly)

**Key principle:** The backend is a stateless LLM proxy. It only has `OPENROUTER_API_KEY`. All user data (auth, sessions, templates) is handled directly by the frontend via Supabase JS SDK with RLS.

## Branches

- `main` — Production branch (Next.js + FastAPI). Vercel deploys from this branch.
- `master` — Legacy Streamlit app (kept as rollback/backup). Do NOT deploy from master.

## Frontend (`frontend/`)

**Tech stack:** Next.js 16, Tailwind CSS v4, shadcn/ui, Zustand, @supabase/ssr, Inter font, Material Symbols Outlined icons

**Design system:** "Foundry Slate" / "Architectural Monolith" — tonal surface separation (no 1px borders), editorial typography (2.75rem display headings), 720px content well, ambient shadows. Design spec at `design-system/` (not committed to git).

**Key files:**
- `src/app/session/page.tsx` — Phase router (renders active phase component)
- `src/app/session/session-shell.tsx` — Layout shell (sidebar + top nav + content well)
- `src/components/phases/` — 5 phase components: input, review, output, realign, summary
- `src/components/layout/` — sidebar, top-nav, content-well
- `src/components/shared/` — mode-grid, constraint-pills, eval-section, suggestions-list, custom-select, session-modal, template-modal, markdown-output
- `src/components/tutorial/` — Step-by-step spotlight tutorial system
- `src/stores/session-store.ts` — Zustand store with sessionStorage persistence
- `src/lib/api/client.ts` — FastAPI fetch wrapper (all 9 endpoints)
- `src/lib/supabase/` — Supabase client, sessions CRUD, templates CRUD, usage tracking
- `src/lib/constants.ts` — MODE_DISPLAY, CONSTRAINT_PRESETS, FORMAT_PRESETS, EXAMPLES, AUDIENCE_OPTIONS, TIER_INFO
- `src/types/index.ts` — TypeScript mirrors of backend Pydantic schemas

**Auth:** Google OAuth + email/password via Supabase. Proxy at `proxy.ts` (Next.js 16 renamed middleware to proxy). Force-dynamic on auth and session routes.

**State persistence:** Zustand `persist` middleware with `sessionStorage` — survives page refresh but clears on tab/browser close.

**Tutorial:** 8-step spotlight overlay that auto-starts for first-time users. Completion tracked in localStorage (`pm-tutorial-completed`). Replay from sidebar.

## Backend (`backend/`)

**Tech stack:** FastAPI, uvicorn, httpx, pydantic, python-dotenv

**Key files:**
- `main.py` — FastAPI app with CORS middleware
- `deps.py` — OpenRouterClient dependency injection via lifespan
- `routers/engine.py` — 7 POST endpoints for LLM operations
- `routers/meta.py` — GET /api/modes, GET /api/models
- `promptmaster/` — Engine modules (copied from original Streamlit app, unchanged)

**API endpoints:**
| Method | Path | LLM Calls | Purpose |
|--------|------|-----------|---------|
| GET | /api/health | 0 | Health check |
| GET | /api/modes | 0 | Mode display info (no scaffolding exposed) |
| GET | /api/models | 0 | Available models from OpenRouter |
| POST | /api/build-prompt | 0 | Assemble optimized prompt from inputs |
| POST | /api/run-iteration | 3 | Generate + evaluate + suggestions |
| POST | /api/build-realignment | 1-2 | Build corrective realignment prompt |
| POST | /api/run-self-audit | 1 | Cold Critic session audit |
| POST | /api/hard-reset-lessons | 1 | Extract lessons before reset |
| POST | /api/format-summary | 0 | Generate copyable text summary |
| POST | /api/export-session | 0 | Export session as JSON |

**Custom mode:** PMInput includes optional `custom_name`, `custom_preamble`, `custom_tone` fields. The prompt builder injects these into the system prompt when mode is "custom".

**CORS:** `ALLOWED_ORIGINS` env var (comma-separated). No hardcoded defaults — must be set.

## Supabase Schema

Three tables with RLS (all scoped to authenticated user):
- `sessions` — user_id, session_id, objective, mode, audience, iterations (count), finalized, data (JSONB), created_at
- `templates` — user_id, template_id, name, mode, audience, data (JSONB), created_at
- `usage_tracking` — user_id, action (iteration/realignment/self_audit/hard_reset/session_finalize), created_at

## Environment Variables

**Frontend (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=        # Backend URL (e.g. https://promptmaster-api.vercel.app)
```

**Backend (.env or Vercel env vars):**
```
OPENROUTER_API_KEY=
ALLOWED_ORIGINS=            # Frontend URL (e.g. https://promptmaster-engine.vercel.app)
```

## The 5-Phase Workflow

1. **Input** — Select mode (8 modes as card grid), write objective, set audience, add constraint/format presets
2. **Review** — View assembled system prompt, edit user prompt, execute (triggers LLM)
3. **Output & Evaluation** — View generated output, see evaluation scores (Alignment, Clarity, Drift), get AI suggestions, choose to refine/realign/finalize
4. **Realignment** — Edit corrective prompt, re-execute (triggered when Alignment=Low or Drift=High)
5. **Summary** — Final output, export (txt/json), iteration comparison, Cold Critic self-audit, carry lessons forward

## Evaluation System

Separate LLM call evaluates output on 3 dimensions:
- **Alignment** — Does output match the objective? (High/Medium/Low)
- **Clarity** — Is it well-structured? (High/Medium/Low)
- **Drift** — Did it wander off-topic? (Low=good, High=bad — inverted polarity)

Realignment triggers when: Alignment=Low OR Drift=High.

## Important Conventions

- **Never mention client/stakeholder names** in commits, code, or public-facing content
- **Material Symbols Outlined** for all icons (not Lucide, not emojis)
- **Inter font** exclusively
- **No 1px borders for sections** — use tonal background shifts (Foundry Slate "No-Line Rule")
- All components use `'use client'` directive
- CSS custom properties from the design system (e.g. `var(--pm-primary)`, `var(--surface-container-low)`)
- Tailwind v4 uses `@plugin` directive for plugins (not `@import`)
- Next.js 16 uses `proxy.ts` instead of `middleware.ts`
- Build must pass (`npm run build`) before pushing — auth/session pages use `force-dynamic`
