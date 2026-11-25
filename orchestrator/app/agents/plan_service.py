import uuid
import logging
from typing import List, Dict, Any
from app.schemas.agent_outputs import SessionPlan, PlanQuestion

logger = logging.getLogger("plan_service")

# Curated question catalog covering DSA, DBMS, Full-Stack across easy/medium/hard
CURATED_QUESTIONS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "dsa": {
        "easy": [
            {
                "title": "Two Sum & Hash Table Lookups",
                "text": "Given an array of integers and a target sum, describe how to find the two indices that add up to target with O(n) time complexity.",
                "rubric": ["Hash map lookup vs brute force", "One-pass vs two-pass trade-offs", "Edge cases with duplicate elements"]
            },
            {
                "title": "Reverse a Singly Linked List",
                "text": "Explain in-place iterative and recursive approaches to reverse a singly linked list.",
                "rubric": ["Pointer manipulation clarity", "Null checks & single-node edge cases", "Space complexity comparison"]
            }
        ],
        "medium": [
            {
                "title": "LRU Cache Architecture",
                "text": "Design an LRU (Least Recently Used) cache supporting O(1) get and put operations.",
                "rubric": ["Hash map + Doubly Linked List combination", "Cache eviction order correctness", "Thread-safety considerations"]
            },
            {
                "title": "Kth Largest Element in an Array",
                "text": "Find the kth largest element in an unsorted array. Compare Min-Heap vs QuickSelect approaches.",
                "rubric": ["Heap time complexity O(N log K)", "Average vs worst case QuickSelect O(N) vs O(N^2)", "In-place partition mechanics"]
            }
        ],
        "hard": [
            {
                "title": "Median of Two Sorted Arrays",
                "text": "Given two sorted arrays of sizes m and n, find the median with O(log(min(m, n))) runtime complexity.",
                "rubric": ["Binary search on smaller array partition", "Left and right boundary validation", "Handling odd vs even total elements"]
            },
            {
                "title": "Concurrent Rate Limiter with Sliding Window",
                "text": "Design a distributed sliding-window log or token-bucket rate limiter that withstands high concurrency race conditions.",
                "rubric": ["Atomic Redis operations / Lua script synchronization", "Memory scaling across millions of tenants", "Clock drift and network partition resilience"]
            }
        ]
    },
    "dbms": {
        "easy": [
            {
                "title": "Database Normalization (1NF to 3NF)",
                "text": "Explain the stages of relational database normalization from 1NF to 3NF and why denormalization is sometimes preferred in production.",
                "rubric": ["Transitive and partial dependency definition", "Anomalies prevention (insert, update, delete)", "Read vs write performance trade-offs"]
            }
        ],
        "medium": [
            {
                "title": "ACID Isolation Levels & Concurrency Anomalies",
                "text": "Describe the 4 standard ANSI SQL isolation levels and the specific anomalies (dirty read, non-repeatable read, phantom read, serialization anomaly) they prevent.",
                "rubric": ["Read Committed vs Repeatable Read mechanics", "MVCC (Multi-Version Concurrency Control) implementation", "Snapshot Isolation write skew"]
            },
            {
                "title": "B-Tree vs LSM-Tree Storage Engines",
                "text": "Compare read and write amplification trade-offs between B-Tree index structures (PostgreSQL/MySQL) and LSM-Trees (Cassandra/RocksDB).",
                "rubric": ["Write-Ahead Logging (WAL) and compaction", "Random vs sequential I/O patterns", "Range queries efficiency"]
            }
        ],
        "hard": [
            {
                "title": "Distributed Consensus & 2-Phase Commit Failure Modes",
                "text": "Analyze failure scenarios in Two-Phase Commit (2PC) during network partitions and explain how Raft/Paxos avoids blocking.",
                "rubric": ["Coordinator crash during commit phase", "Split-brain prevention via quorums", "Leader election and log replication guarantees"]
            }
        ]
    },
    "full-stack": {
        "easy": [
            {
                "title": "REST API Idempotency & HTTP Methods",
                "text": "Explain the concept of idempotency in HTTP APIs. Which methods are idempotent, and how do you implement idempotency keys for POST requests?",
                "rubric": ["GET/PUT/DELETE vs POST idempotency", "Idempotency key storage in Redis/DB with TTL", "Network replay attack protection"]
            }
        ],
        "medium": [
            {
                "title": "JWT Authentication vs Stateful Sessions",
                "text": "Compare stateless JWT authentication with server-side session stores for a microservices architecture. How do you implement instant token revocation?",
                "rubric": ["Horizontal scalability vs revocation difficulty", "Token blacklisting in Redis vs short expiry + refresh tokens", "CSRF vs XSS vulnerability vectors"]
            },
            {
                "title": "WebSocket Scalability & Backpressure",
                "text": "How do you scale real-time WebSocket connections across multiple backend nodes and handle client-side buffer backpressure?",
                "rubric": ["Redis Pub/Sub or message broker connection fabric", "Sticky sessions vs distributed routing", "Handling slow mobile clients without server memory leaks"]
            }
        ],
        "hard": [
            {
                "title": "Streaming Event-Driven Microservices Architecture",
                "text": "Architect an event-driven payment processing pipeline using Kafka. Address out-of-order delivery, exactly-once processing, and dead-letter queues.",
                "rubric": ["Transactional outbox pattern", "Idempotent consumer design", "Partition key selection and rebalance implications"]
            }
        ]
    }
}

