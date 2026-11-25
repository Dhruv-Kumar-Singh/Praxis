import re
import string
import logging
from typing import List, Dict, Any, Tuple
from app.schemas.agent_outputs import ScorerEvidence

logger = logging.getLogger("evidence_checker")

def normalize_text(text: str) -> str:
    """Normalizes whitespace, lowercases, and removes punctuation for robust substring verification."""
    if not text:
        return ""
    # Lowercase
    text = text.lower()
    # Replace punctuation with space
    text = re.sub(r"[" + re.escape(string.punctuation) + r"]", " ", text)
    # Collapse multiple whitespaces
    return " ".join(text.split())

class EvidenceChecker:
    def verify_evidence(
        self,
        evidence_list: List[ScorerEvidence],
        transcript_chunks: List[Dict[str, Any]]
    ) -> Tuple[List[ScorerEvidence], List[ScorerEvidence]]:
        """
        DETERMINISTIC VERIFICATION (NO LLM):
        Every evidence quote must exist as an exact substring within the cited chunk after normalization.
        Uncited or fabricated quotes are strictly dropped, not repaired.
        
        Returns:
            (verified_evidence, dropped_evidence)
        """
        # Map seq -> normalized chunk text
        chunk_map: Dict[int, str] = {}
        for c in transcript_chunks:
            seq = c.get("seq")
            if seq is not None:
                chunk_map[seq] = normalize_text(c.get("text", ""))

        verified: List[ScorerEvidence] = []
        dropped: List[ScorerEvidence] = []

        for item in evidence_list:
            seq = item.chunk_seq
            raw_quote = item.quote.strip()
            norm_quote = normalize_text(raw_quote)

            if not norm_quote:
                dropped.append(item)
                continue

            chunk_text = chunk_map.get(seq)
            if chunk_text is None:
                logger.warning(f"[EvidenceChecker] Dropped quote: cited chunk seq={seq} does not exist in transcript.")
                dropped.append(item)
                continue

            # Verify substring presence
            if norm_quote in chunk_text:
                verified.append(item)
            else:
                logger.warning(
                    f"[EvidenceChecker] Dropped quote: cited text '{raw_quote[:40]}...' not found in chunk seq={seq}"
                )
                dropped.append(item)

        logger.info(f"[EvidenceChecker] Verified {len(verified)} quotes, dropped {len(dropped)} unverified claims.")
        return verified, dropped

evidence_checker = EvidenceChecker()
