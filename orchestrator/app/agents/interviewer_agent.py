import logging
from typing import List, Dict, Any, Tuple, Optional
from app.gateway.model_gateway import gateway, GatewayResponse
from app.schemas.agent_outputs import InterviewerTurnOutput, PlanQuestion, AdaptiveQuestionOutput
from app.prompts.templates import (
    INTERVIEWER_SYSTEM,
    INTERVIEWER_USER,
    ADAPTIVE_QUESTION_SYSTEM,
    ADAPTIVE_QUESTION_USER,
    PROMPT_VERSION
)
from app.config import settings

logger = logging.getLogger("interviewer_agent")

class InterviewerAgent:
    def __init__(self):
        self.model = settings.PRIMARY_MODEL

    async def generate_turn(
        self,
        session_id: str,
        topic: str,
        difficulty: str,
        current_question: PlanQuestion,
        plan_questions: List[PlanQuestion],
        recent_turns: List[Dict[str, Any]],
        candidate_utterance: str,
        is_first_turn: bool = False
    ) -> Tuple[InterviewerTurnOutput, GatewayResponse]:
        """
        Generates the next structured interviewer turn based on candidate answer,
        plan progress, and rubric focus.
        """
        # If this is the start of the interview, output the opening question directly
        if is_first_turn or not candidate_utterance.strip():
            first_utterance = (
                f"Hello and welcome to your {topic} technical interview! "
                f"Let's dive into our first topic: {current_question.title}. "
                f"{current_question.question_text}"
            )
            return InterviewerTurnOutput(
                utterance=first_utterance,
                intent="ask",
                question_id=current_question.question_id,
                difficulty_adjustment="same"
            ), GatewayResponse(
                model_id="scripted-init",
                prompt_version=PROMPT_VERSION,
                latency_ms=0.1
            )

        # Format plan overview
        plan_summary = "; ".join([f"[{q.question_id}] {q.title}" for q in plan_questions])
        
        # Format recent conversation turns
        formatted_history = []
        for turn in recent_turns[-6:]:
            role = turn.get("role", "interviewer").capitalize()
            text = turn.get("text", "")
            formatted_history.append(f"{role}: {text}")
        recent_turns_str = "\n".join(formatted_history) if formatted_history else "No prior turns."

        user_content = INTERVIEWER_USER.format(
            topic=topic,
            difficulty=difficulty,
            plan_summary=plan_summary,
            current_question_id=current_question.question_id,
            current_question_title=current_question.title,
            rubric_focus=", ".join(current_question.rubric_focus),
            recent_turns=recent_turns_str,
            candidate_utterance=candidate_utterance
        )

        messages = [
            {"role": "system", "content": INTERVIEWER_SYSTEM},
            {"role": "user", "content": user_content}
        ]

        result, stamp = await gateway.execute_structured(
            messages=messages,
            response_model=InterviewerTurnOutput,
            prompt_version=PROMPT_VERSION,
            session_id=session_id,
            preferred_model=self.model,
            temperature=0.3,
            max_tokens=400
        )
        return result, stamp

    async def generate_adaptive_question(
        self,
        session_id: str,
        topic: str,
        difficulty: str,
        previous_question: str,
        candidate_answer: str,
        recent_turns: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[AdaptiveQuestionOutput, GatewayResponse]:
        """
        Uses OpenAI LLM to dynamically generate the NEXT question tailored directly to how
        the candidate answered the previous question.
        """
        formatted_history = []
        if recent_turns:
            for turn in recent_turns[-6:]:
                if "question" in turn or "answer" in turn:
                    q_txt = turn.get("question", "")
                    a_txt = turn.get("answer", "")
                    if q_txt:
                        formatted_history.append(f"Interviewer: {q_txt}")
                    if a_txt:
                        formatted_history.append(f"Candidate: {a_txt}")
                else:
                    role = turn.get("role", "interviewer").capitalize()
                    text = turn.get("text", "")
                    formatted_history.append(f"{role}: {text}")
        recent_turns_str = "\n".join(formatted_history) if formatted_history else "First question answered."

        system_prompt = ADAPTIVE_QUESTION_SYSTEM.format(topic=topic, difficulty=difficulty)
        user_prompt = ADAPTIVE_QUESTION_USER.format(
            topic=topic,
            difficulty=difficulty,
            previous_question=previous_question,
            candidate_answer=candidate_answer,
            recent_turns=recent_turns_str
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        result, stamp = await gateway.execute_structured(
            messages=messages,
            response_model=AdaptiveQuestionOutput,
            prompt_version=PROMPT_VERSION,
            session_id=session_id,
            preferred_model=self.model,
            temperature=0.4,
            max_tokens=1500
        )
        return result, stamp

interviewer_agent = InterviewerAgent()
