"""PromptMaster Engine — Streamlit UI"""

import streamlit as st
import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()

# Bridge Streamlit Cloud secrets to environment variables so that
# OpenRouterClient and Supabase client work on both local and cloud.
import os
for _secret_key in ("OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"):
    if not os.getenv(_secret_key):
        try:
            os.environ[_secret_key] = st.secrets[_secret_key]
        except (KeyError, FileNotFoundError):
            pass

logging.basicConfig(level=logging.INFO)

from promptmaster.auth import render_auth_page, get_current_user, logout

# ============================================================================
# Page Config — must be the very first Streamlit command
# ============================================================================

_is_authed = get_current_user() is not None
st.set_page_config(
    page_title="PromptMaster Engine",
    page_icon="🎯",
    layout="wide" if _is_authed else "centered",
    initial_sidebar_state="expanded" if _is_authed else "collapsed",
)

# ============================================================================
# Auth Gate
# ============================================================================

if not _is_authed:
    if not render_auth_page():
        st.stop()

# At this point, user is authenticated
from promptmaster.schemas import PMInput, EvaluationResult, Iteration, Session, PromptTemplate
from promptmaster.modes import MODES
from promptmaster.prompt_builder import build_prompt
from promptmaster.engine import run_iteration, format_session_summary, export_session_json, run_self_audit, generate_hard_reset_lessons
from promptmaster.realigner import build_realignment_prompt
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.session_store import SessionStore
from promptmaster.template_store import TemplateStore
from promptmaster.db import get_supabase

_current_user = get_current_user()

# ============================================================================
# CSS
# ============================================================================

st.markdown("""<style>
#MainMenu {visibility: hidden !important;}
footer {visibility: hidden !important;}
.stDeployButton {display: none !important;}
[data-testid="stToolbar"] {display: none !important;}

.block-container {padding-top: 1.5rem !important;}

.score-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.9em;
}
.score-high-good { background: #065f46; color: #6ee7b7; }
.score-medium { background: #78350f; color: #fcd34d; }
.score-low-bad { background: #7f1d1d; color: #fca5a5; }

.iteration-card {
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
}
.trend-up { color: #6ee7b7; font-weight: 700; }
.trend-down { color: #fca5a5; font-weight: 700; }
.trend-same { color: #9ca3af; }

/* Hide sidebar collapse button — keep sidebar always visible */
[data-testid="stSidebarCollapseButton"] {
    display: none !important;
}
</style>""", unsafe_allow_html=True)

# ============================================================================
# Session State Defaults
# ============================================================================

_defaults = {
    "pm_objective": "",
    "pm_audience": "General",
    "pm_constraints": "",
    "pm_output_format": "",
    "pm_mode": "architect",
    "pm_custom_name": "",
    "pm_custom_preamble": "",
    "pm_custom_tone": "",
    "pm_assembled": None,
    "pm_prompt_edited": "",
    "pm_system_prompt": "",
    "pm_iterations": [],
    "pm_current_output": None,
    "pm_current_eval": None,
    "pm_realignment_prompt": None,
    "pm_phase": "input",
    "pm_finalized": False,
    "pm_error": None,
    "pm_model": OpenRouterClient.DEFAULT_MODEL,
    "pm_show_scaffolding": False,
    "pm_models_cache": None,
    "pm_session_saved": False,
    "pm_self_audit": None,
}

for _k, _v in _defaults.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

# Per-user stores — scoped by authenticated user ID
_store = SessionStore(user_id=_current_user["id"], access_token=_current_user["access_token"])
_template_store = TemplateStore(user_id=_current_user["id"], access_token=_current_user["access_token"])


# ============================================================================
# Helpers
# ============================================================================

DAILY_ITERATION_LIMIT = 20


def check_rate_limit() -> tuple[bool, int]:
    """Check if the user has exceeded their daily iteration limit.

    Returns (allowed, remaining).
    """
    try:
        from datetime import datetime, timezone, timedelta
        one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        sb = get_supabase()
        sb.postgrest.auth(_current_user["access_token"])
        result = (
            sb.table("usage_tracking")
            .select("id", count="exact")
            .eq("user_id", _current_user["id"])
            .eq("action", "iteration")
            .gte("created_at", one_day_ago)
            .execute()
        )
        used = result.count if result.count is not None else 0
        remaining = max(0, DAILY_ITERATION_LIMIT - used)
        return remaining > 0, remaining
    except Exception:
        # Fail open — don't block users if tracking is down
        return True, DAILY_ITERATION_LIMIT


def record_iteration():
    """Record an iteration for rate limiting."""
    try:
        sb = get_supabase()
        sb.postgrest.auth(_current_user["access_token"])
        sb.table("usage_tracking").insert({
            "user_id": _current_user["id"],
            "action": "iteration",
        }).execute()
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to record usage: {e}")


