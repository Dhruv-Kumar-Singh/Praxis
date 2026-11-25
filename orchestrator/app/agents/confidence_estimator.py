import logging
from typing import List, Dict, Any, Optional
from app.schemas.agent_outputs import ConfidenceOutput, ScoresBreakdown

logger = logging.getLogger("confidence_estimator")

class ConfidenceEstimator:
    def __init__(self, confidence_threshold: float = 0.65):
        self.confidence_threshold = confidence_threshold

    def estimate_confidence(
        self,
        scores: ScoresBreakdown,
        candidate_chunks: List[Dict[str, Any]],
        retrieval_score: float = 0.85,
        score_variance: float = 0.0
    ) -> ConfidenceOutput:
        """
        Calculates composite evaluation confidence from:
        1. Mean STT confidence across candidate chunks (defaults to 1.0 for typed text).
        2. Relevance score of retrieved reference context.
        3. Score variance penalty across rubric dimensions.
        """
        flags: List[str] = []

        # 1. STT Confidence check
        stt_scores = [
            c.get("sttConfidence") for c in candidate_chunks
            if c.get("sttConfidence") is not None
        ]
        if stt_scores:
            avg_stt = sum(stt_scores) / len(stt_scores)
            if avg_stt < 0.70:
                flags.append("LOW_STT_CONFIDENCE")
        else:
            avg_stt = 1.0  # Perfect for text-first input

        # 2. Retrieval grounding
        if retrieval_score < 0.50:
            flags.append("LOW_RETRIEVAL_ALIGNMENT")

        # 3. Rubric Score variance check
        score_vals = [scores.correctness, scores.communication, scores.depth]
        mean_score = sum(score_vals) / 3.0
        variance = sum((s - mean_score) ** 2 for s in score_vals) / 3.0
        
        # High internal variance penalty (>400 implies >20 point divergence across dimensions)
        variance_penalty = 0.0
        if variance > 400:
            flags.append("HIGH_SCORE_DIVERGENCE")
            variance_penalty = 0.15

        # Composite confidence formula
        composite_confidence = (avg_stt * 0.45) + (retrieval_score * 0.40) + 0.15 - variance_penalty
        composite_confidence = max(0.0, min(1.0, composite_confidence))

        if composite_confidence < self.confidence_threshold:
            flags.append("LOW_CONFIDENCE")

        logger.info(
            f"[ConfidenceEstimator] Estimated confidence={composite_confidence:.2f} flags={flags}"
        )
        return ConfidenceOutput(
            confidence_score=round(composite_confidence, 2),
            flags=flags
        )

confidence_estimator = ConfidenceEstimator()
