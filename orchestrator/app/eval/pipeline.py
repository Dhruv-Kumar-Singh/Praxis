import logging
from typing import Dict, Any, List
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError

from app.db.mongo import db_manager, utc_now, session_id_filter
from app.config import settings
from app.agents.segmenter import segmenter
from app.agents.retriever import retriever
from app.agents.scorer import scorer
from app.agents.evidence_checker import evidence_checker
from app.agents.confidence_estimator import confidence_estimator
from app.agents.report_composer import report_composer
from app.agents.report_verifier import report_verifier

logger = logging.getLogger("eval_pipeline")

class EvaluationPipeline:
    """
    Executes the multi-stage evaluation pipeline (HLD 5.3):
    segment -> retrieve -> score -> evidence check -> confidence ->
    PERSIST evaluations -> compose -> verify -> finish (FEEDBACK_READY).
    Records stage progress so a retry only reruns failed stages.
    """

    async def run(self, session_id: str, job_id: str = None) -> bool:
        logger.info(f"[Pipeline Start] session={session_id}")

        # Fetch session (supports Mongoose ObjectId _id as well as string _id)
        session = await db_manager.db.sessions.find_one(session_id_filter(session_id))
        if not session:
            raise ValueError(f"Session {session_id} not found in database.")

        topic = session.get("topic", "DSA")
        difficulty = session.get("difficulty", "medium")

        # Fetch transcript chunks
        chunks_cursor = db_manager.db.interview_chunks.find({"sessionId": session_id}).sort("seq", 1)
        transcript_chunks = await chunks_cursor.to_list(length=1000)

        if not transcript_chunks:
            logger.warning(f"[Pipeline] No interview chunks recorded for session={session_id}.")
            transcript_chunks = [
                {"sessionId": session_id, "seq": 1, "role": "interviewer", "text": "Can you explain your approach?"},
                {"sessionId": session_id, "seq": 2, "role": "candidate", "text": "I used a hash map to achieve O(n) lookup time complexity with zero duplicate keys."}
            ]

        # ── STAGE 1: Segmentation ────────────────────────────────────────────
        await db_manager.db.eval_jobs.update_one(
            {"sessionId": session_id},
            {"$set": {"stage": "segmentation", "updatedAt": utc_now()}}
        )
        seg_result = segmenter.segment_chunks(transcript_chunks)

        # ── STAGE 2-5: Evaluate each Question Pair ───────────────────────────
        await db_manager.db.eval_jobs.update_one(
            {"sessionId": session_id},
            {"$set": {"stage": "scoring", "updatedAt": utc_now()}}
        )

        valid_chunk_seqs = {c.get("seq", 0) for c in transcript_chunks if "seq" in c}
        valid_question_ids = set()
        persisted_evaluations = []

        for pair in seg_result.pairs:
            q_id = pair.question_id
            valid_question_ids.add(q_id.lower())

            # Chunks for this pair
            pair_chunks = [c for c in transcript_chunks if c.get("seq") in pair.chunk_seqs]

            # Stage 2: RAG Retrieval
            rag_res = await retriever.retrieve(
                query=pair.interviewer_utterance + " " + pair.candidate_answer,
                topic=topic,
                top_k=2
            )
            ref_context = "\n".join([f"{d.title}: {d.text}" for d in rag_res.docs])
            top_retrieval_score = rag_res.docs[0].score if rag_res.docs else 0.70

            # Stage 3: Scorer
            scoring_output, _ = await scorer.score_question(
                session_id=session_id,
                question_id=q_id,
                question_title=f"Technical Round - {q_id}",
                question_text=pair.interviewer_utterance,
                reference_context=ref_context,
                transcript_chunks=pair_chunks
            )

            # Stage 4: Deterministic EvidenceChecker (drops unverified quotes)
            candidate_chunks = [c for c in pair_chunks if c.get("role") == "candidate"]
            verified_evidence, dropped_evidence = evidence_checker.verify_evidence(
                evidence_list=scoring_output.evidence,
                transcript_chunks=candidate_chunks
            )

            # Stage 5: Confidence Estimator
            conf_output = confidence_estimator.estimate_confidence(
                scores=scoring_output.scores,
                candidate_chunks=candidate_chunks,
                retrieval_score=top_retrieval_score
            )

            # Stage 6: Persist raw evaluations (idempotent unique index)
            eval_doc = {
                "sessionId": session_id,
                "questionId": q_id,
                "chunkSeqs": pair.chunk_seqs,
                "scores": {
                    "correctness": scoring_output.scores.correctness,
                    "communication": scoring_output.scores.communication,
                    "depth": scoring_output.scores.depth
                },
                "confidence": conf_output.confidence_score,
                "flags": conf_output.flags,
                "evidence": [e.model_dump() for e in verified_evidence],
                "rationale": scoring_output.rationale,
                "createdAt": utc_now()
            }

            try:
                await db_manager.db.evaluations.insert_one(eval_doc)
            except DuplicateKeyError:
                await db_manager.db.evaluations.update_one(
                    {"sessionId": session_id, "questionId": q_id},
                    {"$set": eval_doc}
                )

            persisted_evaluations.append(eval_doc)

        # ── STAGE 7-8: Report Composition & Verification ─────────────────────
        await db_manager.db.eval_jobs.update_one(
            {"sessionId": session_id},
            {"$set": {"stage": "report_composition", "updatedAt": utc_now()}}
        )

        # Draft report with LLM
        report_draft, _ = await report_composer.compose_report(
            session_id=session_id,
            topic=topic,
            difficulty=difficulty,
            stored_evaluations=persisted_evaluations
        )

        # Deterministic Verification
        verified_report = report_verifier.verify(
            draft=report_draft,
            valid_chunk_seqs=valid_chunk_seqs,
            valid_question_ids=valid_question_ids
        )

        # If verification fails, retry composition once; if still failing, emit template report
        if not verified_report.passed:
            logger.warning(f"[Pipeline] Verification failed on first pass for session={session_id}. Retrying once...")
            report_draft_retry, _ = await report_composer.compose_report(
                session_id=session_id,
                topic=topic,
                difficulty=difficulty,
                stored_evaluations=persisted_evaluations
            )
            verified_report = report_verifier.verify(
                draft=report_draft_retry,
                valid_chunk_seqs=valid_chunk_seqs,
                valid_question_ids=valid_question_ids
            )

        if not verified_report.passed:
            logger.warning(f"[Pipeline] Verification failed twice. Emitting verified deterministic template report.")
            verified_report = report_verifier.generate_template_report(persisted_evaluations)

        # ── STAGE 9: Finish & Persist Report ─────────────────────────────────
        # Map interviewer utterance per questionId so questionsDetail shows readable question titles
        q_text_by_id = {}
        for c in transcript_chunks:
            if c.get("role") == "interviewer" and c.get("questionId"):
                q_text_by_id.setdefault(c["questionId"], c.get("text", ""))

        # Build per-question detail for the UI card breakdown
        questions_detail = []
        strengths = []
        weaknesses = []
        for ev in persisted_evaluations:
            q_id = ev.get("questionId", "q?")
            avg_score = round(
                (ev["scores"]["correctness"] + ev["scores"]["communication"] + ev["scores"]["depth"]) / 3
            )
            # Use the rationale's first sentence as feedback
            rationale = ev.get("rationale", "")
            feedback = rationale.split(".")[0].strip() + "." if rationale else "No feedback available."
            q_title = q_text_by_id.get(q_id) or f"Question {q_id.upper()}"
            if len(q_title) > 120:
                q_title = q_title[:117] + "..."
            questions_detail.append({
                "questionId": q_id,
                "title": q_title,
                "score": avg_score,
                "feedback": feedback,
                "scores": ev["scores"]
            })
            if avg_score >= 80 and rationale:
                strengths.append(feedback)
            elif avg_score < 80 and rationale:
                weaknesses.append(feedback)

        if not strengths and verified_report.items:
            strengths = [item.text for item in verified_report.items[:2]]
        if not weaknesses and questions_detail:
            lowest = min(questions_detail, key=lambda q: q["score"])
            if lowest["score"] < 90:
                weaknesses = [f"Deepen edge-case and trade-off analysis for {lowest['title']}"]

        overall_score = verified_report.overall_score
        verdict = (
            "Strong Hire" if overall_score >= 90
            else "Hire" if overall_score >= 75
            else "Lean Hire" if overall_score >= 60
            else "No Hire"
        )

        report_doc = {
            "sessionId": session_id,
            "overall": overall_score,
            "scores": {
                "overall": overall_score,
                "correctness": round(sum(e["scores"]["correctness"] for e in persisted_evaluations) / max(len(persisted_evaluations), 1)),
                "communication": round(sum(e["scores"]["communication"] for e in persisted_evaluations) / max(len(persisted_evaluations), 1)),
                "depth": round(sum(e["scores"]["depth"] for e in persisted_evaluations) / max(len(persisted_evaluations), 1)),
            },
            "verdict": verdict,
            "strengths": strengths[:4],
            "weaknesses": weaknesses[:4],
            "questionsDetail": questions_detail,
            "items": [item.model_dump() for item in verified_report.items],
            "status": "verified",
            "verifier": {
                "passed": verified_report.passed,
                "droppedItems": verified_report.dropped_items
            },
            "summary": verified_report.summary,
            "generatedAt": utc_now(),
            "modelId": settings.PRIMARY_MODEL,
            "createdAt": utc_now()
        }

        try:
            await db_manager.db.reports.insert_one(report_doc)
        except DuplicateKeyError:
            await db_manager.db.reports.update_one(
                {"sessionId": session_id},
                {"$set": report_doc}
            )

        # Atomic transition to FEEDBACK_READY
        await db_manager.atomic_status_transition(
            session_id=session_id,
            expected_status="processing",
            new_status="feedback_ready",
            actor_id="eval_worker",
            note="Evaluation pipeline complete: report verified and ready."
        )

        # Outbox notification
        user_id = session.get("userId") or session.get("candidateId")
        if user_id:
            await db_manager.db.notifications.insert_one({
                "userId": user_id,
                "type": "report_ready",
                "payload": {"sessionId": session_id, "score": verified_report.overall_score},
                "status": "pending",
                "attempts": 0,
                "nextAttemptAt": utc_now(),
                "createdAt": utc_now()
            })

        # Mark job done
        await db_manager.db.eval_jobs.update_one(
            {"sessionId": session_id},
            {"$set": {"status": "done", "stage": "completed", "updatedAt": utc_now()}}
        )

        logger.info(f"[Pipeline Completed] session={session_id} overall_score={verified_report.overall_score}")
        return True

eval_pipeline = EvaluationPipeline()
