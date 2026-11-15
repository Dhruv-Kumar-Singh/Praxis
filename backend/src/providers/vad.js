/**
 * Voice Activity Detection (VAD) Provider Interface
 * Energy-based root-mean-square calculation for PCM16 audio.
 */
export const vadProvider = {
  threshold: 0.015,

  /**
   * Evaluates whether audio buffer contains speech based on RMS energy.
   * @param {Buffer} pcm16Buffer - 16-bit PCM little-endian buffer
   * @returns {{ isSpeech: boolean, energy: number }}
   */
  detect(pcm16Buffer) {
    if (!pcm16Buffer || pcm16Buffer.length < 2) {
      return { isSpeech: false, energy: 0 };
    }

    let sumSquares = 0;
    const sampleCount = pcm16Buffer.length / 2;

    for (let i = 0; i < pcm16Buffer.length; i += 2) {
      const sample = pcm16Buffer.readInt16LE(i) / 32768.0;
      sumSquares += sample * sample;
    }

    const energy = Math.sqrt(sumSquares / sampleCount);
    return {
      isSpeech: energy > this.threshold,
      energy,
    };
  },
};

