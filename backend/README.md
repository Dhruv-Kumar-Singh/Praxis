# Praxis — AI Voice-Interview Platform (Backend)

Praxis Backend is an enterprise-grade, event-driven voice AI interview platform engine built with Node.js LTS, Express, ES Modules, and native WebSockets (`ws`).

---

## 🔒 Architectural Principles & Hard Constraints

1. **Clean Layered Architecture**: Routes ➔ Controllers ➔ Services ➔ Repository Interfaces ➔ Adapters.
2. **Zero Database Coupling**: The core application logic does **not** import any ORM, ODM, database drivers, or connection pools.
3. **Repository Interface Isolation**: All persistence operations pass through abstract interfaces in `src/repositories/interface.js`. Real persistence layers (e.g. PostgreSQL, Prisma, MongoDB) can be dropped in cleanly by specifying `REPO_DRIVER`.
4. **Dev / Test In-Memory Adapter**: Includes an in-memory adapter (`src/repositories/memory.js`) for local development and rapid, isolated integration testing.
5. **Pluggable AI & Audio Providers**: STT, LLM, TTS, and VAD adapters are strictly behind unified interfaces (`src/providers/`), shipping with realistic zero-dependency mock implementations for zero-cost local execution.

---

## 🚀 Quick Start

### Prerequisites
- Node.js LTS (v20+ recommended)
- npm / pnpm

### Installation
```bash
cd backend
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Running Tests
Execute the comprehensive integration test suite (Vitest + Supertest):
```bash
npm test
```

### Starting the Server
```bash
# Development mode with live reload
npm run dev

# Production mode
npm start
```

The HTTP server will listen on `http://localhost:4000`, and the WebSocket engine will accept connections on `ws://localhost:4000/ws/interview`.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | `4000` | HTTP and WebSocket server port |
| `HOST` | `localhost` | Server host address |
| `JWT_SECRET` | *(required, min 32 chars)* | Secret key for signing access, refresh, and interview tokens |
| `JWT_ACCESS_EXPIRES` | `15m` | Lifetime of API access tokens |
| `JWT_REFRESH_EXPIRES` | `7d` | Lifetime of refresh tokens |
| `JWT_INTERVIEW_EXPIRES`| `5m` | Single-purpose interview session token expiration |
| `REPO_DRIVER` | `memory` | Repository driver implementation (`memory`) |
| `PROVIDER_STT` | `mock` | Speech-to-Text provider (`mock`, `deepgram`) |
| `PROVIDER_LLM` | `mock` | LLM conversational engine (`mock`, `anthropic`) |
| `PROVIDER_TTS` | `mock` | Text-to-Speech synthesis provider (`mock`, `elevenlabs`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-delimited list of permitted CORS web origins |
| `RATE_LIMIT_WINDOW_MS`| `60000` | Rate limiting sliding window duration in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Max standard API requests per IP per window |
| `RATE_LIMIT_AUTH_MAX` | `10` | Max auth attempts per IP per window |
| `SESSION_MAX_DURATION_MS` | `3600000` | Maximum interview session ceiling (1 hour default) |

---

## 🌐 REST API Reference (`/api/v1`)

All requests returning errors adhere strictly to:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": null
  }
}
```

### 1. Authentication (`/api/v1/auth`)
- `POST /register`: Register a new user (`email`, `password`, `name`, `role` = candidate | interviewer). Returns `{ user, accessToken, refreshToken }`.
- `POST /login`: Authenticate with email and password. Returns `{ user, accessToken, refreshToken }`.
- `POST /refresh`: Exchange a valid `refreshToken` for a new rotated pair.
- `POST /logout`: Invalidate all active user refresh sessions.
- `GET /me`: Return the authenticated user profile.

### 2. Users (`/api/v1/users`)
- `GET /`: List all users with pagination (`admin` only).
- `GET /:id`: Retrieve profile details by user ID (`admin` or owner).
- `PATCH /:id`: Update profile info. Role elevation is strictly `admin` only.

### 3. Sessions (`/api/v1/sessions`)
- `POST /`: Create a mock interview session (`role`, `topic`, `config`).
- `GET /`: List sessions with optional filters (`status`, `candidateId`, pagination). Candidates see only their own.
- `GET /export.csv`: Stream sessions list formatted as a CSV file.
- `GET /:id`: Fetch session metadata.
- `PATCH /:id`: Update session details or state (`scheduled`, `in_progress`, `completed`, `cancelled`).
- `DELETE /:id`: Delete session (`admin` only).
- `POST /:id/interview-token`: Mints a short-lived (5 min), single-purpose JWT token (`type: "interview"`) bound strictly to this session. **Cannot be used to authenticate standard REST endpoints.**

### 4. Reports & Evaluations
- `GET /sessions/:id/report`: Fetch generated AI evaluation report.
- `POST /sessions/:id/report/generate`: Trigger LLM evaluation synthesis over stored session chunks.

### 5. Overrides
- `POST /sessions/:id/overrides`: (`interviewer` or `admin` only) Record a score or verdict override.
  - Mandatory fields: `field`, `newValue`, `reason`.
  - **Invariant Guarantee**: Original report values are *never* overwritten or deleted.
- `GET /sessions/:id/overrides`: List all audit trail overrides for the session.

### 6. Dashboard
- `GET /dashboard/summary`: Summary metrics, aggregate scores, completion rate, historical score trends, and per-role averages shaped directly for Chart.js.

### 7. Audit & Notifications
- `GET /audit`: Query paginated audit events (`admin` only). Automatically logs logins, token minting, role escalations, report generation, exports, and score overrides.
- `GET /notifications`: Retrieve in-app notifications for the authenticated user.
- `PATCH /notifications/:id/read`: Mark a notification as read.

### 8. Exports
- `GET /sessions/:id/report.pdf`: Streams an AI interview evaluation report as a styled PDF (PDFKit).
- `GET /sessions/export.csv`: Streams sessions dataset in CSV format (fast-csv).

---

## 🎙️ WebSocket Real-Time Interview Loop

- **Endpoint**: `ws://localhost:4000/ws/interview?token=<interview-token>`

