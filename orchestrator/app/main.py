import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, status, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.db.mongo import db_manager, utc_now, session_id_filter
from app.agents.plan_service import plan_service
from app.agents.interviewer_agent import interviewer_agent
from app.orchestration.turn_manager import turn_manager
from app.eval.eval_worker import eval_worker

logger = logging.getLogger("orchestrator_api")
logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect to MongoDB and start background eval worker loop
    await db_manager.connect()
    worker_task = asyncio.create_task(eval_worker.start())
    logger.info("Praxis Orchestrator FastAPI started successfully.")
    yield
    # Shutdown
    eval_worker.stop()
    worker_task.cancel()
    await db_manager.close()
    logger.info("Praxis Orchestrator FastAPI stopped.")

app = FastAPI(
    title="Praxis AI Orchestrator",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Internal Auth Dependency ────────────────────────────────────────────────
def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    if not x_internal_secret or x_internal_secret != settings.ORCHESTRATOR_INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Secret header."
        )

# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "praxis-orchestrator",
        "environment": settings.ENV,
        "primary_model": settings.PRIMARY_MODEL,
        "timestamp": utc_now().isoformat()
    }

# ── Internal Plan Generation API (called by Node POST /sessions) ─────────────
class PlanRequest(BaseModel):
    sessionId: str = "pending"
    topic: str
    difficulty: str = "medium"
    expectedDurationMin: int = 30

