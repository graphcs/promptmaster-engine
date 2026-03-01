"""PromptMaster Engine — Streamlit UI"""

import streamlit as st
import asyncio
import logging
from dotenv import load_dotenv

from promptmaster.schemas import PMInput, EvaluationResult, Iteration
from promptmaster.modes import MODES
from promptmaster.prompt_builder import build_prompt
from promptmaster.engine import run_iteration, format_session_summary
from promptmaster.realigner import build_realignment_prompt
from promptmaster.llm_client import OpenRouterClient, OpenRouterError

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
}

for _k, _v in _defaults.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v


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

            col1, col2 = st.columns([1, 1])
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
                if st.button("Proceed Anyway →", use_container_width=True):
                    st.session_state.pm_finalized = True
                    st.session_state.pm_phase = "summary"
                    st.rerun()
        else:
            st.success("All scores acceptable. You can finalize the session.")
            if st.button("Finalize Session →", type="primary", use_container_width=True):
                st.session_state.pm_finalized = True
                st.session_state.pm_phase = "summary"
                st.rerun()

    # Iteration history
    if len(st.session_state.pm_iterations) > 1:
        st.divider()
        with st.expander(f"Iteration History ({len(st.session_state.pm_iterations)} iterations)"):
            for it in st.session_state.pm_iterations:
                st.markdown(f"**Iteration {it.iteration_number}** ({it.mode.title()} Mode)")
                if it.evaluation:
                    e = it.evaluation
                    st.markdown(
                        f"Alignment: {score_badge_html('Alignment', e.alignment.score)} | "
                        f"Drift: {score_badge_html('Drift', e.drift.score)} | "
                        f"Clarity: {score_badge_html('Clarity', e.clarity.score)}",
                        unsafe_allow_html=True,
                    )
                with st.expander(f"Output (Iteration {it.iteration_number})", expanded=False):
                    st.markdown(it.output)


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

    # Copyable summary
    summary_text = format_session_summary(inputs, st.session_state.pm_iterations)
    st.markdown("**Copyable Session Summary:**")
    st.code(summary_text, language=None)

    # Iteration history
    if len(st.session_state.pm_iterations) > 1:
        st.divider()
        st.markdown("**Iteration History:**")
        for it in st.session_state.pm_iterations:
            with st.expander(f"Iteration {it.iteration_number} ({it.mode.title()} Mode)"):
                if it.evaluation:
                    e = it.evaluation
                    st.markdown(
                        f"Alignment: {score_badge_html('Alignment', e.alignment.score)} | "
                        f"Drift: {score_badge_html('Drift', e.drift.score)} | "
                        f"Clarity: {score_badge_html('Clarity', e.clarity.score)}",
                        unsafe_allow_html=True,
                    )
                st.markdown(it.output)

    st.divider()
    if st.button("🔄 Start New Session", type="primary", use_container_width=True):
        reset_session()
        st.rerun()