def run_async(coro):
    """Run an async coroutine from Streamlit's sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


def score_badge_html(label: str, score: str) -> str:
    """Render a colored score badge. Drift polarity is inverted."""
    if label.lower() == "drift":
        # Low drift = good, High drift = bad
        css = {"Low": "score-high-good", "Medium": "score-medium", "High": "score-low-bad"}
    else:
        # High alignment/clarity = good, Low = bad
        css = {"High": "score-high-good", "Medium": "score-medium", "Low": "score-low-bad"}
    cls = css.get(score, "score-medium")
    return f'<span class="score-badge {cls}">{score}</span>'


def render_evaluation(evaluation: EvaluationResult):
    """Render the evaluation scorecard."""
    st.markdown("### Evaluation Scores")

    cols = st.columns(3)
    for col, (label, dim) in zip(cols, [
        ("Alignment", evaluation.alignment),
        ("Drift", evaluation.drift),
        ("Clarity", evaluation.clarity),
    ]):
        with col:
            st.markdown(
                f"**{label}:** {score_badge_html(label, dim.score)}",
                unsafe_allow_html=True,
            )
            st.caption(dim.explanation)


def reset_session():
    """Reset all session state to defaults."""
    for k, v in _defaults.items():
        st.session_state[k] = v


_SCORE_MAP = {"Low": 1, "Medium": 2, "High": 3}


def score_trend_html(label: str, prev_score: str, curr_score: str) -> str:
    """Return an HTML arrow indicating improvement/decline between iterations."""
    prev = _SCORE_MAP.get(prev_score, 2)
    curr = _SCORE_MAP.get(curr_score, 2)
    # Drift is inverted: lower is better
    if label.lower() == "drift":
        delta = prev - curr  # going down = improving
    else:
        delta = curr - prev  # going up = improving
    if delta > 0:
        return '<span class="trend-up" title="Improved">&#9650;</span>'
    elif delta < 0:
        return '<span class="trend-down" title="Declined">&#9660;</span>'
    return '<span class="trend-same" title="Unchanged">&#8212;</span>'


def render_iteration_history(iterations: list[Iteration]):
    """Render iteration history with score trend indicators."""
    for idx, it in enumerate(iterations):
        st.markdown(f"**Iteration {it.iteration_number}** ({it.mode.title()} Mode)")
        if it.evaluation:
            e = it.evaluation
            # Build score line with optional trend arrows
            parts = []
            for label, dim in [("Alignment", e.alignment), ("Drift", e.drift), ("Clarity", e.clarity)]:
                badge = score_badge_html(label, dim.score)
                trend = ""
                if idx > 0 and iterations[idx - 1].evaluation:
                    prev_e = iterations[idx - 1].evaluation
                    prev_dim = getattr(prev_e, label.lower())
                    trend = " " + score_trend_html(label, prev_dim.score, dim.score)
                parts.append(f"{label}: {badge}{trend}")
            st.markdown(" | ".join(parts), unsafe_allow_html=True)
        with st.expander(f"Output (Iteration {it.iteration_number})", expanded=False):
            st.markdown(it.output)


_TIER_INFO = {
    1: {"name": "Prompt Starter", "icon": "1", "next": "Try specifying audience, constraints, and output format to reach Tier 2."},
    2: {"name": "Prompt Practitioner", "icon": "2", "next": "Try switching modes mid-session and iterating 2+ times to reach Tier 3."},
    3: {"name": "Prompt Architect", "icon": "3", "next": "Run self-audits, use hard resets, and create custom modes to reach Tier 4."},
    4: {"name": "PromptMaster", "icon": "4", "next": "You're operating at the highest level. Keep experimenting and teaching others."},
}


def assess_tier(sessions: list[dict], current_iterations: list, current_state: dict) -> int:
    """Estimate the user's PromptMaster tier from their usage patterns (Ch4, Appendix A).

    Scoring:
    - Tier 1: Basic usage (few fields, no iteration)
    - Tier 2: Uses constraints/audience/format, some iteration
    - Tier 3: Multi-iteration, mode switching, consistent quality
    - Tier 4: Self-audits, hard resets, custom modes, teaches patterns
    """
    score = 0

    # Current session signals
    has_constraints = bool(current_state.get("pm_constraints", "").strip())
    has_format = bool(current_state.get("pm_output_format", "").strip())
    has_audience = current_state.get("pm_audience", "General") != "General"
    iteration_count = len(current_iterations)
    used_custom = current_state.get("pm_mode") == "custom"
    ran_self_audit = current_state.get("pm_self_audit") is not None

    # Tier 2 signals: uses structure
    if has_constraints:
        score += 1
    if has_format:
        score += 1
    if has_audience:
        score += 1
    if iteration_count >= 2:
        score += 1

    # Tier 3 signals: multi-step strategy
    if iteration_count >= 3:
        score += 1
    # Mode switching (different modes across iterations)
    modes_used = set(it.mode for it in current_iterations) if current_iterations else set()
    if len(modes_used) > 1:
        score += 2

    # Tier 4 signals: mastery features
    if ran_self_audit:
        score += 2
    if used_custom:
        score += 1
    # History depth (multiple saved sessions)
    if len(sessions) >= 3:
        score += 1
    if len(sessions) >= 5:
        score += 1

    # Map score to tier
    if score >= 8:
        return 4
    elif score >= 5:
        return 3
    elif score >= 2:
        return 2
    return 1


def render_comparison(iterations: list[Iteration]):
    """Side-by-side comparison of two iterations."""
    if len(iterations) < 2:
        return
    labels = [f"Iteration {it.iteration_number}" for it in iterations]
    col1, col2 = st.columns(2)
    with col1:
        left_idx = st.selectbox("Left", range(len(iterations)), index=len(iterations) - 2,
                                format_func=lambda i: labels[i], key="cmp_left")
    with col2:
        right_idx = st.selectbox("Right", range(len(iterations)), index=len(iterations) - 1,
                                 format_func=lambda i: labels[i], key="cmp_right")

    left, right = iterations[left_idx], iterations[right_idx]
    col1, col2 = st.columns(2)
    for col, it, label in [(col1, left, labels[left_idx]), (col2, right, labels[right_idx])]:
        with col:
            st.markdown(f"**{label}**")
            if it.evaluation:
                e = it.evaluation
                for dim_label, dim in [("Alignment", e.alignment), ("Drift", e.drift), ("Clarity", e.clarity)]:
                    st.markdown(
                        f"{dim_label}: {score_badge_html(dim_label, dim.score)}",
                        unsafe_allow_html=True,
                    )
            st.markdown("---")
            st.markdown(it.output)



# ============================================================================
# Sidebar
# ============================================================================

with st.sidebar:
    st.markdown("## PromptMaster Engine")
    st.caption("Structured interaction for aligned LLM outputs")

    # User info + logout
    user_name = _current_user.get("name", _current_user.get("email", "User"))
    st.markdown(f"Signed in as **{user_name}**")
    if st.button("Sign Out", use_container_width=True, key="logout_btn"):
        logout()
        st.rerun()

    st.divider()

    # Model selector
    st.markdown("**Model**")

    # Try to fetch models, cache them
    if st.session_state.pm_models_cache is None:
        try:
            models = run_async(OpenRouterClient.fetch_text_models())
            st.session_state.pm_models_cache = models
        except Exception:
            st.session_state.pm_models_cache = []

    model_ids = [m["id"] for m in st.session_state.pm_models_cache] if st.session_state.pm_models_cache else []

    if model_ids:
        default_idx = 0
        if st.session_state.pm_model in model_ids:
            default_idx = model_ids.index(st.session_state.pm_model)
        selected_model = st.selectbox(
            "Select model",
            model_ids,
            index=default_idx,
            label_visibility="collapsed",
        )
        st.session_state.pm_model = selected_model
    else:
        st.session_state.pm_model = st.text_input(
            "Model ID",
            value=st.session_state.pm_model,
            label_visibility="collapsed",
        )

    st.divider()

    # Session info
    iteration_count = len(st.session_state.pm_iterations)
    if iteration_count > 0:
        st.metric("Iterations", iteration_count)

    current_phase = st.session_state.pm_phase
    phase_labels = {
        "input": "1. Input",
        "review": "2. Review Prompt",
        "output": "3. Output & Evaluation",
        "realign": "4. Realignment",
        "summary": "5. Session Summary",
    }
    st.caption(f"Phase: {phase_labels.get(current_phase, current_phase)}")

    # Tier System (Book Ch4, Appendix A)
    saved_sessions = _store.list_sessions()
    tier = assess_tier(
        sessions=saved_sessions,
        current_iterations=st.session_state.pm_iterations,
        current_state=st.session_state,
    )
    tier_info = _TIER_INFO[tier]
    tier_colors = {1: "#9ca3af", 2: "#60a5fa", 3: "#a78bfa", 4: "#fbbf24"}
    st.markdown(
        f'<div style="border:1px solid {tier_colors[tier]}; border-radius:8px; padding:8px 12px; margin:8px 0;">'
        f'<span style="font-size:1.3em; font-weight:700; color:{tier_colors[tier]};">'
        f'Tier {tier}</span> '
        f'<span style="color:{tier_colors[tier]}; font-weight:600;">{tier_info["name"]}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )
    st.caption(tier_info["next"])

    # Daily usage
    _, remaining = check_rate_limit()
    st.caption(f"Iterations today: {DAILY_ITERATION_LIMIT - remaining}/{DAILY_ITERATION_LIMIT}")

    st.divider()
    if st.button("🔄 New Session", use_container_width=True):
        reset_session()
        st.rerun()

    # Session history (saved_sessions already fetched for tier assessment above)
    if saved_sessions:
        with st.expander(f"Session History ({len(saved_sessions)})"):
            for s in saved_sessions:
                obj_preview = s["objective"][:50] + ("..." if len(s["objective"]) > 50 else "")
                st.caption(f"**{s['mode'].title()}** | {s['iterations']} iter | {obj_preview}")
                if st.button("Load", key=f"load_{s['session_id']}", use_container_width=True):
                    session = _store.load(s["session_id"])
                    if session:
                        st.session_state.pm_objective = session.objective
                        st.session_state.pm_audience = session.audience
                        st.session_state.pm_constraints = session.constraints
                        st.session_state.pm_output_format = session.output_format
                        st.session_state.pm_mode = session.mode
                        st.session_state.pm_model = session.model or st.session_state.pm_model
                        st.session_state.pm_iterations = session.iterations
                        if session.iterations:
                            last = session.iterations[-1]
                            st.session_state.pm_current_output = last.output
                            st.session_state.pm_current_eval = last.evaluation
                        st.session_state.pm_finalized = session.finalized
                        st.session_state.pm_phase = "summary" if session.finalized else "output"
                        st.rerun()

    # Prompt Templates (Book Ch7 S2 — reusable prompt frameworks)
    saved_templates = _template_store.list_templates()
    if saved_templates:
        with st.expander(f"Prompt Templates ({len(saved_templates)})"):
            for t in saved_templates:
                st.caption(f"**{t['name']}** | {t['mode'].title()} | {t['audience']}")
                tcol1, tcol2 = st.columns([3, 1])
                with tcol1:
                    if st.button("Apply", key=f"tpl_load_{t['template_id']}", use_container_width=True):
                        template = _template_store.load(t["template_id"])
                        if template:
                            st.session_state.pm_mode = template.mode
                            st.session_state.pm_audience = template.audience
                            st.session_state.pm_constraints = template.constraints
                            st.session_state.pm_output_format = template.output_format
                            if template.objective_hint:
                                st.session_state.pm_objective = template.objective_hint
                                st.session_state.input_objective = template.objective_hint
                            if template.mode == "custom":
                                st.session_state.pm_custom_name = template.custom_name
                                st.session_state.pm_custom_preamble = template.custom_preamble
                                st.session_state.pm_custom_tone = template.custom_tone
                            st.session_state.pm_phase = "input"
                            st.rerun()
                with tcol2:
                    if st.button("🗑", key=f"tpl_del_{t['template_id']}", use_container_width=True):
                        _template_store.delete(t["template_id"])
                        st.rerun()


# ============================================================================
# Main Content
# ============================================================================

st.title("PromptMaster Engine")

# Show error banner if any
if st.session_state.pm_error:
    st.error(st.session_state.pm_error)
    st.session_state.pm_error = None

# ============================================================================
# PHASE: INPUT
# ============================================================================

_EXAMPLES = [
    {
        "label": "API Design (Architect)",
        "objective": "Design a REST API structure for a task management app with projects, tasks, subtasks, and user assignments",
        "audience": "Technical",
        "constraints": "Must follow RESTful conventions, support pagination, use JSON responses",
        "mode": "architect",
    },
    {
        "label": "Strategy Review (Critic)",
        "objective": "Evaluate this product strategy: We plan to launch a social media app targeting users aged 18-25 by competing directly with Instagram on photo sharing",
        "audience": "Executive",
        "constraints": "Budget is $50K, team of 3 developers, 6-month timeline",
        "mode": "critic",
    },
    {
        "label": "TLS Explained (Clarity)",
        "objective": "Explain how HTTPS/TLS handshake works including certificate validation, cipher suite negotiation, and session key derivation",
        "audience": "Student",
        "constraints": "No jargon, use everyday analogies, under 300 words, use numbered steps",
        "mode": "clarity",
    },
    {
        "label": "Dev Learning Plan (Coach)",
        "objective": "I'm a junior developer feeling overwhelmed by my first production codebase. Help me create a 30-day learning plan to get productive",
        "audience": "General",
        "constraints": "Focus on practical steps, not theory. Include daily time commitments under 2 hours",
        "mode": "coach",
    },
    {
        "label": "Burnout (Therapist)",
        "objective": "I'm feeling overwhelmed and burned out at work but I don't know if I should quit or push through. Help me explore what's really going on.",
        "audience": "General",
        "constraints": "Focus on understanding feelings, not giving career advice yet",
        "mode": "therapist",
    },
    {
        "label": "Pitch Audit (Cold Critic)",
        "objective": "Our startup pitch: We're building an AI-powered personal finance app that uses GPT to give investment advice to millennials. We plan to launch in 3 months with a team of 2.",
        "audience": "Executive",
        "constraints": "No praise. Only risks, flaws, and problems.",
        "mode": "cold_critic",
    },
    {
        "label": "Market Analysis (Analyst)",
        "objective": "Analyze the remote work software market: key players, trends, growth drivers, and risks for a new entrant targeting small businesses",
        "audience": "Executive",
        "constraints": "Separate facts from assumptions. Quantify where possible.",
        "mode": "analyst",
    },
    {
        "label": "Vague Input (Realignment Test)",
        "objective": "Tell me about business",
        "audience": "General",
        "constraints": "",
        "mode": "critic",
    },
]

if st.session_state.pm_phase == "input":
    st.markdown("### Step 1: Define Your Request")

    # Example quick-fill buttons (two rows of 4)
    st.caption("Quick-fill with an example:")
    for row_start in range(0, len(_EXAMPLES), 4):
        row_examples = _EXAMPLES[row_start:row_start + 4]
        ex_cols = st.columns(len(row_examples))
        for col, ex in zip(ex_cols, row_examples):
            with col:
                if st.button(ex["label"], key=f"ex_{ex['label']}", use_container_width=True):
                    st.session_state.pm_objective = ex["objective"]
                    st.session_state.pm_audience = ex["audience"]
                    st.session_state.pm_constraints = ex["constraints"]
                    st.session_state.pm_mode = ex["mode"]
                    # Also set the widget keys directly — Streamlit text_area
                    # reads from its key, not the value param, after first render.
                    st.session_state.input_objective = ex["objective"]
                    st.session_state.input_constraints = ex["constraints"]
                    st.rerun()

    st.session_state.pm_objective = st.text_area(
        "Objective *",
        value=st.session_state.pm_objective,
        placeholder="What do you want the AI to produce? Be specific.",
        height=100,
        key="input_objective",
    )

    col1, col2 = st.columns(2)
    with col1:
        audience_options = ["General", "Technical", "Executive", "Academic", "Student", "Other"]
        audience_idx = 0
        if st.session_state.pm_audience in audience_options:
            audience_idx = audience_options.index(st.session_state.pm_audience)
        selected_audience = st.selectbox("Audience", audience_options, index=audience_idx)

        if selected_audience == "Other":
            selected_audience = st.text_input("Specify audience", value="")
        st.session_state.pm_audience = selected_audience

    with col2:
        mode_options = list(MODES.keys())
        mode_labels = [f"{MODES[m]['display_name']} — {MODES[m]['tagline']}" for m in mode_options]
        mode_idx = mode_options.index(st.session_state.pm_mode) if st.session_state.pm_mode in mode_options else 0
        selected_mode_label = st.selectbox("Mode", mode_labels, index=mode_idx)
        st.session_state.pm_mode = mode_options[mode_labels.index(selected_mode_label)]

    # Custom mode definition (Book Ch3 — create your own modes)
    if st.session_state.pm_mode == "custom":
        st.markdown("**Define Your Custom Mode:**")
        cm_col1, cm_col2 = st.columns(2)
        with cm_col1:
            st.session_state.pm_custom_name = st.text_input(
                "Mode Name",
                value=st.session_state.pm_custom_name,
                placeholder="e.g. Marketing Guru, Science Tutor, Devil's Advocate",
                key="custom_name",
            )
        with cm_col2:
            st.session_state.pm_custom_tone = st.text_input(
                "Tone",
                value=st.session_state.pm_custom_tone,
                placeholder="e.g. Enthusiastic but grounded. Uses analogies.",
                key="custom_tone",
            )
        st.session_state.pm_custom_preamble = st.text_area(
            "Persona / System Preamble",
            value=st.session_state.pm_custom_preamble,
            placeholder="Describe who the AI should be, its mission, and how it should behave. e.g. 'You are a marketing strategist who focuses on lean, data-driven campaigns...'",
            height=100,
            key="custom_preamble",
        )
        # Inject custom mode into MODES at runtime
        custom_name = st.session_state.pm_custom_name or "Custom"
        custom_preamble = st.session_state.pm_custom_preamble or MODES["custom"]["system_preamble"]
        custom_tone = st.session_state.pm_custom_tone or MODES["custom"]["tone"]
        MODES["custom"] = {
            "display_name": custom_name,
            "tagline": "Your own mode — define the persona",
            "system_preamble": custom_preamble,
            "tone": custom_tone,
            "user_directive": f"Follow your role as {custom_name}. Stay in character.",
            "scaffolding": (
                "[INTERNAL SCAFFOLDING]\n"
                f"- You are {custom_name}. Follow the persona precisely.\n"
                f"- Tone: {custom_tone}\n"
                "- DRIFT CHECK: Stay true to the custom persona throughout. Do not revert to a generic AI voice\n"
                "- ANCHOR: Re-read the objective before each section"
            ),
        }

    col1, col2 = st.columns(2)
    with col1:
        st.session_state.pm_constraints = st.text_area(
            "Constraints (optional)",
            value=st.session_state.pm_constraints,
            placeholder="Any boundaries, limitations, or specific requirements.",
            height=68,
            key="input_constraints",
        )
    with col2:
        st.session_state.pm_output_format = st.text_area(
            "Output Format (optional)",
            value=st.session_state.pm_output_format,
            placeholder="e.g. Bullet points, numbered list, table, 3 paragraphs, under 200 words",
            height=68,
            key="input_format",
        )

    # Mode info expander
    mode_config = MODES[st.session_state.pm_mode]
    with st.expander(f"About {mode_config['display_name']} Mode"):
        st.markdown(f"**Tone:** {mode_config['tone']}")
        st.markdown(f"_{mode_config['system_preamble']}_")

    # Save as Template (Book Ch7 S2 — reusable prompt frameworks)
    with st.expander("Save as Reusable Template"):
        tpl_name = st.text_input(
            "Template Name",
            placeholder="e.g. 'API Critique Setup', 'Executive Summary Framework'",
            key="tpl_name_input",
        )
        tpl_hint = st.text_area(
            "Objective Hint (optional)",
            value=st.session_state.pm_objective,
            placeholder="Pre-fill text for the objective field when this template is loaded",
            height=68,
            key="tpl_hint_input",
        )
        if st.button("Save Template", use_container_width=True, key="save_template_btn"):
            if not tpl_name.strip():
                st.error("Template name is required.")
            else:
                template = PromptTemplate(
                    name=tpl_name.strip(),
                    mode=st.session_state.pm_mode,
                    audience=st.session_state.pm_audience,
                    constraints=st.session_state.pm_constraints.strip(),
                    output_format=st.session_state.pm_output_format.strip(),
                    objective_hint=tpl_hint.strip(),
                    custom_name=st.session_state.pm_custom_name if st.session_state.pm_mode == "custom" else "",
                    custom_preamble=st.session_state.pm_custom_preamble if st.session_state.pm_mode == "custom" else "",
                    custom_tone=st.session_state.pm_custom_tone if st.session_state.pm_mode == "custom" else "",
                )
                _template_store.save(template)
                st.toast(f"Template '{tpl_name.strip()}' saved!")
                st.rerun()

    if st.button("Assemble Prompt →", type="primary", use_container_width=True):
        if not st.session_state.pm_objective.strip():
            st.error("Objective is required.")
        else:
            inputs = PMInput(
                objective=st.session_state.pm_objective.strip(),
                audience=st.session_state.pm_audience,
                constraints=st.session_state.pm_constraints.strip(),
                output_format=st.session_state.pm_output_format.strip(),
                mode=st.session_state.pm_mode,
            )
            assembled = build_prompt(inputs)
            st.session_state.pm_assembled = assembled
            st.session_state.pm_prompt_edited = assembled.user_prompt
            st.session_state.pm_system_prompt = assembled.system_prompt
            st.session_state.pm_phase = "review"
            st.rerun()


# ============================================================================
# PHASE: REVIEW PROMPT
# ============================================================================

elif st.session_state.pm_phase == "review":
    st.markdown("### Step 2: Review & Edit Prompt")

    assembled = st.session_state.pm_assembled

    # System prompt (expandable, read-only)
    with st.expander("System Prompt (read-only)", expanded=False):
        st.code(st.session_state.pm_system_prompt, language=None)

    # Scaffolding toggle
    show_scaffolding = st.checkbox(
        "Show internal scaffolding",
        value=st.session_state.pm_show_scaffolding,
    )
    st.session_state.pm_show_scaffolding = show_scaffolding

    if show_scaffolding and assembled:
        with st.expander("Internal Scaffolding", expanded=True):
            st.code(assembled.scaffolding_notes, language=None)

    # Editable user prompt
    st.markdown("**User Prompt** (editable)")
    st.session_state.pm_prompt_edited = st.text_area(
        "User Prompt",
        value=st.session_state.pm_prompt_edited,
        height=200,
        label_visibility="collapsed",
        key="review_prompt",
    )

    col1, col2 = st.columns([1, 1])
    with col1:
        if st.button("← Back to Input", use_container_width=True):
            st.session_state.pm_phase = "input"
            st.rerun()
    with col2:
        if st.button("Execute →", type="primary", use_container_width=True):
            allowed, remaining = check_rate_limit()
            if not allowed:
                st.session_state.pm_error = f"Daily limit reached ({DAILY_ITERATION_LIMIT} iterations/day). Try again tomorrow."
                st.rerun()
            else:
                inputs = PMInput(
                    objective=st.session_state.pm_objective.strip(),
                    audience=st.session_state.pm_audience,
                    constraints=st.session_state.pm_constraints.strip(),
                    output_format=st.session_state.pm_output_format.strip(),
                    mode=st.session_state.pm_mode,
                )
                iteration_num = len(st.session_state.pm_iterations) + 1

                with st.spinner(f"Generating + Evaluating (Iteration {iteration_num})..."):
                    try:
                        async def _execute():
                            async with OpenRouterClient(model=st.session_state.pm_model) as client:
                                return await run_iteration(
                                    client=client,
                                    inputs=inputs,
                                    prompt_text=st.session_state.pm_prompt_edited,
                                    system_text=st.session_state.pm_system_prompt,
                                    iteration_number=iteration_num,
                                    model=st.session_state.pm_model,
                                )
                        iteration = run_async(_execute())
                        record_iteration()

                        st.session_state.pm_iterations.append(iteration)
                        st.session_state.pm_current_output = iteration.output
                        st.session_state.pm_current_eval = iteration.evaluation
                        st.session_state.pm_phase = "output"
                        st.rerun()
                    except OpenRouterError as e:
                        st.session_state.pm_error = f"LLM Error: {e}"
                        st.rerun()
                    except Exception as e:
                        st.session_state.pm_error = f"Error: {e}"
                        st.rerun()


# ============================================================================
# PHASE: OUTPUT + EVALUATION
# ============================================================================

elif st.session_state.pm_phase == "output":
    iteration_num = len(st.session_state.pm_iterations)
    st.markdown(f"### Step 3: Output & Evaluation (Iteration {iteration_num})")

    # Generated output
    st.markdown("**Generated Output:**")
    st.markdown(st.session_state.pm_current_output)

    st.divider()

    # Mode switch option (book Ch3 S12, Ch8 case study)
    mode_options = list(MODES.keys())
    mode_labels = [f"{MODES[m]['display_name']} — {MODES[m]['tagline']}" for m in mode_options]
    current_mode_idx = mode_options.index(st.session_state.pm_mode) if st.session_state.pm_mode in mode_options else 0
    new_mode_label = st.selectbox(
        "Mode for next iteration (switch mid-session)",
        mode_labels,
        index=current_mode_idx,
        key="output_mode_switch",
    )
    new_mode = mode_options[mode_labels.index(new_mode_label)]
    if new_mode != st.session_state.pm_mode:
        st.session_state.pm_mode = new_mode
        st.info(f"Mode switched to **{MODES[new_mode]['display_name']}**. This will apply to the next iteration.")

    # Evaluation scores
    evaluation = st.session_state.pm_current_eval
    if evaluation:
        render_evaluation(evaluation)

        st.divider()

        if evaluation.needs_realignment:
            st.warning(
                "**Realignment recommended.** "
                "Alignment is below Medium or Drift is above Medium."
            )

            col1, col2, col3 = st.columns([1, 1, 1])
            with col1:
                if st.button("Generate Realignment Prompt", type="primary", use_container_width=True):
                    inputs = PMInput(
                        objective=st.session_state.pm_objective.strip(),
                        audience=st.session_state.pm_audience,
                        constraints=st.session_state.pm_constraints.strip(),
                        output_format=st.session_state.pm_output_format.strip(),
                        mode=st.session_state.pm_mode,
                    )
                    # Rebuild system prompt in case mode was switched
                    assembled = build_prompt(inputs)
                    st.session_state.pm_system_prompt = assembled.system_prompt
                    with st.spinner("Generating realignment prompt..."):
                        try:
                            async def _realign():
                                async with OpenRouterClient(model=st.session_state.pm_model) as client:
                                    return await build_realignment_prompt(
                                        client=client,
                                        inputs=inputs,
                                        evaluation=evaluation,
                                        model=st.session_state.pm_model,
                                    )
                            realignment = run_async(_realign())

                            st.session_state.pm_realignment_prompt = realignment
                            st.session_state.pm_phase = "realign"
                            st.rerun()
                        except Exception as e:
                            st.session_state.pm_error = f"Error: {e}"
                            st.rerun()

            with col2:
                if st.button("Refine Prompt", use_container_width=True):
                    # Rebuild assembled prompt if mode was switched
                    inputs = PMInput(
                        objective=st.session_state.pm_objective.strip(),
                        audience=st.session_state.pm_audience,
                        constraints=st.session_state.pm_constraints.strip(),
                        output_format=st.session_state.pm_output_format.strip(),
                        mode=st.session_state.pm_mode,
                    )
                    assembled = build_prompt(inputs)
                    st.session_state.pm_assembled = assembled
                    st.session_state.pm_prompt_edited = assembled.user_prompt
                    st.session_state.pm_system_prompt = assembled.system_prompt
                    st.session_state.pm_phase = "input"
                    st.rerun()

            with col3:
                if st.button("Proceed Anyway →", use_container_width=True):
                    st.session_state.pm_finalized = True
                    st.session_state.pm_phase = "summary"
                    st.rerun()
        else:
            st.success("All scores acceptable. You can finalize the session.")
            col1, col2 = st.columns([1, 1])
            with col1:
                if st.button("Finalize Session →", type="primary", use_container_width=True):
                    st.session_state.pm_finalized = True
                    st.session_state.pm_phase = "summary"
                    st.rerun()
            with col2:
                if st.button("Refine Prompt", use_container_width=True):
                    # Rebuild assembled prompt if mode was switched
                    inputs = PMInput(
                        objective=st.session_state.pm_objective.strip(),
                        audience=st.session_state.pm_audience,
                        constraints=st.session_state.pm_constraints.strip(),
                        output_format=st.session_state.pm_output_format.strip(),
                        mode=st.session_state.pm_mode,
                    )
                    assembled = build_prompt(inputs)
                    st.session_state.pm_assembled = assembled
                    st.session_state.pm_prompt_edited = assembled.user_prompt
                    st.session_state.pm_system_prompt = assembled.system_prompt
                    st.session_state.pm_phase = "input"
                    st.rerun()

    # Download current output
    st.download_button(
        "Download Current Output (.txt)",
        data=st.session_state.pm_current_output or "",
        file_name=f"promptmaster_iteration_{iteration_num}.txt",
        mime="text/plain",
    )

    # Iteration history with trend indicators
    if len(st.session_state.pm_iterations) > 1:
        st.divider()
        with st.expander(f"Iteration History ({len(st.session_state.pm_iterations)} iterations)"):
            render_iteration_history(st.session_state.pm_iterations)

        with st.expander("Compare Iterations"):
            render_comparison(st.session_state.pm_iterations)


# ============================================================================
# PHASE: REALIGNMENT
# ============================================================================

elif st.session_state.pm_phase == "realign":
    st.markdown("### Step 4: Realignment")

    st.info(
        "The realignment prompt re-anchors your objective and includes a "
        "corrective instruction based on the evaluation. Edit as needed."
    )

    st.session_state.pm_realignment_prompt = st.text_area(
        "Realignment Prompt (editable)",
        value=st.session_state.pm_realignment_prompt or "",
        height=250,
        key="realign_prompt",
    )

    col1, col2 = st.columns([1, 1])
    with col1:
        if st.button("← Back to Output", use_container_width=True):
            st.session_state.pm_phase = "output"
            st.rerun()
    with col2:
        if st.button("Execute Realignment →", type="primary", use_container_width=True):
            allowed, remaining = check_rate_limit()
            if not allowed:
                st.session_state.pm_error = f"Daily limit reached ({DAILY_ITERATION_LIMIT} iterations/day). Try again tomorrow."
                st.rerun()
            else:
                inputs = PMInput(
                    objective=st.session_state.pm_objective.strip(),
                    audience=st.session_state.pm_audience,
                    constraints=st.session_state.pm_constraints.strip(),
                    output_format=st.session_state.pm_output_format.strip(),
                    mode=st.session_state.pm_mode,
                )
                iteration_num = len(st.session_state.pm_iterations) + 1

                with st.spinner(f"Re-generating + Evaluating (Iteration {iteration_num})..."):
                    try:
                        async def _execute_realigned():
                            async with OpenRouterClient(model=st.session_state.pm_model) as client:
                                return await run_iteration(
                                    client=client,
                                    inputs=inputs,
                                    prompt_text=st.session_state.pm_realignment_prompt,
                                    system_text=st.session_state.pm_system_prompt,
                                    iteration_number=iteration_num,
                                    model=st.session_state.pm_model,
                                )
                        iteration = run_async(_execute_realigned())
                        record_iteration()

                        st.session_state.pm_iterations.append(iteration)
                        st.session_state.pm_current_output = iteration.output
                        st.session_state.pm_current_eval = iteration.evaluation
                        st.session_state.pm_phase = "output"
                        st.rerun()
                    except OpenRouterError as e:
                        st.session_state.pm_error = f"LLM Error: {e}"
                        st.rerun()
                    except Exception as e:
                        st.session_state.pm_error = f"Error: {e}"
                        st.rerun()


# ============================================================================
# PHASE: SESSION SUMMARY
# ============================================================================

elif st.session_state.pm_phase == "summary":
    st.markdown("### Step 5: Session Summary")

    inputs = PMInput(
        objective=st.session_state.pm_objective.strip(),
        audience=st.session_state.pm_audience,
        constraints=st.session_state.pm_constraints.strip(),
        output_format=st.session_state.pm_output_format.strip(),
        mode=st.session_state.pm_mode,
    )

    # Final evaluation
    final_eval = st.session_state.pm_current_eval
    if final_eval:
        render_evaluation(final_eval)
        st.divider()

    # Summary stats
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Mode", inputs.mode.title())
    with col2:
        st.metric("Iterations", len(st.session_state.pm_iterations))
    with col3:
        if final_eval:
            st.metric("Alignment", final_eval.alignment.score)

    st.divider()

    # Final output
    st.markdown("**Final Output:**")
    st.markdown(st.session_state.pm_current_output)

    st.divider()

    # Export options
    summary_text = format_session_summary(inputs, st.session_state.pm_iterations)
    json_text = export_session_json(inputs, st.session_state.pm_iterations, model=st.session_state.pm_model)

    st.markdown("**Export Session:**")
    col1, col2 = st.columns(2)
    with col1:
        st.download_button(
            "Download Summary (.txt)",
            data=summary_text,
            file_name="promptmaster_session.txt",
            mime="text/plain",
            use_container_width=True,
        )
    with col2:
        st.download_button(
            "Download Session (.json)",
            data=json_text,
            file_name="promptmaster_session.json",
            mime="application/json",
            use_container_width=True,
        )

    with st.expander("Copyable Session Summary"):
        st.code(summary_text, language=None)

    # Save session config as reusable template
    with st.expander("Save as Reusable Template"):
        summary_tpl_name = st.text_input(
            "Template Name",
            placeholder="Name this template for reuse",
            key="summary_tpl_name",
        )
        if st.button("Save Template from This Session", use_container_width=True, key="summary_save_tpl"):
            if not summary_tpl_name.strip():
                st.error("Template name is required.")
            else:
                template = PromptTemplate(
                    name=summary_tpl_name.strip(),
                    mode=inputs.mode,
                    audience=inputs.audience,
                    constraints=inputs.constraints,
                    output_format=inputs.output_format,
                    objective_hint=inputs.objective,
                    custom_name=st.session_state.pm_custom_name if inputs.mode == "custom" else "",
                    custom_preamble=st.session_state.pm_custom_preamble if inputs.mode == "custom" else "",
                    custom_tone=st.session_state.pm_custom_tone if inputs.mode == "custom" else "",
                )
                _template_store.save(template)
                st.toast(f"Template '{summary_tpl_name.strip()}' saved!")
                st.rerun()

    # Iteration history with trends
    if len(st.session_state.pm_iterations) > 1:
        st.divider()
        st.markdown("**Iteration History:**")
        render_iteration_history(st.session_state.pm_iterations)

        with st.expander("Compare Iterations"):
            render_comparison(st.session_state.pm_iterations)

    # Auto-save session
    if not st.session_state.get("pm_session_saved"):
        session = Session(
            objective=inputs.objective,
            audience=inputs.audience,
            constraints=inputs.constraints,
            output_format=inputs.output_format,
            mode=inputs.mode,
            model=st.session_state.pm_model,
            iterations=st.session_state.pm_iterations,
            finalized=True,
        )
        _store.save(session)
        st.session_state.pm_session_saved = True
        st.toast("Session saved automatically.")

    # Self-Audit: Cold Critic on the entire session (Book Ch9)
    st.divider()
    st.markdown("**Self-Audit** _(Cold Critic on your prompting strategy)_")
    st.caption(
        "Invoke Cold Critic Mode to ruthlessly evaluate your prompting approach — "
        "not just the output, but your strategy, mode choices, and iteration process."
    )

    if st.session_state.pm_self_audit:
        st.markdown(st.session_state.pm_self_audit)
    else:
        if st.button("Run Self-Audit", use_container_width=True):
            with st.spinner("Running Cold Critic self-audit on your session..."):
                try:
                    async def _audit():
                        async with OpenRouterClient(model=st.session_state.pm_model) as client:
                            return await run_self_audit(
                                client=client,
                                inputs=inputs,
                                iterations=st.session_state.pm_iterations,
                                model=st.session_state.pm_model,
                            )
                    st.session_state.pm_self_audit = run_async(_audit())
                    st.rerun()
                except Exception as e:
                    st.session_state.pm_error = f"Self-audit error: {e}"
                    st.rerun()

    st.divider()
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 Start New Session", type="primary", use_container_width=True):
            reset_session()
            st.rerun()
    with col2:
        if st.button("Hard Reset (carry lessons forward)", use_container_width=True,
                      help="Summarize lessons from this session and start fresh with them as context"):
            with st.spinner("Summarizing lessons before reset..."):
                try:
                    async def _lessons():
                        async with OpenRouterClient(model=st.session_state.pm_model) as client:
                            return await generate_hard_reset_lessons(
                                client=client,
                                inputs=inputs,
                                iterations=st.session_state.pm_iterations,
                                model=st.session_state.pm_model,
                            )
                    lessons = run_async(_lessons())
                    prev_objective = st.session_state.pm_objective
                    reset_session()
                    st.session_state.pm_objective = prev_objective
                    st.session_state.pm_constraints = f"Lessons from previous session:\n{lessons}"
                    st.rerun()
                except Exception as e:
                    st.session_state.pm_error = f"Hard reset error: {e}"
                    st.rerun()
