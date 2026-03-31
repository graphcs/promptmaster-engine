# PromptMaster Engine v2 — Update Summary

**Date:** March 26, 2026
**Commit:** `c17ba75`
**Deployed to:** Streamlit Cloud (auto-deploy from `master`)

---

## What Changed

### 1. Quick-Fill Examples Relabeled

**Before:** Labels like "API Design (Architect)", "TLS Explained (Clarity)", "Vague Input (Realignment Test)" — felt too technical and internal.

**After:** Mode-first format: "Architect — structured planning", "Clarity — simplify a concept", "Clarity — refine a rough idea". Broader, non-technical objectives that any user can relate to.

**Business Value:** Reduces confusion for non-technical users. Makes the mode selection the primary concept, with the example secondary. Directly addresses feedback that examples felt inaccessible.

### 2. Predefined Constraint & Format Options

**Before:** Constraints and Output Format were free-text-only fields. Users frequently left them blank.

**After:** Clickable multiselect chips above each field with common options:
- **Constraints:** "Keep it under 300 words", "No jargon", "Include concrete examples", "Focus on actionable steps", etc.
- **Formats:** "Bullet points", "Numbered list", "Step-by-step guide", "Executive summary", etc.

The textarea remains fully editable for custom additions.

**Business Value:** "Pushing buttons is easier than writing instructions." Users who previously left fields blank will now engage with constraints, leading to better outputs and demonstrating the value of the structured approach.

### 3. Onboarding Panel

**Before:** New users landed on a form with 5+ fields, 8 buttons, and no guidance. Some abandoned the tool.

**After:** A dismissable welcome panel appears for first-time users with:
- 3-step guide: Pick a mode → Describe objective → Click Assemble
- "Try an example" button that auto-fills and gets them started immediately
- "Got it, let me start" dismiss button
- Auto-dismisses for returning users with saved sessions

**Business Value:** Eliminates the #1 reported friction point. A product leader abandoned the tool due to initial overwhelm — this ensures every new user can take action within seconds.

### 4. Drift Visually Separated from Quality Scores

**Before:** Alignment, Drift, and Clarity displayed in 3 equal columns — treating them identically.

**After:** Alignment and Clarity grouped under "Quality Scores" (2 columns). Drift shown below under "Scope Check" with an explanatory caption: *"Drift measures whether the output stayed focused on your objective. Low = focused. High = wandered off-topic."*

**Business Value:** Makes the evaluation more intuitive. Drift is a different type of signal (scope deviation vs. quality metric), and separating it visually helps users understand what each score means.

### 5. Post-Evaluation Guidance (LLM-Powered)

**Before:** After seeing scores, users had no guidance on what to do next.

**After:** A third LLM call runs automatically after evaluation, generating 2-3 specific, contextual suggestions tailored to the user's actual objective and evaluation results. For example, instead of generic advice, a user working on a course launch plan might see: "Your plan drifted into marketing tactics — try constraining the scope to content structure and timeline only."

The suggestions are generated during the existing generate+evaluate step (no extra wait), and fall back to deterministic rules if the LLM call fails.

**Business Value:** Teaches users the PromptMaster loop intuitively with personalized coaching. Instead of wondering "what now?", they get specific next steps that reference their actual objective and what went wrong — reinforcing the structured methodology through guided iteration.

### 6. Structural Value Callouts

**Before:** Users saw improved output but attributed it to "better NLP" or model quality, not the workflow layer.

**After:** Subtle captions at each phase:
- **Input:** "PromptMaster structures your request with mode locking, anchoring, and invisible scaffolding..."
- **Review:** "Your input has been assembled into a two-layer prompt: a system prompt that locks the AI's persona..."
- **Output:** "These scores come from a separate evaluator — a second AI call that independently checks the output..."
- **Realignment:** "This is the core of the iterative loop — most quality gains come from iteration 2 or 3."

**Business Value:** Makes the structured loop's value visible. Users understand they're not just getting "better prompting" — they're using a methodology with mode locking, separate evaluation, and iterative correction.

### 7. Expanded Usage Tracking

**Before:** Only recorded "iteration" events for authenticated users.

**After:** Records additional action types: `realignment`, `self_audit`, `hard_reset`, `session_finalize`. Same table, no schema changes.

**Business Value:** Enables future analytics on how users engage with the full loop — which features drive value, where users drop off, what patterns indicate mastery progression.

---

## Technical Details

- **Files changed:** `app.py` (159 insertions, 43 deletions), `promptmaster/guidance.py` (new, 58 lines)
- **No schema changes** — Supabase tables unchanged
- **No new dependencies** — all within Streamlit's built-in components
- **Backward compatible** — existing sessions and templates work without modification
- **Rollback:** `git revert c17ba75` to undo all changes in one step

---

## Known Limitations

- **Preset chips use `st.multiselect`** — functional but not as visually compact as toggle chips. Could upgrade to custom components later.
- **Onboarding is session-based** for anonymous users — reappears on page reload. For signed-in users, it auto-dismisses once they have saved sessions.

---

## Next Steps (Deferred)

1. **Continuity/Memory Layer** — carry context across sessions, detect recurring drift patterns
2. **Analytics Dashboard** — usage data is now being collected; visualization layer can be built later
3. **Predefined Mode Packs** — domain-specific packs (e.g., "Analyst Decision Pack") for specialized use cases
