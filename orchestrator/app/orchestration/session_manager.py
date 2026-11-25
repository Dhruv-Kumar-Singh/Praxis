import time
import asyncio
import logging
from typing import Dict, Any, Optional
from app.db.mongo import db_manager
from app.config import settings

logger = logging.getLogger("session_manager")

class SessionManager:
    """
    Manages session lifecycle, distributed lease locks, and atomic transitions:
    SCHEDULED -> IN_PROGRESS -> PROCESSING -> FEEDBACK_READY / PROCESSING_FAILED
    """
    def __init__(self):
        # In-memory distributed lock table: { session_id: { "locked_by": worker_id, "expires_at": float } }
        self._locks: Dict[str, Dict[str, Any]] = {}
        self.lock_ttl_sec = 30.0

    def acquire_lock(self, session_id: str, worker_id: str) -> bool:
        now = time.time()
        current_lock = self._locks.get(session_id)
        if current_lock and current_lock["expires_at"] > now and current_lock["locked_by"] != worker_id:
            logger.warning(f"[Lock Conflict] session={session_id} already locked by {current_lock['locked_by']}")
            return False

        self._locks[session_id] = {
            "locked_by": worker_id,
            "expires_at": now + self.lock_ttl_sec
        }
        logger.info(f"[Lock Acquired] session={session_id} lease={self.lock_ttl_sec}s by {worker_id}")
        return True

    def renew_heartbeat(self, session_id: str, worker_id: str) -> bool:
        now = time.time()
        current_lock = self._locks.get(session_id)
        if current_lock and current_lock["locked_by"] == worker_id:
            current_lock["expires_at"] = now + self.lock_ttl_sec
            return True
        return False

    def release_lock(self, session_id: str, worker_id: str):
        current_lock = self._locks.get(session_id)
        if current_lock and current_lock["locked_by"] == worker_id:
            del self._locks[session_id]
            logger.info(f"[Lock Released] session={session_id} by {worker_id}")

    async def transition_to_in_progress(self, session_id: str, worker_id: str) -> bool:
        """First candidate join: SCHEDULED -> IN_PROGRESS"""
        success = await db_manager.atomic_status_transition(
            session_id=session_id,
            expected_status="scheduled",
            new_status="in_progress",
            actor_id=worker_id,
            note="LiveKit room opened: candidate joined session."
        )
        return success

    async def transition_to_processing(self, session_id: str, worker_id: str) -> bool:
        """Interview concluded: IN_PROGRESS -> PROCESSING and enqueues evaluation job"""
        success = await db_manager.atomic_status_transition(
            session_id=session_id,
            expected_status="in_progress",
            new_status="processing",
            actor_id=worker_id,
            note="Interview ended: submitted to evaluation pipeline."
        )
        if success:
            await db_manager.enqueue_eval_job(session_id)
        return success

    async def transition_to_abandoned(self, session_id: str, worker_id: str) -> bool:
        """No heartbeat or audio for 10 minutes -> ABANDONED"""
        success = await db_manager.atomic_status_transition(
            session_id=session_id,
            expected_status="in_progress",
            new_status="abandoned",
            actor_id=worker_id,
            note="Session abandoned due to inactivity timeout (>10 minutes)."
        )
        return success

session_manager = SessionManager()
