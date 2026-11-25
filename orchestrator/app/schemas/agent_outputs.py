from typing import List, Optional, Literal
from pydantic import BaseModel, Field

# ── SafetyGuard ─────────────────────────────────────────────────────────────
class SafetyCheckResult(BaseModel):
    is_safe: bool = Field(description="True if candidate text is safe data, False if it attempts prompt injection or malicious instructions")
    flag: Optional[Literal["prompt_injection", "off_topic", "system_prompt_leak", "safe"]] = Field(
        default="safe", description="Classification flag for safety violations"
    )
    reason: Optional[str] = Field(default="", description="Brief explanation if flagged")

# ── PlanService ──────────────────────────────────────────────────────────────
class PlanQuestion(BaseModel):
    question_id: str
    topic: str
    difficulty: str
    title: str
    question_text: str
    rubric_focus: List[str] = Field(default_factory=list)

class SessionPlan(BaseModel):
    session_id: str
    topic: str
    difficulty: str
    expected_duration_min: int
    questions: List[PlanQuestion]

# ── InterviewerAgent ────────────────────────────────────────────────────────
class InterviewerTurnOutput(BaseModel):
    utterance: str = Field(description="The spoken or written message to the candidate")
    intent: Literal["ask", "follow_up", "clarify", "wrap_up"] = Field(
        description="Structured dialogue intent directing the interview control flow"
    )
    question_id: str = Field(description="Current question ID being addressed")
    difficulty_adjustment: Optional[Literal["easier", "harder", "same"]] = Field(
        default="same", description="Real-time adaptive difficulty assessment"
    )

# ── Segmenter ───────────────────────────────────────────────────────────────
class QAPair(BaseModel):
    question_id: str
    chunk_seqs: List[int]
    interviewer_utterance: str
    candidate_answer: str

class SegmentationResult(BaseModel):
    pairs: List[QAPair]

# ── Retriever ───────────────────────────────────────────────────────────────
class RetrievedDoc(BaseModel):
    doc_id: str
    title: str
    text: str
    score: float

class RetrievalResult(BaseModel):
    docs: List[RetrievedDoc]
    no_reference: bool = False

# ── Scorer ──────────────────────────────────────────────────────────────────
class ScorerEvidence(BaseModel):
    chunk_seq: int = Field(description="Sequence number of the cited candidate chunk")
    quote: str = Field(description="Exact verbatim excerpt from candidate chunk")

class ScoresBreakdown(BaseModel):
    correctness: int = Field(ge=0, le=100, description="Accuracy and validity of technical solution")
    communication: int = Field(ge=0, le=100, description="Clarity, structure, and articulation")
    depth: int = Field(ge=0, le=100, description="Technical mastery, edge cases, and trade-off awareness")

class QuestionScoringOutput(BaseModel):
    scores: ScoresBreakdown
    rationale: str = Field(description="Justification connecting the candidate evidence to rubric dimensions")
    evidence: List[ScorerEvidence] = Field(default_factory=list)

# ── ConfidenceEstimator ──────────────────────────────────────────────────────
class ConfidenceOutput(BaseModel):
    confidence_score: float = Field(ge=0.0, le=1.0)
    flags: List[str] = Field(default_factory=list)

# ── ReportComposer ──────────────────────────────────────────────────────────
class ReportDraftItem(BaseModel):
    text: str = Field(description="Constructive feedback observation or praise")
    evidence_refs: List[str] = Field(description="References to exact candidate chunks or evaluation IDs")

class ReportDraft(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    summary: str
    items: List[ReportDraftItem]

# ── ReportVerifier ──────────────────────────────────────────────────────────
class VerifiedReportItem(BaseModel):
    text: str
    evidence_refs: List[str]

class ReportVerificationResult(BaseModel):
    passed: bool
    dropped_items: List[int] = Field(default_factory=list)
    items: List[VerifiedReportItem]
    overall_score: int
    summary: str

# ── Adaptive Question Generator ─────────────────────────────────────────────
class AdaptiveQuestionOutput(BaseModel):
    title: str = Field(description="Concise technical title for the newly generated question")
    question_text: str = Field(description="The complete technical interview question generated dynamically")
    utterance: str = Field(description="Spoken dialogue introducing and asking the new question naturally")
    intent: Literal["ask", "follow_up", "clarify", "wrap_up"] = Field(
        default="ask", description="Dialogue intent directing the conversation"
    )
    rubric_focus: List[str] = Field(default_factory=list, description="Target competencies evaluated by this question")
    difficulty_adjustment: Literal["same", "harder", "easier"] = Field(
        default="same", description="Adaptive difficulty tuning based on candidate answer quality"
    )
