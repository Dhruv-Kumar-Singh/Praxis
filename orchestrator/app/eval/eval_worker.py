import os
import asyncio
import logging
from datetime import datetime, timezone
from app.db.mongo import db_manager, utc_now
from app.eval.pipeline import eval_pipeline

logger = logging.getLogger("eval_worker")

class EvalWorker:
    def __init__(self, worker_id: str = None, poll_interval_sec: float = 3.0, max_attempts: int = 3):
        self.worker_id = worker_id or f"worker_{os.getpid()}"
        self.poll_interval = poll_interval_sec
        self.max_attempts = max_attempts
        self.is_running = False

    async def start(self):
        self.is_running = True
        logger.info(f"[EvalWorker] Started background worker loop (id={self.worker_id})")

        while self.is_running:
            try:
                # Atomically claim a job
                job = await db_manager.claim_eval_job(self.worker_id, lease_seconds=120)
                if not job:
                    await asyncio.sleep(self.poll_interval)
                    continue

                session_id = job.get("sessionId")
                attempts = job.get("attempts", 1)
                logger.info(f"[EvalWorker] Claimed job for session={session_id} attempt={attempts}/{self.max_attempts}")

                try:
                    await eval_pipeline.run(session_id=session_id, job_id=str(job.get("_id")))
                except Exception as e:
                    logger.error(f"[EvalWorker] Pipeline error on session={session_id}: {e}", exc_info=True)
                    now = utc_now()
                    if attempts >= self.max_attempts:
                        # Mark job failed and transition session to processing_failed
                        await db_manager.db.eval_jobs.update_one(
                            {"_id": job["_id"]},
                            {
                                "$set": {
                                    "status": "failed",
                                    "lastError": str(e),
                                    "updatedAt": now
                                }
                            }
                        )
                        await db_manager.atomic_status_transition(
                            session_id=session_id,
                            expected_status="processing",
                            new_status="processing_failed",
                            actor_id=self.worker_id,
                            note=f"Evaluation failed after {attempts} attempts. Error: {str(e)[:200]}"
                        )
                    else:
                        # Exponential backoff for next retry: 5s, 15s, 45s
                        delay_sec = 5 * (3 ** (attempts - 1))
                        next_attempt = datetime.fromtimestamp(now.timestamp() + delay_sec, tz=timezone.utc)
                        await db_manager.db.eval_jobs.update_one(
                            {"_id": job["_id"]},
                            {
                                "$set": {
                                    "status": "queued",
                                    "lastError": str(e),
                                    "nextAttemptAt": next_attempt,
                                    "lockedBy": None,
                                    "lockedUntil": None,
                                    "updatedAt": now
                                }
                            }
                        )
                        logger.info(f"[EvalWorker] Re-queued session={session_id} for retry at {next_attempt}")

            except asyncio.CancelledError:
                logger.info("[EvalWorker] Worker loop cancelled.")
                break
            except Exception as e:
                logger.error(f"[EvalWorker] Unexpected loop error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        self.is_running = False

eval_worker = EvalWorker()
