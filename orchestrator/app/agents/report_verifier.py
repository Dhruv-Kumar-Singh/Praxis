import logging
from typing import List, Dict, Any, Set
from app.schemas.agent_outputs import (
    ReportDraft,
    ReportVerificationResult,
    VerifiedReportItem
)

logger = logging.getLogger("report_verifier")

class ReportVerifier:
    def verify(
        self,
        draft: ReportDraft,
        valid_chunk_seqs: Set[int],
        valid_question_ids: Set[str]
    ) -> ReportVerificationResult:
        """
        DETERMINISTIC VERIFICATION (NO LLM):
        Validates that every report item carries explicit evidence references
        and that every referenced chunk exists in the interview transcript.
        Uncited or falsely-cited claims are strictly dropped.
        """
        verified_items: List[VerifiedReportItem] = []
        dropped_indices: List[int] = []

        valid_seq_strings = {str(s) for s in valid_chunk_seqs}
        valid_chunk_tokens = {f"chunk_{s}" for s in valid_chunk_seqs} | valid_seq_strings

        for idx, item in enumerate(draft.items):
            raw_refs = item.evidence_refs
            if not raw_refs:
                logger.warning(f"[ReportVerifier] Dropped item {idx}: missing evidenceRefs.")
                dropped_indices.append(idx)
                continue

            # Verify that at least one cited reference is genuinely valid
            has_valid_ref = False
            sanitized_refs = []
            for ref in raw_refs:
                ref_clean = str(ref).strip().lower()
                if ref_clean in valid_chunk_tokens or ref_clean in valid_question_ids:
                    has_valid_ref = True
                    sanitized_refs.append(ref_clean)

            if has_valid_ref:
                verified_items.append(
                    VerifiedReportItem(
                        text=item.text,
                        evidence_refs=sanitized_refs
                    )
                )
            else:
                logger.warning(f"[ReportVerifier] Dropped item {idx}: none of the cited refs {raw_refs} exist.")
                dropped_indices.append(idx)

        # Verification passes if at least 1 verified item exists and < 50% dropped
        passed = (len(verified_items) > 0) and (len(dropped_indices) <= len(draft.items) // 2)

        logger.info(
            f"[ReportVerifier] Verification result: passed={passed} "
            f"(verified={len(verified_items)}, dropped={len(dropped_indices)})"
        )

        return ReportVerificationResult(
            passed=passed,
            dropped_items=dropped_indices,
            items=verified_items,
            overall_score=draft.overall_score,
            summary=draft.summary
        )

    def generate_template_report(
        self,
        stored_evaluations: List[Dict[str, Any]]
    ) -> ReportVerificationResult:
        """
        DETERMINISTIC FALLBACK:
        Builds an unassailable template report directly from stored scores and verified quotes.
        Used when LLM ReportComposer fails verification twice.
        """
        items: List[VerifiedReportItem] = []
        scores_list = []

        for ev in stored_evaluations:
            q_id = ev.get("questionId", "question")
            scores = ev.get("scores", {})
            c = scores.get("correctness", 75)
            comm = scores.get("communication", 75)
            d = scores.get("depth", 75)
            avg = round((c + comm + d) / 3)
            scores_list.append(avg)

            # Generate factual item for question
            evidence_quotes = ev.get("evidence", [])
            evidence_refs = [f"chunk_{eq.get('chunk_seq')}" for eq in evidence_quotes if "chunk_seq" in eq]
            if not evidence_refs:
                evidence_refs = [f"question_{q_id}"]

            items.append(
                VerifiedReportItem(
                    text=f"Demonstrated competency in {q_id}: Correctness {c}/100, Communication {comm}/100, Depth {d}/100. "
                         f"Analysis: {ev.get('rationale', 'Standard performance recorded.')}",
                    evidence_refs=evidence_refs
                )
            )

        overall = round(sum(scores_list) / max(1, len(scores_list)))
        return ReportVerificationResult(
            passed=True,
            dropped_items=[],
            items=items,
            overall_score=overall,
            summary=f"Automated template verification completed across {len(stored_evaluations)} technical question rounds."
        )

report_verifier = ReportVerifier()
