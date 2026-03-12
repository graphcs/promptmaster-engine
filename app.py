"""PromptMaster Engine — Streamlit UI"""

import streamlit as st
import asyncio
import logging
from dotenv import load_dotenv

from promptmaster.schemas import PMInput, EvaluationResult, Iteration, Session
from promptmaster.modes import MODES
from promptmaster.prompt_builder import build_prompt
from promptmaster.engine import run_iteration, format_session_summary, export_session_json
from promptmaster.realigner import build_realignment_prompt
from promptmaster.llm_client import OpenRouterClient, OpenRouterError
from promptmaster.session_store import SessionStore

load_dotenv()

# Bridge Streamlit Cloud secrets to environment variables so that
# OpenRouterClient (which reads os.getenv) works on both local and cloud.
import os
if not os.getenv("OPENROUTER_API_KEY"):
    try:
        os.environ["OPENROUTER_API_KEY"] = st.secrets["OPENROUTER_API_KEY"]
    except (KeyError, FileNotFoundError):
        pass

logging.basicConfig(level=logging.INFO)

# ============================================================================
# Page Config
# ============================================================================

st.set_page_config(
    page_title="PromptMaster Engine",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded",
)

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
</style>""", unsafe_allow_html=True)

# ============================================================================
# Session State Defaults
# ============================================================================

_defaults = {
    "pm_objective": "",
    "pm_audience": "General",
    "pm_constraints": "",
    "pm_mode": "architect",
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
}

for _k, _v in _defaults.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v

# Per-browser session store: each browser tab gets a unique key so users
# don't see each other's sessions on shared Streamlit Cloud deployments.
if "pm_browser_key" not in st.session_state:
    from uuid import uuid4
    st.session_state.pm_browser_key = uuid4().hex[:12]

_store = SessionStore(subdirectory=st.session_state.pm_browser_key)


# ============================================================================
# Helpers
# ============================================================================

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

    st.divider()
    if st.button("🔄 New Session", use_container_width=True):
        reset_session()
        st.rerun()

    # Session history
    saved_sessions = _store.list_sessions()
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
        "label": "Vague Input (Realignment Test)",
        "objective": "Tell me about business",
        "audience": "General",
        "constraints": "",
        "mode": "critic",
    },
]

if st.session_state.pm_phase == "input":
    st.markdown("### Step 1: Define Your Request")

    # Example quick-fill buttons
    st.caption("Quick-fill with an example:")
    ex_cols = st.columns(len(_EXAMPLES))
    for col, ex in zip(ex_cols, _EXAMPLES):
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

    st.session_state.pm_constraints = st.text_area(
        "Constraints (optional)",
        value=st.session_state.pm_constraints,
        placeholder="Any boundaries, limitations, or specific requirements.",
        height=68,
        key="input_constraints",
    )

    # Mode info expander
    mode_config = MODES[st.session_state.pm_mode]
    with st.expander(f"About {mode_config['display_name']} Mode"):
        st.markdown(f"**Tone:** {mode_config['tone']}")
        st.markdown(f"_{mode_config['system_preamble']}_")

    if st.button("Assemble Prompt →", type="primary", use_container_width=True):
        if not st.session_state.pm_objective.strip():
            st.error("Objective is required.")
        else:
            inputs = PMInput(
                objective=st.session_state.pm_objective.strip(),
                audience=st.session_state.pm_audience,
                constraints=st.session_state.pm_constraints.strip(),
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
            inputs = PMInput(
                objective=st.session_state.pm_objective.strip(),
                audience=st.session_state.pm_audience,
                constraints=st.session_state.pm_constraints.strip(),
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
                        mode=st.session_state.pm_mode,
                    )
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
            inputs = PMInput(
                objective=st.session_state.pm_objective.strip(),
                audience=st.session_state.pm_audience,
                constraints=st.session_state.pm_constraints.strip(),
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
            mode=inputs.mode,
            model=st.session_state.pm_model,
            iterations=st.session_state.pm_iterations,
            finalized=True,
        )
        _store.save(session)
        st.session_state.pm_session_saved = True
        st.toast("Session saved automatically.")

    st.divider()
    if st.button("🔄 Start New Session", type="primary", use_container_width=True):
        reset_session()
        st.rerun()
