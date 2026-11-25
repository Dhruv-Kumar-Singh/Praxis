import pytest
from app.schemas.agent_outputs import (
    ScorerEvidence,
    ScoresBreakdown,
    ReportDraft,
    ReportDraftItem,
    PlanQuestion,
)
from app.agents.plan_service import plan_service
from app.agents.segmenter import segmenter
from app.agents.retriever import retriever
from app.agents.evidence_checker import evidence_checker
from app.agents.confidence_estimator import confidence_estimator
from app.agents.report_verifier import report_verifier
from app.agents.safety_guard import safety_guard


@pytest.mark.asyncio
async def test_full_evaluation_flow():
    # 1. Generate plan
    plan = plan_service.build_plan(
        session_id="sess_e2e_1",
        topic="DSA",
        difficulty="medium",
        expected_duration_min=30,
    )
    assert len(plan.questions) >= 2
    q1 = plan.questions[0]
    assert q1.question_id is not None

    # 2. Simulate conversation chunks
    chunks = [
        {
            "seq": 1,
            "role": "interviewer",
            "questionId": q1.question_id,
            "text": q1.question_text,
        },
        {
            "seq": 2,
            "role": "candidate",
            "questionId": q1.question_id,
            "text": "I implemented an LRU cache with a doubly linked list and hash map for O(1) operations.",
            "sttConfidence": 0.95,
        },
    ]

    # 3. Test SafetyGuard on candidate turn
    safety, _ = await safety_guard.check_input(chunks[1]["text"], session_id="sess_e2e_1")
    assert safety.is_safe is True
    assert safety.flag == "safe"

    # 4. Segment conversation
    segmentation = segmenter.segment_chunks(chunks)
    assert len(segmentation.pairs) == 1
    pair = segmentation.pairs[0]
    assert pair.question_id == q1.question_id
    assert pair.chunk_seqs == [1, 2]

    # 5. RAG retrieval
    rag_result = await retriever.retrieve("LRU cache doubly linked list hash map", "DSA")
    assert len(rag_result.docs) >= 1
    assert rag_result.no_reference is False

    # 6. Verify substring evidence extraction (DETERMINISTIC guardrail)
    evidence_list = [
        ScorerEvidence(chunk_seq=2, quote="LRU cache with a doubly linked list"),
        ScorerEvidence(chunk_seq=2, quote="This fabricated claim never occurred"),
    ]
    candidate_chunks = [c for c in chunks if c["role"] == "candidate"]
    verified_evidence, dropped_quotes = evidence_checker.verify_evidence(evidence_list, candidate_chunks)

    assert len(verified_evidence) == 1
    assert "doubly linked list" in verified_evidence[0].quote
    assert len(dropped_quotes) == 1

    # 7. Confidence estimation
    scores = ScoresBreakdown(correctness=92, communication=90, depth=88)
    conf_output = confidence_estimator.estimate_confidence(
        scores=scores,
        candidate_chunks=candidate_chunks,
        retrieval_score=rag_result.docs[0].score,
    )
    assert conf_output.confidence_score > 0.70
    assert "LOW_CONFIDENCE" not in conf_output.flags

    # 8. Report Verifier validates evidenceRefs against stored evaluations
    draft = ReportDraft(
        overall_score=90,
        summary="Candidate showed strong understanding of LRU cache mechanics.",
        items=[
            ReportDraftItem(
                text="Correctly specified O(1) time complexity using doubly linked list and hash map.",
                evidence_refs=["chunk_2"],
            ),
            ReportDraftItem(
                text="Fabricated claim that was never evaluated.",
                evidence_refs=["chunk_999"],
            ),
        ],
    )

    valid_chunks = {1, 2}
    valid_questions = {q1.question_id}
    verified_report = report_verifier.verify(draft, valid_chunks, valid_questions)

    assert verified_report.passed is True
    assert len(verified_report.items) == 1
    assert verified_report.items[0].evidence_refs == ["chunk_2"]
    assert len(verified_report.dropped_items) == 1