class PlanService:
    def build_plan(
        self,
        session_id: str,
        topic: str,
        difficulty: str = "medium",
        expected_duration_min: int = 30
    ) -> SessionPlan:
        """
        Builds a structured question plan based on topic, difficulty, and duration.
        - 15-30 mins: 2 questions
        - 45 mins: 3 questions
        - 60 mins: 4 questions
        """
        normalized_topic = topic.lower().replace(" ", "").replace("-", "")
        if "dsa" in normalized_topic or "data" in normalized_topic:
            canonical_topic = "dsa"
        elif "db" in normalized_topic or "sql" in normalized_topic:
            canonical_topic = "dbms"
        else:
            canonical_topic = "full-stack"

        diff = difficulty.lower()
        if diff not in ["easy", "medium", "hard"]:
            diff = "medium"

        # Determine number of questions
        if expected_duration_min <= 30:
            num_questions = 2
        elif expected_duration_min <= 45:
            num_questions = 3
        else:
            num_questions = 4

        catalog = CURATED_QUESTIONS.get(canonical_topic, CURATED_QUESTIONS["full-stack"])
        pool = catalog.get(diff, catalog.get("medium", []))

        # If pool has fewer questions, draw from adjacent difficulties
        all_topic_questions = []
        for d in [diff, "medium", "easy", "hard"]:
            for q in catalog.get(d, []):
                if q not in all_topic_questions:
                    all_topic_questions.append(q)

        selected_raw = all_topic_questions[:num_questions]
        
        plan_questions: List[PlanQuestion] = []
        for i, q in enumerate(selected_raw):
            q_id = f"q_{canonical_topic}_{diff}_{i+1}_{uuid.uuid4().hex[:6]}"
            plan_questions.append(
                PlanQuestion(
                    question_id=q_id,
                    topic=canonical_topic.upper(),
                    difficulty=diff,
                    title=q["title"],
                    question_text=q["text"],
                    rubric_focus=q["rubric"]
                )
            )

        logger.info(f"[PlanService] Assembled {len(plan_questions)} questions for session={session_id} topic={canonical_topic} diff={diff}")
        return SessionPlan(
            session_id=session_id,
            topic=canonical_topic.upper(),
            difficulty=diff,
            expected_duration_min=expected_duration_min,
            questions=plan_questions
        )

plan_service = PlanService()
