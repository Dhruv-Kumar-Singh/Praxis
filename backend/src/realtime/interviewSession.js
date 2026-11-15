import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { sessionRepo, chunkRepo } from '../repositories/index.js';
import { sttProvider } from '../providers/stt.js';
import { llmProvider, SYSTEM_PROMPT } from '../providers/llm.js';
import { ttsProvider } from '../providers/tts.js';
import { vadProvider } from '../providers/vad.js';
import { reportService } from '../services/reportService.js';
import { notificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export const STATE = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
};

export class InterviewSession {
  /**
   * @param {import('ws').WebSocket} ws
   * @param {string} token - interview-scoped JWT
   */
  constructor(ws, token) {
    this.ws = ws;
    this.token = token;
    this.state = STATE.IDLE;
    this.audioBuffer = Buffer.alloc(0);
    this.conversationHistory = [];
    this.chunkIndex = 0;
    this.sessionId = null;
    this.userId = null;
    this.sessionConfig = {};
    this.ttsAborted = false;
    this.maxDurationTimer = null;
    this.pingInterval = null;
    this.isCleanedUp = false;
    this.persistingQueue = Promise.resolve();
  }

  sendJson(payload) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendBinary(buffer) {
    if (this.ws.readyState === 1) {
      this.ws.send(buffer, { binary: true });
    }
  }

  setState(newState) {
    this.state = newState;
    this.sendJson({ type: 'state', state: newState });
  }

  // Non-blocking chunk persistence queue
  enqueueChunk(data) {
    this.persistingQueue = this.persistingQueue
      .then(() => chunkRepo.create(data))
      .catch((err) => logger.error({ err, sessionId: this.sessionId }, 'Chunk persistence error'));
  }

