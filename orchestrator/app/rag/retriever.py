import hashlib
import logging
from typing import List, Dict, Any, Optional
import numpy as np

from app.schemas.agent_outputs import RetrievedDoc, RetrievalResult
from app.rag.kb_seed import KB_DOCUMENTS, CORPUS_VERSION

logger = logging.getLogger("rag_retriever")

class RAGService:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", threshold: float = 0.40):
        self.model_name = model_name
        self.threshold = threshold
        self.corpus_version = CORPUS_VERSION
        self.model = None
        self.embeddings: Optional[np.ndarray] = None
        self.documents: List[Dict[str, Any]] = KB_DOCUMENTS
        # In-memory query cache: { "rag:{corpusVersion}:{queryHash}": RetrievalResult }
        self.cache: Dict[str, RetrievalResult] = {}

    def _init_model(self):
        if self.model is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"[RAG] Loading embedding model '{self.model_name}'...")
                self.model = SentenceTransformer(self.model_name)
                # Compute embeddings for all seeded knowledge docs
                texts = [f"{d['title']}: {d['text']}" for d in self.documents]
                self.embeddings = self.model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
                logger.info(f"[RAG] Indexed {len(self.documents)} reference documents.")
            except Exception as e:
                logger.error(f"[RAG] Failed to initialize SentenceTransformer: {e}")
                self.model = None

    def _get_query_hash(self, query: str) -> str:
        return hashlib.sha256(query.strip().lower().encode("utf-8")).hexdigest()[:16]

    async def retrieve(
        self,
        query: str,
        topic: str,
        top_k: int = 3,
        corpus_version: str = CORPUS_VERSION
    ) -> RetrievalResult:
        cache_key = f"rag:{corpus_version}:{self._get_query_hash(query)}"
        if cache_key in self.cache:
            logger.info(f"[RAG Cache Hit] {cache_key}")
            return self.cache[cache_key]

        self._init_model()

        if self.model is None or self.embeddings is None:
            # Fallback when embeddings are cold
            matched = [
                RetrievedDoc(
                    doc_id=d["doc_id"],
                    title=d["title"],
                    text=d["text"],
                    score=0.80
                )
                for d in self.documents if d["topic"].lower() in topic.lower()
            ][:top_k]
            res = RetrievalResult(docs=matched, no_reference=len(matched) == 0)
            self.cache[cache_key] = res
            return res

        # Embed query
        query_vec = self.model.encode([query], convert_to_numpy=True, normalize_embeddings=True)[0]

        # Calculate cosine similarity
        similarities = np.dot(self.embeddings, query_vec)

        # Filter by topic and sort
        scored_docs = []
        normalized_topic = topic.upper().replace("-", "").replace(" ", "")
        
        for idx, score in enumerate(similarities):
            doc = self.documents[idx]
            doc_topic = doc["topic"].upper().replace("-", "").replace(" ", "")
            # Boost relevance if topic matches
            if doc_topic in normalized_topic or normalized_topic in doc_topic:
                scored_docs.append((float(score), doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)

        matched_docs: List[RetrievedDoc] = []
        no_ref = False

        for score, doc in scored_docs[:top_k]:
            if score >= self.threshold:
                matched_docs.append(
                    RetrievedDoc(
                        doc_id=doc["doc_id"],
                        title=doc["title"],
                        text=doc["text"],
                        score=round(score, 3)
                    )
                )

        if not matched_docs:
            no_ref = True
            logger.warning(f"[RAG] NO_REFERENCE found above threshold {self.threshold} for topic={topic}")

        result = RetrievalResult(docs=matched_docs, no_reference=no_ref)
        self.cache[cache_key] = result
        return result

rag_service = RAGService()
