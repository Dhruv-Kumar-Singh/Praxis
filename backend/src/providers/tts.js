import { env } from '../config/env.js';

/** TTS Provider Interface & Mock */
const mockTTS = {
  /**
   * Synthesize text to an async audio chunk generator.
   * Produces simulated PCM16 16kHz mono frames.
   * @param {string} text
   * @param {object} [opts]
   * @returns {AsyncGenerator<Buffer>}
   */
  async *synthesize(text, opts = {}) {
    // 16kHz, 16-bit mono = 32000 bytes/sec
    // Emit ~100ms chunks (3200 bytes)
    const totalChunks = Math.min(5, Math.max(1, Math.ceil(text.length / 50)));
    const chunkSize = 3200;
    const dummyPcm = Buffer.alloc(chunkSize, 0);

    for (let i = 0; i < totalChunks; i++) {
      await new Promise((r) => setTimeout(r, 15));
      yield dummyPcm;
    }
  },
};

/** ElevenLabs adapter stub */
const elevenLabsTTS = {
  async *synthesize(text, opts) {
    throw new Error('ElevenLabs TTS adapter not configured. Set PROVIDER_TTS=mock for local dev.');
  },
};

const adapters = {
  mock: mockTTS,
  elevenlabs: elevenLabsTTS,
};

export const ttsProvider = adapters[env.PROVIDER_TTS] || mockTTS;

