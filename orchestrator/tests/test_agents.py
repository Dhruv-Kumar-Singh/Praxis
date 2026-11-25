import pytest
from app.schemas.agent_outputs import (
    ScorerEvidence,
    ScoresBreakdown,
    ReportDraft,
    ReportDraftItem,
    PlanQuestion
)
from app.agents.evidence_checker import evidence_checker, normalize_text
from app.agents.report_verifier import report_verifier
from app.agents.confidence_estimator import confidence_estimator
from app.agents.plan_service import plan_service
from app.agents.segmenter import segmenter
from app.orchestration.turn_manager import TurnManager

# ── 1. EvidenceChecker Tests (DETERMINISTIC GUARDRAIL) ───────────────────────
def test_normalize_text():
    raw = "Hash Map, with O(1)   lookup!!"
    assert normalize_text(raw) == "hash map with o 1 lookup"

def test_evidence_checker_drops_unverified_quote():
    candidate_chunks = [
        {"seq": 2, "text": "I utilized a hash map to achieve O(1) lookup time complexity with zero duplicate keys."}
    ]
    evidence_list = [
        # Valid quote
        ScorerEvidence(chunk_seq=2, quote="hash map to achieve O(1) lookup"),
        # Fabricated quote not in chunk
        ScorerEvidence(chunk_seq=2, quote="I also implemented a distributed B-tree index in C++"),
        # Invalid chunk sequence
        ScorerEvidence(chunk_seq=99, quote="some other text")
    ]

    verified, dropped = evidence_checker.verify_evidence(evidence_list, candidate_chunks)
    assert len(verified) == 1
    assert verified[0].chunk_seq == 2
    assert "hash map" in verified[0].quote
    assert len(dropped) == 2

# ── 2. ReportVerifier Tests (DETERMINISTIC GUARDRAIL) ────────────────────────
def test_report_verifier_validates_and_drops():
    draft = ReportDraft(
        overall_score=85,
        summary="Good technical answers",
        items=[
            ReportDraftItem(text="Clean hash table analysis.", evidence_refs=["chunk_2"]),
            ReportDraftItem(text="Uncited claim with bogus ref.", evidence_refs=["chunk_999"]),
            ReportDraftItem(text="Completely uncited claim.", evidence_refs=[])
        ]
    )

    valid_chunks = {1, 2, 3}
    valid_questions = {"q1", "q2"}

    result = report_verifier.verify(draft, valid_chunks, valid_questions)
    assert len(result.items) == 1
    assert result.items[0].evidence_refs == ["chunk_2"]
    assert len(result.dropped_items) == 2

def test_report_verifier_template_fallback():
    stored_evaluations = [
        {
            "questionId": "q_dsa_1",
            "scores": {"correctness": 90, "communication": 85, "depth": 80},
            "rationale": "Strong algorithmic trade-off understanding.",
            "evidence": [{"chunk_seq": 2, "quote": "used a hash map"}]
        }
    ]
    template = report_verifier.generate_template_report(stored_evaluations)
    assert template.passed is True
    assert len(template.items) == 1
    assert template.overall_score == 85
    assert "chunk_2" in template.items[0].evidence_refs

# ── 3. ConfidenceEstimator Tests ────────────────────────────────────────────
def test_confidence_estimator_flags_low_confidence():
    scores = ScoresBreakdown(correctness=95, communication=40, depth=90)
    candidate_chunks = [{"seq": 1, "sttConfidence": 0.45}]

    output = confidence_estimator.estimate_confidence(
        scores=scores,
        candidate_chunks=candidate_chunks,
        retrieval_score=0.40
    )
    assert "LOW_STT_CONFIDENCE" in output.flags
    assert "LOW_RETRIEVAL_ALIGNMENT" in output.flags
    assert "HIGH_SCORE_DIVERGENCE" in output.flags
    assert "LOW_CONFIDENCE" in output.flags
    assert output.confidence_score < 0.65

# ── 4. PlanService Tests ────────────────────────────────────────────────────
def test_plan_service_builds_correct_structure():
    plan = plan_service.build_plan(
        session_id="test_sess_123",
        topic="DSA",
        difficulty="medium",
        expected_duration_min=45
    )
    assert plan.session_id == "test_sess_123"
    assert plan.topic == "DSA"
    assert len(plan.questions) == 3
    assert all(isinstance(q, PlanQuestion) for q in plan.questions)

# ── 5. Segmenter Tests ──────────────────────────────────────────────────────
def test_segmenter_groups_by_question():
    chunks = [
        {"seq": 1, "questionId": "q1", "role": "interviewer", "text": "What is an LRU cache?"},
        {"seq": 2, "questionId": "q1", "role": "candidate", "text": "It uses a hash map and linked list."},
        {"seq": 3, "questionId": "q2", "role": "interviewer", "text": "How do you reverse a list?"},
        {"seq": 4, "questionId": "q2", "role": "candidate", "text": "Iteratively with three pointers."}
    ]
    result = segmenter.segment_chunks(chunks)
    assert len(result.pairs) == 2
    assert result.pairs[0].question_id == "q1"
    assert result.pairs[0].chunk_seqs == [1, 2]
    assert result.pairs[1].question_id == "q2"
    assert result.pairs[1].chunk_seqs == [3, 4]

# ── 6. TurnManager Tests ────────────────────────────────────────────────────
def test_turn_manager_sequence_increment():
    tm = TurnManager()
    assert tm.get_next_seq("s1") == 1
    assert tm.get_next_seq("s1") == 2
    assert tm.get_next_seq("s2") == 1
    assert tm.get_next_seq("s1") == 3
