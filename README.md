# Praxis - AI Interview Coach

**Practice technical interviews out loud, with an AI interviewer that actually explains your feedback.**

Praxis AI Interview Coach is an end-to-end realtime voice and chat mock interview platform for technical interview preparation. Candidates speak their answers to an AI interviewer just like in a live technical screen, and afterward receive an evidence-based evaluation report where every assertion is backed by verified verbatim transcript excerpts.

---

## Architecture Overview

```
               ┌────────────────────────────────────────────────────────┐
               │              React 19 Frontend (Vite)                  │
               │  - Home Page Live Interview Section                    │
               │  - LiveKit Client / Audio Renderer                     │
               │  - Candidate Scorecards & Analytics Dashboard          │
               └───────────────▲────────────────────────▲───────────────┘
                               │ HTTP / JWT             │ WebRTC Audio / Data
                               ▼                        ▼
┌──────────────────────────────────────┐     ┌──────────────────────────────────┐
│        Node.js / Express API         │     │          LiveKit Cloud           │
│  - Session Management & Auth (JWT)   │     │  - WebRTC Room Audio & Data      │
│  - Participant Token Minting         │     │  - Room: interview-{sessionId}   │
│  - Reports, Overrides, & Auditing    │     └──────────────────▲───────────────┘
└───────────────▲──────────────────────┘                        │
                │ MongoDB (Mongoose)                            │
                ▼                                               ▼
┌──────────────────────────────────────┐     ┌──────────────────────────────────┐
│         MongoDB Collections          │     │       Python Orchestrator        │
│  - users, sessions, interview_chunks │     │  - LiveKit Agents Voice Worker   │
│  - evaluations, reports, overrides   │◄────┤  - Fast PlanService & RAG Index  │
│  - audit_logs, eval_jobs             │     │  - ModelGateway (GPT-6 Luna)     │
└──────────────────────────────────────┘     │  - 9-Stage Evaluation Pipeline   │
                                             └──────────────────────────────────┘
```

### Key Technical Components
- **Frontend (`/frontend`)**: React 19, Tailwind CSS v4, `@livekit/components-react`, `livekit-client`, `axios`, `gsap`.
- **Backend API (`/backend`)**: Node.js, Express, `livekit-server-sdk`, Mongoose ODM, JWT authentication, Zod validation, Vitest suite.
- **AI Orchestrator (`/orchestrator`)**: Python 3.12, FastAPI, LiveKit Agents (`1.8.x`), Silero VAD, OpenAI Whisper STT, OpenAI TTS, `sentence-transformers` (`all-MiniLM-L6-v2`) vector retrieval, Pytest suite.
- **LLM Engine**: OpenAI `gpt-6-luna` via resilient `ModelGateway` (circuit breaker, fallback, token budgeting, prompt injection guard).
- **Evaluation Pipeline**: Deterministic 9-stage HLD 5.3 pipeline with substring evidence quote verification, confidence estimation, and automatic fallback template reporting.

---

## Quickstart with Docker Compose

To boot all services (MongoDB, Orchestrator, LiveKit Worker, Backend API, and Frontend) in one command:

```bash
docker compose up --build
```

Access the application:
- **Frontend UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1) (Health: `/health`)
- **AI Orchestrator**: [http://localhost:8000](http://localhost:8000) (Health: `/health`)

---

## Local Development Setup

### 1. Prerequisites
- Node.js 20+
- Python 3.12+
- MongoDB 7.0+ running on `mongodb://127.0.0.1:27017`

### 2. Environment Configuration
Create `.env` files from their respective examples:

- `backend/.env`:
  ```env
  PORT=4000
  MONGODB_URI=mongodb://127.0.0.1:27017/praxis
  REPO_DRIVER=mongo
  JWT_SECRET=change_me_32_chars_minimum_secret_key_12345
  ORCHESTRATOR_URL=http://localhost:8000
  ORCHESTRATOR_INTERNAL_SECRET=praxis_internal_dev_secret_32char_minimum
  LIVEKIT_URL=wss://praxis-u12f8rl1.livekit.cloud
  LIVEKIT_API_KEY=APIc4p6X9hGrVeh
  LIVEKIT_API_SECRET=<YOUR_LIVEKIT_API_SECRET>
  ```

- `orchestrator/.env`:
  ```env
  PORT=8000
  MONGODB_URI=mongodb://127.0.0.1:27017/praxis
  INTERNAL_API_SECRET=praxis_internal_dev_secret_32char_minimum
  OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>
  PRIMARY_MODEL=gpt-6-luna
  FALLBACK_MODEL=gpt-6-luna
  SAFETY_MODEL=gpt-6-luna
  LIVEKIT_URL=wss://praxis-u12f8rl1.livekit.cloud
  LIVEKIT_API_KEY=APIc4p6X9hGrVeh
  LIVEKIT_API_SECRET=<YOUR_LIVEKIT_API_SECRET>
  ```

### 3. Run Backend API
```bash
cd backend
npm install
npm run dev
```

### 4. Run AI Orchestrator & LiveKit Agent Worker
```bash
cd orchestrator
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Start FastAPI API server:
uvicorn app.main:app --port 8000 --reload

# In a separate terminal, start the LiveKit realtime agent worker:
python -m agent_worker.worker start
```

### 5. Run React Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Running Test Suites

### Backend Unit & Integration Tests (Vitest)
```bash
npm test --prefix backend
```
*Runs 23 automated tests covering authentication, session lifecycle, token minting, LiveKit participant credentials, overrides, and role-based access control.*

### AI Orchestrator & Agents Test Suite (Pytest)
```bash
orchestrator\.venv\Scripts\pytest orchestrator\tests
```
*Runs 13 automated tests covering PlanService, SafetyGuard, ModelGateway circuit breaker, deterministic EvidenceChecker substring verification, ConfidenceEstimator, and ReportVerifier.*

---

## Testing the Live AI Interview Flow

1. Open [http://localhost:5173](http://localhost:5173).
2. On the Home Page hero, select your target topic (DSA, DBMS, Full-Stack, or System Design) or type a custom topic in the composer bar.
3. Choose your difficulty level and expected duration.
4. Click **Start Interview**.
5. When prompted, allow microphone access to connect to the LiveKit Cloud room.
6. Speak or type your answers as the AI interviewer leads the session.
7. Click **End Interview** when finished. The 9-stage evaluation pipeline runs automatically, and your comprehensive scorecard and report will appear immediately upon completion.
