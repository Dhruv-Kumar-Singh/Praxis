import { useState, useRef, useCallback } from 'react';

/**
 * useSpeechToText
 * Wraps the native Web Speech API in continuous + interimResults mode.
 * onTranscript(text, isFinal) is called on every result event.
 *
 * Usage:
 *   const { isListening, startListening, stopListening, isSupported } =
 *     useSpeechToText({ onTranscript });
 */
export function useSpeechToText({ onTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!isSupported) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.interimResults = true;  // stream words live as you speak
    recognition.continuous = true;      // keep listening until stopListening() is called

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }
      // isFinal=true means the word is committed; isFinal=false means it's a live partial
      onTranscript(finalText || interimText, finalText !== '');
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
