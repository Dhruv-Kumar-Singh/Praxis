import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import motor.motor_asyncio
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.config import settings

logger = logging.getLogger("mongo_db")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def session_id_filter(session_id: str) -> Dict[str, Any]:
    """Matches Mongoose ObjectId _id as well as string _id or custom id fields."""
    candidates: List[Any] = [session_id]
    if isinstance(session_id, str) and ObjectId.is_valid(session_id):
        candidates.append(ObjectId(session_id))
    return {"$or": [{"_id": {"$in": candidates}}, {"id": session_id}]}

class MongoManager:
    def __init__(self):
        self.client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
        self.db: Optional[motor.motor_asyncio.AsyncIOMotorDatabase] = None

    async def connect(self):
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URI}...")
        self.client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
        self.db = self.client[settings.MONGODB_DB_NAME]
        await self.init_indexes()
        logger.info("MongoDB connected and indexes verified.")

    async def close(self):
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed.")

    async def init_indexes(self):
        """Ensures all HLD 4.1 indexes and uniqueness constraints are created."""
        try:
            # sessions
            await self.db.sessions.create_index([("userId", ASCENDING), ("createdAt", DESCENDING)])
            await self.db.sessions.create_index([("status", ASCENDING)])

            # interview_chunks (UNIQUE: sessionId + seq)
            await self.db.interview_chunks.create_index(
                [("sessionId", ASCENDING), ("seq", ASCENDING)],
                unique=True
            )

            # evaluations (UNIQUE: sessionId + questionId)
            await self.db.evaluations.create_index(
                [("sessionId", ASCENDING), ("questionId", ASCENDING)],
                unique=True
            )

            # reports (UNIQUE: sessionId)
            await self.db.reports.create_index([("sessionId", ASCENDING)], unique=True)

            # eval_jobs (UNIQUE: sessionId; polling index: status + nextAttemptAt)
            await self.db.eval_jobs.create_index([("sessionId", ASCENDING)], unique=True)
            await self.db.eval_jobs.create_index([("status", ASCENDING), ("nextAttemptAt", ASCENDING)])

            # kb_documents
            await self.db.kb_documents.create_index([("topic", ASCENDING)])

            # audit_logs
            await self.db.audit_logs.create_index([("entity", ASCENDING), ("ts", DESCENDING)])
        except Exception as e:
            logger.warning(f"Index initialization warning (may already exist): {e}")

    # ── Atomic Compare-and-Set Status Transition ─────────────────────────────
    async def atomic_status_transition(
        self,
        session_id: str,
        expected_status: str,
        new_status: str,
        actor_id: str,
        actor_type: str = "orchestrator",
        note: Optional[str] = None
    ) -> bool:
        """
        Atomic Compare-And-Set (CAS) status transition:
        Only transitions if current status matches expected_status.
        Logs to statusHistory and writes an audit_logs document.
        """
        now = utc_now()
        history_entry = {
            "status": new_status,
            "at": now,
            "note": note or f"Transitioned from {expected_status} to {new_status}"
        }

        # Query uses expected_status for CAS guarantee (supports ObjectId or string _id)
        base_filter = session_id_filter(session_id)
        base_filter["status"] = expected_status
        update_result = await self.db.sessions.update_one(
            base_filter,
            {
                "$set": {
                    "status": new_status,
                    "updatedAt": now
                },
                "$push": {"statusHistory": history_entry},
                "$inc": {"version": 1}
            }
        )

        if update_result.modified_count == 0:
            logger.warning(
                f"[CAS Transition FAILED] session={session_id}: expected '{expected_status}', unable to set '{new_status}'"
            )
            return False

        # Write audit log entry
        audit_entry = {
            "ts": now,
            "actorId": actor_id,
            "actorType": actor_type,
            "action": f"session.transition.{new_status.lower()}",
            "entity": "session",
            "entityId": session_id,
            "before": {"status": expected_status},
            "after": {"status": new_status},
            "note": note
        }
        await self.db.audit_logs.insert_one(audit_entry)

        logger.info(
            f"[CAS Transition SUCCESS] session={session_id}: {expected_status} -> {new_status} (actor={actor_id})"
        )
        return True

    # ── Idempotent Chunk Ingestion ───────────────────────────────────────────
    async def write_chunk_idempotent(self, chunk_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Persists an utterance as an interview_chunks document.
        Enforces unique constraint on (sessionId, seq).
        Duplicate insertion is a safe no-op.
        """
        try:
            chunk_data["createdAt"] = utc_now()
            await self.db.interview_chunks.insert_one(chunk_data)
            logger.info(
                f"[Chunk Saved] session={chunk_data.get('sessionId')} seq={chunk_data.get('seq')} "
                f"role={chunk_data.get('role')} len={len(chunk_data.get('text', ''))}"
            )
            return chunk_data
        except DuplicateKeyError:
            logger.info(
                f"[Idempotent Chunk] Ignored duplicate insertion for session={chunk_data.get('sessionId')} seq={chunk_data.get('seq')}"
            )
            existing = await self.db.interview_chunks.find_one({
                "sessionId": chunk_data.get("sessionId"),
                "seq": chunk_data.get("seq")
            })
            return existing or chunk_data

    # ── Evaluation Jobs Queue ────────────────────────────────────────────────
    async def enqueue_eval_job(self, session_id: str) -> bool:
        """Enqueues an evaluation job for a completed session."""
        now = utc_now()
        job = {
            "sessionId": session_id,
            "status": "queued",
            "stage": "segmentation",
            "attempts": 0,
            "lastError": None,
            "nextAttemptAt": now,
            "lockedBy": None,
            "lockedUntil": None,
            "createdAt": now,
            "updatedAt": now
        }
        try:
            await self.db.eval_jobs.insert_one(job)
            logger.info(f"[EvalJob Enqueued] session={session_id}")
            return True
        except DuplicateKeyError:
            # If already exists, reset to queued
            await self.db.eval_jobs.update_one(
                {"sessionId": session_id},
                {
                    "$set": {
                        "status": "queued",
                        "nextAttemptAt": now,
                        "lockedBy": None,
                        "lockedUntil": None,
                        "updatedAt": now
                    }
                }
            )
            return True

    async def claim_eval_job(self, worker_id: str, lease_seconds: int = 120) -> Optional[Dict[str, Any]]:
        """
        Claims a pending eval job using atomic findOneAndUpdate with lease locking.
        """
        now = utc_now()
        lease_expiration = datetime.fromtimestamp(now.timestamp() + lease_seconds, tz=timezone.utc)

        job = await self.db.eval_jobs.find_one_and_update(
            {
                "status": {"$in": ["queued", "failed"]},
                "nextAttemptAt": {"$lte": now},
                "$or": [
                    {"lockedUntil": None},
                    {"lockedUntil": {"$lt": now}}
                ]
            },
            {
                "$set": {
                    "status": "running",
                    "lockedBy": worker_id,
                    "lockedUntil": lease_expiration,
                    "updatedAt": now
                },
                "$inc": {"attempts": 1}
            },
            return_document=True
        )
        return job

db_manager = MongoManager()