  async init() {
    // 1. Verify token
    let decoded;
    try {
      decoded = jwt.verify(this.token, env.JWT_SECRET);
    } catch (err) {
      this.sendJson({ type: 'error', code: 'INVALID_TOKEN', message: 'Token is invalid or expired' });
      this.ws.close(4001, 'Invalid or expired token');
      return false;
    }

    if (decoded.type !== 'interview') {
      this.sendJson({ type: 'error', code: 'UNAUTHORIZED_TOKEN_TYPE', message: 'Token is not an interview token' });
      this.ws.close(4002, 'Invalid token type');
      return false;
    }

    // 2. Load session
    const session = await sessionRepo.findById(decoded.sessionId);
    if (!session || !['scheduled', 'in_progress'].includes(session.status)) {
      this.sendJson({ type: 'error', code: 'SESSION_NOT_RUNNABLE', message: 'Session is not active or runnable' });
      this.ws.close(4003, 'Session not runnable');
      return false;
    }

    this.sessionId = session.id;
    this.userId = decoded.sub;
    this.sessionConfig = session.config || {};
    this.conversationHistory = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Mark session as in_progress
    if (session.status === 'scheduled') {
      await sessionRepo.update(this.sessionId, { status: 'in_progress' });
    }

    // 3. Handle reconnect with resume by last chunk index
    const lastIndex = await chunkRepo.findLastIndex(this.sessionId);
    if (lastIndex >= 0) {
      this.chunkIndex = lastIndex + 1;
      const priorChunks = await chunkRepo.listBySessionId(this.sessionId);
      for (const ch of priorChunks) {
        if (ch.transcript) {
          this.conversationHistory.push({
            role: ch.type === 'agent' ? 'assistant' : 'user',
            content: ch.transcript,
          });
        }
      }
    }

    // 4. Session maximum duration
    this.maxDurationTimer = setTimeout(() => {
      this.endSession('max_duration');
    }, env.SESSION_MAX_DURATION_MS);

    // 5. Heartbeat ping-pong
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === 1) {
        this.ws.ping();
      }
    }, 30000);

    this.setState(STATE.IDLE);
    this.sendJson({
      type: 'session.ready',
      sessionId: this.sessionId,
      resumedFromChunk: lastIndex,
    });

    // If starting fresh without chunks, launch the initial agent turn
    if (lastIndex < 0) {
      await this.agentTurn();
    }

    return true;
  }

  async handleAudioFrame(pcm16Buffer) {
    if (this.isCleanedUp) return;

    const { isSpeech } = vadProvider.detect(pcm16Buffer);

    // Barge-in: user speech interrupts agent speech
    if (this.state === STATE.SPEAKING && isSpeech) {
      this.ttsAborted = true;
      this.setState(STATE.LISTENING);
    }

    if (isSpeech && this.state !== STATE.LISTENING) {
      this.setState(STATE.LISTENING);
    }

    this.audioBuffer = Buffer.concat([this.audioBuffer, pcm16Buffer]);

    // Send partial transcript mock update when listening
    if (this.state === STATE.LISTENING && this.audioBuffer.length % 6400 === 0) {
      this.sendJson({ type: 'transcript.partial', text: '...' });
    }

    // End-of-speech heuristic: speech transitioned to silence with sufficient buffer
    if (!isSpeech && this.state === STATE.LISTENING && this.audioBuffer.length >= 16000) {
      await this.processSpeech();
    }
  }

  async processSpeech() {
    this.setState(STATE.THINKING);
    const audioData = Buffer.from(this.audioBuffer);
    this.audioBuffer = Buffer.alloc(0);

    try {
      const result = await sttProvider.transcribe(audioData, { sessionId: this.sessionId });
      const text = result.text.trim();

      this.sendJson({ type: 'transcript.final', text, confidence: result.confidence });

      if (!text) {
        this.setState(STATE.IDLE);
        return;
      }

      // Non-blocking chunk persistence
      this.enqueueChunk({
        sessionId: this.sessionId,
        index: this.chunkIndex++,
        type: 'user',
        transcript: text,
        audioMeta: { bytes: audioData.length },
      });

      this.conversationHistory.push({ role: 'user', content: text });

      // Check for user explicitly concluding session
      if (/\b(end session|finish interview|stop interview|that is all|bye|goodbye)\b/i.test(text)) {
        await this.endSession('user_completed');
        return;
      }

      await this.agentTurn();
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId }, 'Speech processing error');
      this.sendJson({ type: 'error', code: 'STT_FAILURE', message: 'Failed to transcribe audio' });
      this.setState(STATE.IDLE);
    }
  }

  async agentTurn() {
    this.setState(STATE.THINKING);
    this.ttsAborted = false;

    try {
      const fullText = await llmProvider.chat(this.conversationHistory, {
        sessionConfig: this.sessionConfig,
        onChunk: (chunk) => {
          this.sendJson({ type: 'agent.text', chunk });
        },
      });

      this.conversationHistory.push({ role: 'assistant', content: fullText });

      // Persist agent response turn
      this.enqueueChunk({
        sessionId: this.sessionId,
        index: this.chunkIndex++,
        type: 'agent',
        transcript: fullText,
        audioMeta: null,
      });

      // Stream TTS audio back to client
      this.setState(STATE.SPEAKING);

      for await (const chunk of ttsProvider.synthesize(fullText)) {
        if (this.ttsAborted || this.isCleanedUp) break;
        this.sendBinary(chunk);
        this.sendJson({ type: 'agent.audio', bytes: chunk.length });
      }

      if (!this.ttsAborted && !this.isCleanedUp) {
        this.setState(STATE.IDLE);
      }
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId }, 'Interviewer agent turn failed');
      this.sendJson({ type: 'error', code: 'AGENT_ERROR', message: 'Interviewer turn error' });
      this.setState(STATE.IDLE);
    }
  }

  async endSession(reason = 'completed') {
    if (this.isCleanedUp) return;

    try {
      await this.persistingQueue;
      await sessionRepo.update(this.sessionId, { status: 'completed' });

      // Trigger automatic report generation
      await reportService.generate(this.sessionId, { sub: this.userId, role: 'candidate' }, 'websocket');

      // Send completion notification
      await notificationService.notify({
        userId: this.userId,
        type: 'session_completed',
        payload: { sessionId: this.sessionId, reason },
      });

      this.sendJson({ type: 'session.end', reason, sessionId: this.sessionId });
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId }, 'Error finalizing session end');
    } finally {
      this.cleanup();
      if (this.ws.readyState === 1) {
        this.ws.close(1000, reason);
      }
    }
  }

  cleanup() {
    this.isCleanedUp = true;
    clearTimeout(this.maxDurationTimer);
    clearInterval(this.pingInterval);
    this.audioBuffer = Buffer.alloc(0);
  }
}

