import json
import logging
from typing import List, Dict, Any, Tuple
from app.gateway.model_gateway import gateway, GatewayResponse
from app.schemas.agent_outputs import ReportDraft
from app.prompts.templates import REPORT_COMPOSER_SYSTEM, REPORT_COMPOSER_USER, PROMPT_VERSION
from app.config import settings

logger = logging.getLogger("report_composer")

class ReportComposer:
    def __init__(self):
        self.model = settings.PRIMARY_MODEL

    async def compose_report(
        self,
        session_id: str,
        topic: str,
        difficulty: str,
        stored_evaluations: List[Dict[str, Any]]
    ) -> Tuple[ReportDraft, GatewayResponse]:
        """
        Synthesizes a final candidate report using exclusively STORED scores and verified evidence.
        Every observation carries specific evidenceRefs back to chunk IDs.
        """
        # Prepare evaluations payload for the prompt
        clean_evals = []
        for ev in stored_evaluations:
            clean_evals.append({
                "question_id": ev.get("questionId"),
                "scores": ev.get("scores"),
                "rationale": ev.get("rationale"),
                "verified_evidence": ev.get("evidence", [])
            })

        user_content = REPORT_COMPOSER_USER.format(
            session_id=session_id,
            topic=topic,
            difficulty=difficulty,
            evaluations_json=json.dumps(clean_evals, indent=2)
        )

        messages = [
            {"role": "system", "content": REPORT_COMPOSER_SYSTEM},
            {"role": "user", "content": user_content}
        ]

        result, stamp = await gateway.execute_structured(
            messages=messages,
            response_model=ReportDraft,
            prompt_version=PROMPT_VERSION,
            session_id=session_id,
            preferred_model=self.model,
            temperature=0.2,
            max_tokens=900
        )

        logger.info(f"[ReportComposer] Drafted report for session={session_id} with {len(result.items)} items.")
        return result, stamp

report_composer = ReportComposer()