### Connection & Security Handshake
1. Client establishes connection passing `?token=<interview-token>`.
2. Server validates token signature and verifies `type === 'interview'`. Standard API tokens are rejected with error `4002`.
3. Server verifies session status is `scheduled` or `in_progress`.
4. If reconnecting, the server checks `chunkRepo.findLastIndex()` and resumes conversation state from the last chunk.

### State Machine Lifecycle
```
             ┌──────────────┐
             │     IDLE     │
             └──────┬───────┘
                    │ (audio detected / turn started)
                    ▼
             ┌──────────────┐
  ┌─────────▶│  LISTENING   │◀───────────┐
  │          └──────┬───────┘            │ (barge-in)
  │                 │ (silence detected) │
  │                 ▼                    │
  │          ┌──────────────┐            │
  │          │   THINKING   │            │
  │          └──────┬───────┘            │
  │                 │ (LLM emits turn)   │
  │                 ▼                    │
  │          ┌──────────────┐            │
  └──────────┤   SPEAKING   ├────────────┘
 (turn done) └──────────────┘
```

### Audio Protocol & Barge-in
- **Client to Server**: Binary frames streaming 16kHz, 16-bit mono PCM audio.
- **Voice Activity Detection (VAD)**: Server processes RMS energy levels. When the agent is speaking and speech is detected from the client, a **barge-in** event triggers: TTS synthesis is aborted immediately, and state shifts to `LISTENING`.
- **Chunk Persistence**: Transcript turns and audio metrics are enqueued asynchronously via `chunkRepo` without blocking realtime audio loops.

### Event Protocol (JSON Frames)
```json
// Server emits state changes
{ "type": "state", "state": "idle" | "listening" | "thinking" | "speaking" }

// Interim and final speech recognition transcripts
{ "type": "transcript.partial", "text": "..." }
{ "type": "transcript.final", "text": "I designed a distributed queue...", "confidence": 0.95 }

// Streamed interviewer agent text
{ "type": "agent.text", "chunk": "How would you handle " }

// Streamed audio chunks sent as binary frames + metadata
{ "type": "agent.audio", "bytes": 3200 }

// Heartbeat ping / pong
{ "type": "ping" } ➔ { "type": "pong" }

// Graceful session conclusion
{ "type": "session.end", "reason": "completed", "sessionId": "uuid" }
```

---

## 🔌 Implementing a Real Database Repository Adapter

To replace the in-memory adapter with a real database (PostgreSQL, MongoDB, Prisma, etc.):

1. Open `src/repositories/interface.js` to inspect method signatures and JSDoc contracts.
2. Create a new file in `src/repositories/` (e.g. `src/repositories/postgres.js`).
3. Implement each repository:
   ```javascript
   export const userRepo = {
     async create(data) { /* db insert */ },
     async findById(id) { /* db query */ },
     async findByEmail(email) { /* db query */ },
     async update(id, data) { /* db update */ },
     async list({ page, limit }) { /* db pagination query */ }
   };
   // ... implement sessionRepo, reportRepo, overrideRepo, auditRepo, notificationRepo, chunkRepo, refreshTokenRepo
   ```
4. Update `src/repositories/index.js`:
   ```javascript
   if (env.REPO_DRIVER === 'memory') {
     repos = await import('./memory.js');
   } else if (env.REPO_DRIVER === 'postgres') {
     repos = await import('./postgres.js');
   }
   ```
5. Set `REPO_DRIVER=postgres` in your `.env`. No changes to controllers or business services are required!

