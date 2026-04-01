"""Data contracts for PromptMaster Engine."""

from typing import Literal
from datetime import datetime, timezone
from uuid import uuid4
from pydantic import BaseModel, Field

ModeType = Literal["architect", "critic", "clarity", "coach", "therapist", "cold_critic", "analyst", "custom"]
ScoreLevel = Literal["Low", "Medium", "High"]


class PMInput(BaseModel):
    """User inputs for a PromptMaster session."""
    objective: str = Field(..., description="What the user wants to accomplish")
    audience: str = Field(default="General", description="Target audience")
    constraints: str = Field(default="", description="Optional constraints")
    output_format: str = Field(default="", description="Desired output structure (e.g. bullet points, numbered list)")
    mode: ModeType = Field(..., description="Selected operational mode")
    # Custom mode fields (only used when mode == 'custom')
    custom_name: str = Field(default="", description="Custom mode persona name")
    custom_preamble: str = Field(default="", description="Custom mode system preamble")
    custom_tone: str = Field(default="", description="Custom mode tone")


class AssembledPrompt(BaseModel):
    """Fully assembled prompt ready for LLM execution."""
    system_prompt: str = Field(..., description="System prompt with mode lock + scaffolding")
    user_prompt: str = Field(..., description="User-facing prompt with objective + context")
    scaffolding_notes: str = Field(default="", description="Internal scaffolding (hidden by default)")


class DimensionScore(BaseModel):
    """Score for a single evaluation dimension."""
    score: ScoreLevel = Field(..., description="Low, Medium, or High")
    explanation: str = Field(default="", description="One-sentence explanation")


class EvaluationResult(BaseModel):
    """Result from the evaluator LLM call."""
    alignment: DimensionScore = Field(..., description="Does output match the stated objective?")
    drift: DimensionScore = Field(..., description="Does output introduce irrelevant content?")
    clarity: DimensionScore = Field(..., description="Is the output structured and unambiguous?")

    @property
    def needs_realignment(self) -> bool:
        """Realignment triggers if Alignment < Medium OR Drift > Medium."""
        return self.alignment.score == "Low" or self.drift.score == "High"


class Iteration(BaseModel):
    """Record of a single generate-evaluate cycle."""
    iteration_number: int = Field(..., ge=1)
    prompt_sent: str = Field(..., description="The prompt text sent to LLM")
    system_prompt_used: str = Field(default="", description="System prompt used")
    output: str = Field(..., description="LLM response text")
    mode: ModeType = Field(...)
    evaluation: EvaluationResult | None = Field(default=None)


class PromptTemplate(BaseModel):
    """A reusable prompt template (Book Ch7 S2)."""
    template_id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str = Field(..., description="User-friendly template name")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    mode: ModeType = Field(...)
    audience: str = Field(default="General")
    constraints: str = Field(default="")
    output_format: str = Field(default="")
    objective_hint: str = Field(default="", description="Optional objective template/placeholder text")
    # Custom mode fields (only used when mode == 'custom')
    custom_name: str = Field(default="")
    custom_preamble: str = Field(default="")
    custom_tone: str = Field(default="")


class Session(BaseModel):
    """A complete PromptMaster session for persistence."""
    session_id: str = Field(default_factory=lambda: uuid4().hex[:8])
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    objective: str
    audience: str = "General"
    constraints: str = ""
    output_format: str = ""
    mode: ModeType
    model: str = ""
    iterations: list[Iteration] = Field(default_factory=list)
    finalized: bool = False
