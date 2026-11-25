import json
import time
import random
import asyncio
import logging
from typing import Type, TypeVar, Optional, Dict, Any, List
from pydantic import BaseModel
import httpx

from app.config import settings

logger = logging.getLogger("model_gateway")
logging.basicConfig(level=logging.INFO)

T = TypeVar("T", bound=BaseModel)

class CircuitBreakerOpenError(Exception):
    pass

class BudgetExceededError(Exception):
    pass

class GatewayResponse(BaseModel):
    model_id: str
    prompt_version: str
    latency_ms: float
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    is_fallback: bool = False
    raw_content: str = ""

class ModelGateway:
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.primary_model = settings.PRIMARY_MODEL
        self.fallback_model = settings.FALLBACK_MODEL
        self.guard_model = settings.GUARD_MODEL

        # Circuit breaker state
        self.failure_count = 0
        self.failure_threshold = 4
        self.recovery_timeout = 30.0
        self.last_failure_time = 0.0
        self.circuit_open = False

        # Per-session token tracking: {session_id: {"tokens": int, "start_time": float}}
        self.session_usage: Dict[str, Dict[str, Any]] = {}

    def _check_circuit(self):
        if self.circuit_open:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                logger.info("Circuit breaker half-open: probing recovery...")
                self.circuit_open = False
                self.failure_count = 0
            else:
                raise CircuitBreakerOpenError("ModelGateway circuit breaker is OPEN due to repeated failures.")

    def _record_success(self):
        self.failure_count = 0
        self.circuit_open = False

    def _record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.circuit_open = True
            logger.error(f"Circuit breaker TRIPPED OPEN after {self.failure_count} consecutive failures.")

    def track_session_usage(self, session_id: Optional[str], tokens: int):
        if not session_id:
            return
        now = time.time()
        if session_id not in self.session_usage:
            self.session_usage[session_id] = {"tokens": 0, "start_time": now}
        
        usage = self.session_usage[session_id]
        usage["tokens"] += tokens
        
        if usage["tokens"] > settings.MAX_SESSION_TOKENS:
            raise BudgetExceededError(f"Session {session_id} exceeded token budget: {usage['tokens']} > {settings.MAX_SESSION_TOKENS}")
        
        elapsed = now - usage["start_time"]
        if elapsed > settings.MAX_SESSION_DURATION_SEC:
            raise BudgetExceededError(f"Session {session_id} exceeded duration budget: {elapsed:.0f}s > {settings.MAX_SESSION_DURATION_SEC}s")

    async def _call_openai_raw(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: int = 800,
        response_format: Optional[Dict[str, Any]] = None,
        timeout_sec: float = 20.0
    ) -> Dict[str, Any]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": messages,
        }
        # Reasoning and next-gen models (e.g. luna, o1, o3) only accept default temperature
        is_reasoning = any(k in model.lower() for k in ["luna", "o1", "o3", "sol"])
        if temperature is not None and not is_reasoning:
            payload["temperature"] = temperature

        payload["max_completion_tokens"] = max_tokens

        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def execute_structured(
        self,
        messages: List[Dict[str, str]],
        response_model: Type[T],
        prompt_version: str,
        session_id: Optional[str] = None,
        preferred_model: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 1000,
        max_retries: int = 2
    ) -> tuple[T, GatewayResponse]:
        """
        Executes an LLM call through circuit breaker, timeout, retry with backoff,
        fallback model support, token budget checks, and schema validation.
        """
        self._check_circuit()

        target_model = preferred_model or self.primary_model
        is_fallback = False
        start_time = time.time()
        last_exception = None

        models_to_try = [target_model]
        if self.fallback_model and self.fallback_model != target_model:
            models_to_try.append(self.fallback_model)

        for current_model in models_to_try:
            is_fallback = (current_model != target_model)
            for attempt in range(max_retries + 1):
                try:
                    resp_data = await self._call_openai_raw(
                        model=current_model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        response_format={"type": "json_object"}
                    )
                    
                    self._record_success()
                    latency_ms = (time.time() - start_time) * 1000.0
                    
                    usage = resp_data.get("usage", {})
                    p_tokens = usage.get("prompt_tokens", 0)
                    c_tokens = usage.get("completion_tokens", 0)
                    tot_tokens = usage.get("total_tokens", p_tokens + c_tokens)
                    
                    self.track_session_usage(session_id, tot_tokens)

                    content_str = resp_data["choices"][0]["message"]["content"]
                    
                    # Clean markdown code fences if model enclosed JSON in backticks
                    clean_str = content_str.strip()
                    if clean_str.startswith("```json"):
                        clean_str = clean_str[7:]
                    elif clean_str.startswith("```"):
                        clean_str = clean_str[3:]
                    if clean_str.endswith("```"):
                        clean_str = clean_str[:-3]
                    clean_str = clean_str.strip()

                    parsed_json = json.loads(clean_str)
                    validated_obj = response_model.model_validate(parsed_json)

                    stamp = GatewayResponse(
                        model_id=current_model,
                        prompt_version=prompt_version,
                        latency_ms=round(latency_ms, 2),
                        prompt_tokens=p_tokens,
                        completion_tokens=c_tokens,
                        total_tokens=tot_tokens,
                        is_fallback=is_fallback,
                        raw_content=content_str
                    )

                    # TraceLogger stamping
                    logger.info(
                        f"[TraceLogger] session={session_id} model={current_model} promptVer={prompt_version} "
                        f"latency={latency_ms:.1f}ms tokens={tot_tokens} fallback={is_fallback}"
                    )

                    return validated_obj, stamp

                except Exception as e:
                    last_exception = e
                    self._record_failure()
                    logger.warning(
                        f"Gateway call failed on model={current_model} attempt={attempt}/{max_retries}: {e}"
                    )
                    if attempt < max_retries:
                        backoff = (2 ** attempt) * 0.5 + random.uniform(0.1, 0.4)
                        await asyncio.sleep(backoff)

        raise RuntimeError(f"ModelGateway execution failed across all models. Last error: {last_exception}")

gateway = ModelGateway()
