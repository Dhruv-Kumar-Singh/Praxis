import os
import sys
import asyncio
import logging
from typing import Optional, Dict, Any

# Ensure orchestrator root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    AgentSession,
    Agent,
)
from livekit.plugins import openai, silero

from app.config import settings
from app.db.mongo import db_manager
from app.orchestration.turn_manager import turn_manager
from app.orchestration.session_manager import session_manager
from app.agents.safety_guard import safety_guard
from app.agents.interviewer_agent import interviewer_agent
from app.schemas.agent_outputs import PlanQuestion

logger = logging.getLogger("livekit_worker")
logging.basicConfig(level=logging.INFO)

async def entrypoint(ctx: JobContext):
    """
    Entrypoint for LiveKit Agent dispatched to an interview room.
    Room name pattern: 'interview-{sessionId}'
    """
    await db_manager.connect()

    room_name = ctx.room.name or ""
    logger.info(f"[LiveKit Worker] Received dispatch for room='{room_name}'")

    if not room_name.startswith("interview-"):
        logger.error(f"[LiveKit Worker] Rejecting unrecognized room '{room_name}'. Expected 'interview-{{sessionId}}'")
        return

    session_id = room_name.replace("interview-", "").strip()

    # Verify session exists in MongoDB
    session = await db_manager.db.sessions.find_one({"_id": session_id})
    if not session:
        session = await db_manager.db.sessions.find_one({"id": session_id})

    if not session:
        logger.error(f"[LiveKit Worker] Session {session_id} not found in database. Exiting.")
        return

    current_status = session.get("status", "created").lower()
    if current_status not in ["scheduled", "in_progress"]:
        logger.error(f"[LiveKit Worker] Session {session_id} is in invalid status '{current_status}'. Must be scheduled or in_progress.")
        return

    # Acquire distributed lease lock
    worker_id = f"lk_worker_{ctx.room.name}"
    if not session_manager.acquire_lock(session_id, worker_id):
        logger.warning(f"[LiveKit Worker] Could not acquire lease for session={session_id}. Exiting.")
        return

    # Restore sequence counter and prior turns if reconnecting
    await turn_manager.restore_seq(session_id)
    recent_turns = await turn_manager.get_context(session_id, last_n=6)

    # Load session plan
    plan_data = session.get("plan", [])
    topic = session.get("topic", "DSA")
    difficulty = session.get("difficulty", "medium")

    plan_questions = []
    for p in plan_data:
        plan_questions.append(
            PlanQuestion(
                question_id=p.get("question_id", "q1"),
                topic=p.get("topic", topic),
                difficulty=p.get("difficulty", difficulty),
                title=p.get("title", "Technical Problem"),
                question_text=p.get("question_text", "Explain your solution approach."),
                rubric_focus=p.get("rubric_focus", [])
            )
        )
    if not plan_questions:
        plan_questions = [
            PlanQuestion(
                question_id="q_default",
                topic=topic,
                difficulty=difficulty,
                title=f"{topic} Fundamental Architecture",
                question_text="Could you walk me through your high-level approach and key algorithmic trade-offs?",
                rubric_focus=["Correctness", "System Complexity", "Edge Cases"]
            )
        ]

    # Connect to room with audio subscription
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info(f"[LiveKit Worker] Connected to room {room_name}. Waiting for candidate...")

    # Wait for candidate participant to arrive
    participant = await ctx.wait_for_participant()
    logger.info(f"[LiveKit Worker] Candidate joined: identity='{participant.identity}'")

    # Atomic transition: SCHEDULED -> IN_PROGRESS
    if current_status == "scheduled":
        await session_manager.transition_to_in_progress(session_id, worker_id)

    # Initialize LiveKit AgentSession with Silero VAD, OpenAI Whisper STT, OpenAI TTS
    stt = openai.STT(api_key=settings.OPENAI_API_KEY)
    tts = openai.TTS(api_key=settings.OPENAI_API_KEY, model="tts-1")
    vad = silero.VAD.load()

    session = AgentSession(
        stt=stt,
        tts=tts,
        vad=vad,
        allow_interruptions=True
    )

    current_question_idx = 0
    last_interviewer_chunk_seq = None

    # Handle interruptions: mark prior interviewer chunk as truncated
    @session.on("interrupted")
    def on_interrupted():
        nonlocal last_interviewer_chunk_seq
        if last_interviewer_chunk_seq is not None:
            logger.info(f"[Interruption] Candidate interrupted turn seq={last_interviewer_chunk_seq}. Stamping truncated=True.")
            asyncio.create_task(
                db_manager.db.interview_chunks.update_one(
                    {"sessionId": session_id, "seq": last_interviewer_chunk_seq},
                    {"$set": {"truncated": True}}
                )
            )

    # Start the LiveKit session loop
    await session.start(room=ctx.room)

    # Initial greeting turn
    active_q = plan_questions[min(current_question_idx, len(plan_questions) - 1)]
    first_turn_output, stamp = await interviewer_agent.generate_turn(
        session_id=session_id,
        topic=topic,
        difficulty=difficulty,
        current_question=active_q,
        plan_questions=plan_questions,
        recent_turns=recent_turns,
        candidate_utterance="",
        is_first_turn=True
    )

    # Record interviewer opening turn
    interviewer_chunk = await turn_manager.record_utterance(
        session_id=session_id,
        role="interviewer",
        text=first_turn_output.utterance,
        question_id=active_q.question_id,
        model_id=stamp.model_id
    )
    last_interviewer_chunk_seq = interviewer_chunk.get("seq")

    # Speak opening question
    await session.say(first_turn_output.utterance)

    # Event handler for incoming candidate transcription
    @session.on("user_speech_committed")
    async def on_user_speech(msg):
        nonlocal current_question_idx, last_interviewer_chunk_seq
        candidate_text = msg.content if hasattr(msg, "content") else str(msg)
        if not candidate_text.strip():
            return

        logger.info(f"[Candidate Input] session={session_id}: '{candidate_text[:60]}...'")

        # 1. SafetyGuard check: treats candidate speech strictly as DATA
        safety_res, _ = await safety_guard.check_input(candidate_text, session_id=session_id)
        if not safety_res.is_safe:
            logger.warning(f"[SafetyGuard Flagged] session={session_id} flag={safety_res.flag}")
            warning_reply = (
                "Let's stay focused on the technical problem at hand. "
                "Could you walk me through your engineering design or algorithm logic?"
            )
            await turn_manager.record_utterance(
                session_id=session_id,
                role="candidate",
                text=candidate_text,
                question_id=plan_questions[min(current_question_idx, len(plan_questions) - 1)].question_id
            )
            interviewer_chunk = await turn_manager.record_utterance(
                session_id=session_id,
                role="interviewer",
                text=warning_reply,
                question_id=plan_questions[min(current_question_idx, len(plan_questions) - 1)].question_id
            )
            last_interviewer_chunk_seq = interviewer_chunk.get("seq")
            await session.say(warning_reply)
            return

        # 2. Record clean candidate utterance
        active_q = plan_questions[min(current_question_idx, len(plan_questions) - 1)]
        await turn_manager.record_utterance(
            session_id=session_id,
            role="candidate",
            text=candidate_text,
            question_id=active_q.question_id
        )

        # 3. Retrieve conversation history
        history = await turn_manager.get_context(session_id, last_n=6)

        # 4. Generate next structured interviewer turn
        turn_output, stamp = await interviewer_agent.generate_turn(
            session_id=session_id,
            topic=topic,
            difficulty=difficulty,
            current_question=active_q,
            plan_questions=plan_questions,
            recent_turns=history,
            candidate_utterance=candidate_text,
            is_first_turn=False
        )

        # Handle wrap-up intent
        if turn_output.intent == "wrap_up":
            if current_question_idx < len(plan_questions) - 1:
                # Progress to next question in plan
                current_question_idx += 1
                active_q = plan_questions[current_question_idx]
                turn_output.utterance = (
                    f"Great discussion on this topic. Let's move on to our next question: {active_q.title}. "
                    f"{active_q.question_text}"
                )

        # Record interviewer utterance
        interviewer_chunk = await turn_manager.record_utterance(
            session_id=session_id,
            role="interviewer",
            text=turn_output.utterance,
            question_id=active_q.question_id,
            model_id=stamp.model_id
        )
        last_interviewer_chunk_seq = interviewer_chunk.get("seq")

        # Speak interviewer turn
        await session.say(turn_output.utterance)

    # Run heartbeat loop until room disconnect
    try:
        while ctx.room.connection_state == "connected":
            session_manager.renew_heartbeat(session_id, worker_id)
            await asyncio.sleep(10.0)
    except Exception as e:
        logger.info(f"[LiveKit Worker] Room session ended: {e}")
    finally:
        session_manager.release_lock(session_id, worker_id)
        # Interview concluded: transition IN_PROGRESS -> PROCESSING and enqueue eval job
        await session_manager.transition_to_processing(session_id, worker_id)
        logger.info(f"[LiveKit Worker] Closed room session={session_id}. Eval job queued.")

if __name__ == "__main__":
    # Explicit agent name dispatch: praxis-interviewer
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="praxis-interviewer",
            ws_url=settings.LIVEKIT_URL,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET
        )
    )
