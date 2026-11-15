import { useState, useCallback, useRef } from 'react';

/**
 * useTextToSpeech
 * Wraps the native Web Speech Synthesis API.
 * Reads any text string aloud using the browser's built-in voice engine.
 *
 * Usage:
 *   const { isSpeaking, speak, stop, isSupported } = useTextToSpeech();
 */
export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  const isSupported =
    typeof window !== 'undefined' && !!window.speechSynthesis;

  const speak = useCallback(
    (text) => {
      if (!isSupported || !text) return;

      // Cancel any currently playing speech first
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;    // slightly slower than default — sounds more natural
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported]
  );

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [isSupported]);

  return { isSpeaking, speak, stop, isSupported };
}

