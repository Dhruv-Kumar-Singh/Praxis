import { env } from '../config/env.js';

/**
 * STT Provider Interface. All adapters must implement this.
 * @typedef {Object} STTResult
 * @property {string} text - Transcribed text
 * @property {boolean} isFinal - True if final transcript
 * @property {number} confidence - 0 to 1
 */

/** Mock STT — returns realistic candidate interview answers */
const mockSTT = {
  _counter: 0,
  /**
   * Process an audio buffer and return a transcript.
   * @param {Buffer} audioBuffer - PCM16 mono 16kHz audio
   * @param {object} [opts] - { sessionId, language }
   * @returns {Promise<STTResult>}
   */
  async transcribe(audioBuffer, { sessionId } = {}) {
    this._counter++;
    const responses = [
      'In my previous role, I designed a distributed task queue using Redis and BullMQ with exponential backoff.',
      'We handled database failover by configuring cross-region read replicas with automatic leader election.',
      'I prioritized low-latency RPCs using protocol buffers over gRPC instead of standard REST endpoints.',
      'When resolving deadlocks, I analyze thread dumps and enforce strict lock acquisition ordering.',
      'I stay current by reading ACM Queue, engineering blogs, and experimenting with new tech stacks.',
    ];
    return {
      text: responses[this._counter % responses.length],
      isFinal: true,
      confidence: 0.95,
    };
  },
};

/** Deepgram adapter stub */
const deepgramSTT = {
  async transcribe(audioBuffer, opts) {
    throw new Error('Deepgram STT adapter not configured. Set PROVIDER_STT=mock for local dev.');
  },
};

const adapters = {
  mock: mockSTT,
  deepgram: deepgramSTT,
};

export const sttProvider = adapters[env.PROVIDER_STT] || mockSTT;