@app.post("/internal/sessions/plan", dependencies=[Depends(verify_internal_secret)])
async def create_session_plan(req: PlanRequest):
    """
    Builds a structured question plan and stores it on the session document in MongoDB.
    """
    try:
        plan = plan_service.build_plan(
            session_id=req.sessionId,
            topic=req.topic,
            difficulty=req.difficulty,
            expected_duration_min=req.expectedDurationMin
        )

        plan_dicts = [q.model_dump() for q in plan.questions]

        # Update session document with plan in MongoDB if an existing sessionId was provided
        if req.sessionId and req.sessionId != "pending":
            await db_manager.db.sessions.update_one(
                session_id_filter(req.sessionId),
                {"$set": {"plan": plan_dicts, "updatedAt": utc_now()}},
                upsert=False
            )

        return {"sessionId": req.sessionId, "plan": plan_dicts}
    except Exception as e:
        logger.error(f"Error creating session plan for {req.sessionId}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ── Internal Adaptive Question Generation API (OpenAI LLM) ─────────────────
class NextQuestionRequest(BaseModel):
    sessionId: str
    topic: str
    difficulty: str = "medium"
    previousQuestion: str
    candidateAnswer: str
    questionNumber: int = 1          # 1-based index of the answer being submitted
    history: Optional[list] = None

@app.post("/internal/sessions/{session_id}/next-question", dependencies=[Depends(verify_internal_secret)])
async def generate_adaptive_next_question(session_id: str, req: NextQuestionRequest):
    """
    Records the candidate's answer as a chunk (questionId = q{N}), calls OpenAI LLM to
    generate the next question, records the interviewer chunk (questionId = q{N+1}), and
    returns the structured next question so the frontend can display it immediately.
    """
    try:
        await turn_manager.restore_seq(session_id)
        answer_question_id  = f"q{req.questionNumber}"
        next_question_id    = f"q{req.questionNumber + 1}"

        # Ensure the question being answered also has an interviewer chunk recorded (e.g. Q1)
        if req.previousQuestion.strip():
            existing_q = await db_manager.db.interview_chunks.find_one({
                "sessionId": session_id,
                "questionId": answer_question_id,
                "role": "interviewer"
            })
            if not existing_q:
                await turn_manager.record_utterance(
                    session_id=session_id,
                    role="interviewer",
                    text=req.previousQuestion,
                    question_id=answer_question_id,
                    model_id="plan-init"
                )

        # 1. Persist candidate answer chunk with correct questionId
        await turn_manager.record_utterance(
            session_id=session_id,
            role="candidate",
            text=req.candidateAnswer,
            question_id=answer_question_id
        )

        # 2. Call OpenAI LLM to generate next question based on the candidate's answer
        output, stamp = await interviewer_agent.generate_adaptive_question(
            session_id=session_id,
            topic=req.topic,
            difficulty=req.difficulty,
            previous_question=req.previousQuestion,
            candidate_answer=req.candidateAnswer,
            recent_turns=req.history
        )

        # 3. Persist the new interviewer question chunk with the next questionId
        await turn_manager.record_utterance(
            session_id=session_id,
            role="interviewer",
            text=output.utterance or output.question_text,
            question_id=next_question_id,
            model_id=stamp.model_id
        )

        # 4. Append adaptive question to session.plan in MongoDB for future reference
        await db_manager.db.sessions.update_one(
            session_id_filter(session_id),
            {
                "$push": {
                    "plan": {
                        "question_id": next_question_id,
                        "topic": req.topic,
                        "difficulty": req.difficulty,
                        "title": output.title,
                        "question_text": output.question_text,
                        "rubric_focus": output.rubric_focus,
                    }
                },
                "$set": {"updatedAt": utc_now()}
            }
        )

        return {
            "sessionId": session_id,
            "questionId": next_question_id,
            "questionNumber": req.questionNumber + 1,
            "title": output.title,
            "question_text": output.question_text,
            "utterance": output.utterance,
            "intent": output.intent,
            "rubric_focus": output.rubric_focus,
            "difficulty_adjustment": output.difficulty_adjustment,
            "modelId": stamp.model_id
        }
    except Exception as e:
        logger.error(f"Error generating adaptive question for {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ── Internal Evaluation Enqueue API ──────────────────────────────────────────
class EnqueueEvalRequest(BaseModel):
    lastQuestion: Optional[str] = None
    candidateAnswer: Optional[str] = None
    questionNumber: int = 1

@app.post("/internal/sessions/{session_id}/enqueue-eval", dependencies=[Depends(verify_internal_secret)])
async def enqueue_session_evaluation(
    session_id: str,
    req: Optional[EnqueueEvalRequest] = Body(default=None)
):
    """
    Optionally flushes any final spoken/typed candidate answer chunk, ensures session status
    is 'processing', and enqueues the session for background evaluation processing.
    """
    try:
        # Flush final uncommitted turn if provided
        if req and req.candidateAnswer and req.candidateAnswer.strip():
            await turn_manager.restore_seq(session_id)
            q_id = f"q{req.questionNumber}"
            if req.lastQuestion and req.lastQuestion.strip():
                existing_q = await db_manager.db.interview_chunks.find_one({
                    "sessionId": session_id,
                    "questionId": q_id,
                    "role": "interviewer"
                })
                if not existing_q:
                    await turn_manager.record_utterance(
                        session_id=session_id,
                        role="interviewer",
                        text=req.lastQuestion,
                        question_id=q_id,
                        model_id="plan-init"
                    )
            await turn_manager.record_utterance(
                session_id=session_id,
                role="candidate",
                text=req.candidateAnswer,
                question_id=q_id
            )

        # Ensure session transitions to 'processing' so pipeline CAS transition to 'feedback_ready' succeeds
        session_doc = await db_manager.db.sessions.find_one(session_id_filter(session_id))
        if session_doc and session_doc.get("status") in ("in_progress", "scheduled", "draft"):
            await db_manager.atomic_status_transition(
                session_id=session_id,
                expected_status=session_doc["status"],
                new_status="processing",
                actor_id="orchestrator_api",
                note="Interview ended; enqueued for AI evaluation."
            )

        success = await db_manager.enqueue_eval_job(session_id)
        return {"status": "enqueued" if success else "failed", "sessionId": session_id}
    except Exception as e:
        logger.error(f"Error enqueuing eval for {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ── Internal Evaluation Status & Retry API ───────────────────────────────────
@app.get("/internal/sessions/{session_id}/eval-status", dependencies=[Depends(verify_internal_secret)])
async def get_eval_status(session_id: str):
    """Retrieves real-time evaluation job status and stage for UI polling."""
    job = await db_manager.db.eval_jobs.find_one({"sessionId": session_id})
    if not job:
        return {"sessionId": session_id, "status": "not_queued", "stage": None}
    
    return {
        "sessionId": session_id,
        "status": job.get("status"),
        "stage": job.get("stage"),
        "attempts": job.get("attempts", 0),
        "lastError": job.get("lastError")
    }

@app.post("/internal/sessions/{session_id}/retry-eval", dependencies=[Depends(verify_internal_secret)])
async def retry_eval_job(session_id: str):
    """Resets a failed evaluation job back to queued state."""
    job = await db_manager.db.eval_jobs.find_one({"sessionId": session_id})
    if not job:
        raise HTTPException(status_code=404, detail="No evaluation job found for this session.")
    
    await db_manager.db.eval_jobs.update_one(
        {"sessionId": session_id},
        {
            "$set": {
                "status": "queued",
                "nextAttemptAt": utc_now(),
                "lockedBy": None,
                "lockedUntil": None,
                "updatedAt": utc_now()
            }
        }
    )
    # Also reset session status to processing
    await db_manager.db.sessions.update_one(
        {"_id": session_id},
        {"$set": {"status": "processing", "updatedAt": utc_now()}}
    )
    return {"status": "requeued", "sessionId": session_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
