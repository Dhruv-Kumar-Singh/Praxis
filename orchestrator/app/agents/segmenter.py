import logging
from typing import List, Dict, Any
from app.schemas.agent_outputs import QAPair, SegmentationResult

logger = logging.getLogger("segmenter")

class Segmenter:
    def segment_chunks(self, chunks: List[Dict[str, Any]]) -> SegmentationResult:
        """
        Groups sequential interview chunks into structured Question/Answer pairs
        indexed by questionId and sequence ranges.
        """
        # Sort chunks by sequence number
        sorted_chunks = sorted(chunks, key=lambda c: c.get("seq", 0))

        # Group by questionId
        grouped: Dict[str, Dict[str, Any]] = {}
        for chunk in sorted_chunks:
            q_id = chunk.get("questionId") or "q_general"
            if q_id not in grouped:
                grouped[q_id] = {
                    "question_id": q_id,
                    "chunk_seqs": [],
                    "interviewer_parts": [],
                    "candidate_parts": []
                }
            
            seq = chunk.get("seq", 0)
            role = chunk.get("role", "candidate")
            text = chunk.get("text", "").strip()

            grouped[q_id]["chunk_seqs"].append(seq)
            if role == "interviewer":
                grouped[q_id]["interviewer_parts"].append(f"[seq {seq}] {text}")
            else:
                grouped[q_id]["candidate_parts"].append(f"[seq {seq}] {text}")

        pairs: List[QAPair] = []
        for q_id, data in grouped.items():
            pairs.append(
                QAPair(
                    question_id=q_id,
                    chunk_seqs=data["chunk_seqs"],
                    interviewer_utterance="\n".join(data["interviewer_parts"]),
                    candidate_answer="\n".join(data["candidate_parts"])
                )
            )

        logger.info(f"[Segmenter] Segmented {len(chunks)} chunks into {len(pairs)} QA groups.")
        return SegmentationResult(pairs=pairs)

segmenter = Segmenter()
