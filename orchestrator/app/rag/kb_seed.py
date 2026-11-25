"""
Curated technical documents for DSA, DBMS, and Full-Stack engineering rubrics.
Corpus version 1.0.0.
"""

CORPUS_VERSION = "1.0.0"

KB_DOCUMENTS = [
    # ── DSA ──────────────────────────────────────────────────────────────────
    {
        "doc_id": "kb_dsa_001",
        "topic": "DSA",
        "title": "Hash Table Collisions & Time Complexity Bounds",
        "text": "Hash tables offer amortized O(1) time complexity for insertions and lookups. Collisions can be resolved via separate chaining (linked list or red-black tree when chain length exceeds 8) or open addressing (linear probing, quadratic probing, double hashing). Worst-case lookup degrades to O(N) under adverse hash collisions.",
        "corpus_version": CORPUS_VERSION
    },
    {
        "doc_id": "kb_dsa_002",
        "topic": "DSA",
        "title": "LRU Cache Architecture with Doubly Linked Lists",
        "text": "An optimal Least Recently Used (LRU) Cache combines a hash map with a doubly linked list. The hash map maps keys to node pointers for O(1) lookup. The doubly linked list maintains access order: recently accessed nodes are moved to the head, while evictions remove from the tail in O(1) time without array shifting.",
        "corpus_version": CORPUS_VERSION
    },
    {
        "doc_id": "kb_dsa_003",
        "topic": "DSA",
        "title": "Binary Search Partitioning & QuickSelect",
        "text": "QuickSelect provides O(N) average time complexity for finding the k-th smallest or largest element by partitioning in-place around a pivot. Worst-case is O(N^2) if pivot selection is poor, which is mitigated via randomized pivot selection or the median-of-medians algorithm.",
        "corpus_version": CORPUS_VERSION
    },

    # ── DBMS ─────────────────────────────────────────────────────────────────
    {
        "doc_id": "kb_dbms_001",
        "topic": "DBMS",
        "title": "ACID Properties & SQL Isolation Levels",
        "text": "The four standard SQL isolation levels are Read Uncommitted, Read Committed, Repeatable Read, and Serializable. Lower levels permit dirty reads, non-repeatable reads, and phantom reads. Relational databases like PostgreSQL implement Repeatable Read via MVCC (Multi-Version Concurrency Control) using transaction snapshot timestamps rather than locking reads.",
        "corpus_version": CORPUS_VERSION
    },
    {
        "doc_id": "kb_dbms_002",
        "topic": "DBMS",
        "title": "B-Tree vs LSM-Tree Indexing and Storage Engines",
        "text": "B-Tree engines (MySQL InnoDB, PostgreSQL) optimize for random read performance with balance-guaranteed trees at the cost of random write I/O. Log-Structured Merge (LSM) Trees (RocksDB, Cassandra) append writes sequentially to a Write-Ahead Log (WAL) and memory buffer (MemTable), subsequently flushing and compacting SSTables in the background, offering superior write throughput.",
        "corpus_version": CORPUS_VERSION
    },

    # ── Full-Stack ───────────────────────────────────────────────────────────
    {
        "doc_id": "kb_fs_001",
        "topic": "FULL-STACK",
        "title": "API Idempotency & Distributed Token Buckets",
        "text": "Idempotent HTTP endpoints ensure identical side-effects upon repeated execution. For non-idempotent POST operations, clients attach an Idempotency-Key header. Servers acquire a distributed lock in Redis with a 24-hour TTL and persist the response. Rate limiters utilize Token Bucket or Sliding-Window Counter algorithms in Redis with atomic Lua scripts.",
        "corpus_version": CORPUS_VERSION
    },
    {
        "doc_id": "kb_fs_002",
        "topic": "FULL-STACK",
        "title": "WebSocket Architecture & Real-Time Backpressure",
        "text": "Long-lived WebSocket connections require horizontal scaling across gateway instances using a message bus like Redis Pub/Sub or Kafka. Backpressure management is critical: slow consumers must be handled with adaptive windowing or frame-dropping policies to prevent gateway buffer memory exhaustion.",
        "corpus_version": CORPUS_VERSION
    }
]
