import { useState, useRef, useCallback } from 'react';

/**
 * useSpeechToText
 * Wraps the native Web Speech API (SpeechRecognition).
 * Streams live transcript into the provided onTranscript callback.
 *
 * Usage:
 *   const { isListening, startListening, stopListening, isSupported } = useSpeechToText({ onTranscript });
 */
export function useSpeechToText({ onTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Check browser support once
  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!isSupported) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    // If already listening, stop first
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.interimResults = true;  // stream words live as you speak
    recognition.continuous = false;     // auto-stop on natural pause

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event) => {
      // Concatenate all result parts into one transcript string
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('');
      onTranscript(transcript);
    };

    recognition.onerror = (event) => {
      console.error('SpeechRecognition error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, startListening, stopListening, isSupported };
}

