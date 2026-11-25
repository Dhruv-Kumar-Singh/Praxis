import logging
from typing import Dict, Any, List, Optional
from app.db.mongo import db_manager

logger = logging.getLogger("turn_manager")

class TurnManager:
    """
    Owns monotonically increasing sequence (seq) numbering and chunk persistence.
    Maintains active in-memory context window (sess:{id}:ctx mirror).
    """
    def __init__(self):
        # { session_id: current_seq }
        self._seq_counters: Dict[str, int] = {}
        # { session_id: [last N turns] }
        self._ctx_cache: Dict[str, List[Dict[str, Any]]] = {}

    def get_next_seq(self, session_id: str) -> int:
        current = self._seq_counters.get(session_id, 0)
        self._seq_counters[session_id] = current + 1
        return current + 1

    async def restore_seq(self, session_id: str) -> int:
        """Restores seq counter from MongoDB upon worker restart or resume."""
        latest_chunk = await db_manager.db.interview_chunks.find_one(
            {"sessionId": session_id},
            sort=[("seq", -1)]
        )
        if latest_chunk and "seq" in latest_chunk:
            self._seq_counters[session_id] = latest_chunk["seq"]
            return latest_chunk["seq"]
        self._seq_counters[session_id] = 0
        return 0

    async def record_utterance(
        self,
        session_id: str,
        role: str,
        text: str,
        question_id: Optional[str] = None,
        start_ms: int = 0,
        end_ms: int = 0,
        stt_confidence: Optional[float] = None,
        audio_ref: Optional[str] = None,
        model_id: Optional[str] = None,
        truncated: bool = False
    ) -> Dict[str, Any]:
        """
        Atomically records an utterance into MongoDB interview_chunks.
        Guaranteed idempotent by (sessionId, seq) unique index.
        """
        seq = self.get_next_seq(session_id)
        chunk_doc = {
            "sessionId": session_id,
            "seq": seq,
            "role": role,  # 'interviewer' or 'candidate'
            "text": text.strip(),
            "startMs": start_ms,
            "endMs": end_ms,
            "sttConfidence": stt_confidence,
            "questionId": question_id,
            "audioRef": audio_ref,
            "modelId": model_id,
            "truncated": truncated
        }

        persisted = await db_manager.write_chunk_idempotent(chunk_doc)

        # Update sess:{id}:ctx cache (keep last 10 turns)
        if session_id not in self._ctx_cache:
            self._ctx_cache[session_id] = []
        self._ctx_cache[session_id].append({
            "seq": seq,
            "role": role,
            "text": text.strip(),
            "questionId": question_id
        })
        if len(self._ctx_cache[session_id]) > 10:
            self._ctx_cache[session_id] = self._ctx_cache[session_id][-10:]

        return persisted

    async def get_context(self, session_id: str, last_n: int = 6) -> List[Dict[str, Any]]:
        """Retrieves last N turns from cache or reconstructs from MongoDB on cache miss."""
        if session_id in self._ctx_cache and self._ctx_cache[session_id]:
            return self._ctx_cache[session_id][-last_n:]

        # Reconstruct from MongoDB on cache miss
        cursor = db_manager.db.interview_chunks.find(
            {"sessionId": session_id}
        ).sort("seq", -1).limit(last_n)
        
        chunks = await cursor.to_list(length=last_n)
        chunks.reverse()
        clean = [
            {"seq": c["seq"], "role": c["role"], "text": c["text"], "questionId": c.get("questionId")}
            for c in chunks
        ]
        self._ctx_cache[session_id] = clean
        return clean

turn_manager = TurnManager()
