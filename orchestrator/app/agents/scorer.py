import logging
from typing import List, Dict, Any, Tuple
from app.gateway.model_gateway import gateway, GatewayResponse
from app.schemas.agent_outputs import QuestionScoringOutput
from app.prompts.templates import SCORER_SYSTEM, SCORER_USER, PROMPT_VERSION
from app.config import settings

logger = logging.getLogger("scorer")

class Scorer:
    def __init__(self):
        self.model = settings.PRIMARY_MODEL

    async def score_question(
        self,
        session_id: str,
        question_id: str,
        question_title: str,
        question_text: str,
        reference_context: str,
        transcript_chunks: List[Dict[str, Any]]
    ) -> Tuple[QuestionScoringOutput, GatewayResponse]:
        """
        Grades candidate performance on a question using temperature 0 and structured JSON.
        Includes up to 2 repair retries handled by ModelGateway.
        """
        # Format chunks for the evaluator prompt
        formatted_chunks = []
        for c in transcript_chunks:
            seq = c.get("seq", 0)
            role = c.get("role", "candidate")
            text = c.get("text", "")
            formatted_chunks.append(f"[Chunk seq={seq} role={role}]: {text}")
        chunks_text = "\n".join(formatted_chunks) if formatted_chunks else "No transcript content available."

        user_content = SCORER_USER.format(
            question_title=question_title,
            question_text=question_text,
            reference_context=reference_context or "Standard industry engineering benchmarks apply.",
            transcript_chunks=chunks_text
        )

        messages = [
            {"role": "system", "content": SCORER_SYSTEM},
            {"role": "user", "content": user_content}
        ]

        result, stamp = await gateway.execute_structured(
            messages=messages,
            response_model=QuestionScoringOutput,
            prompt_version=PROMPT_VERSION,
            session_id=session_id,
            preferred_model=self.model,
            temperature=0.0,
            max_tokens=600,
            max_retries=2
        )

        logger.info(
            f"[Scorer] Graded session={session_id} question={question_id} -> "
            f"correctness={result.scores.correctness} comm={result.scores.communication} depth={result.scores.depth}"
        )
        return result, stamp

scorer = Scorer()
