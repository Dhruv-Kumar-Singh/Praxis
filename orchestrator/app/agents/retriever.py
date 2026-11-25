import logging
from typing import List
from app.schemas.agent_outputs import RetrievedDoc, RetrievalResult

logger = logging.getLogger("retriever")

class Retriever:
    def __init__(self, score_threshold: float = 0.40):
        self.score_threshold = score_threshold

    async def retrieve(
        self,
        query: str,
        topic: str,
        top_k: int = 3,
        corpus_version: str = "1.0.0"
    ) -> RetrievalResult:
        """
        Retrieves top-k reference passages filtered by topic & corpusVersion.
        Flags NO_REFERENCE if the top match falls below score_threshold.
        """
        from app.rag.retriever import rag_service
        return await rag_service.retrieve(query, topic, top_k, corpus_version)

retriever = Retriever()
