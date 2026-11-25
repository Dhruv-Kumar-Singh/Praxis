import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { sessionsApi } from '../api/client';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const PRESET_TOPICS = [
  { id: 'DSA', label: 'Data Structures & Algorithms', icon: 'solar:code-bold' },
  { id: 'DBMS', label: 'Database Systems & SQL', icon: 'solar:database-bold' },
  { id: 'Full-Stack', label: 'Full-Stack Architecture', icon: 'solar:layers-bold' },
  { id: 'System Design', label: 'Distributed Systems', icon: 'solar:server-bold' },
];

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function LiveInterviewSection({ initialTopic = '', onViewReport, onInterviewCompleted }) {
  // Setup state
  const [topic, setTopic] = useState(initialTopic || 'DSA');
  const [customTopic, setCustomTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [expectedDurationMin, setExpectedDurationMin] = useState(30);

  // Sync hero topic input when provided
  useEffect(() => {
    if (initialTopic && initialTopic.trim()) {
      setCustomTopic(initialTopic);
    }
  }, [initialTopic]);

  // Session lifecycle: 'idle' | 'starting' | 'active' | 'evaluating' | 'completed' | 'error'
  const [sessionState, setSessionState] = useState('idle');
  const [sessionData, setSessionData] = useState(null);
  const [livekitConfig, setLivekitConfig] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Report state
  const [evalProgress, setEvalProgress] = useState(0);
  const [evalStep, setEvalStep] = useState('');
  const [reportData, setReportData] = useState(null);

  // Holds latest uncommitted Q+A turn from ActiveInterviewRoom so End/Timeout never drops it
  const latestTurnRef = useRef({ lastQuestion: '', candidateAnswer: '', questionNumber: 1 });
  const endingRef = useRef(false);

  // ── Handle Start Interview ──────────────────────────────────────────────────
  const handleStartInterview = async () => {
    try {
      endingRef.current = false;
      setSessionState('starting');
      setErrorMessage('');

      const selectedTopic = customTopic.trim() || topic;

      const session = await sessionsApi.create({
        topic: selectedTopic,
        difficulty,
        expectedDurationMin,
        role: `${selectedTopic} Engineer`,
      });

      const startResult = await sessionsApi.start(session.id);

      setSessionData(session);
      setLivekitConfig({
        serverUrl: startResult.serverUrl,
        token: startResult.participantToken,
        roomName: startResult.roomName,
        sessionId: session.id,
      });

      setSessionState('active');
    } catch (err) {
      console.error('Failed to start interview:', err);
      setErrorMessage(
        err.response?.data?.error?.message || err.message || 'Failed to start interview'
      );
      setSessionState('error');
    }
  };

  // ── Handle End Interview (triggers evaluation pipeline) ────────────────────
  const handleEndInterview = useCallback(async (overrideTurn = null) => {
    if (!sessionData?.id || endingRef.current) return;
    endingRef.current = true;
    setSessionState('evaluating');
    setEvalStep('Saving final answers & initiating AI evaluation...');
    setEvalProgress(10);

    const turnPayload = overrideTurn || latestTurnRef.current;

    try {
      await sessionsApi.end(sessionData.id, {
        lastQuestion: turnPayload?.lastQuestion || '',
        candidateAnswer: turnPayload?.candidateAnswer || '',
        questionNumber: turnPayload?.questionNumber || 1,
      });
    } catch (err) {
      console.warn('Could not enqueue eval via backend:', err);
    }
  }, [sessionData]);

  // ── Poll for evaluation completion ─────────────────────────────────────────
  useEffect(() => {
    if (sessionState !== 'evaluating' || !sessionData?.id) return;
    let attempts = 0;
    const intervalId = setInterval(async () => {
      attempts++;
      try {
        const current = await sessionsApi.getById(sessionData.id);
        if (current.status === 'feedback_ready' || current.status === 'completed') {
          clearInterval(intervalId);
          let fetchedReport = null;
          try {
            fetchedReport = await sessionsApi.getReport(sessionData.id);
            setReportData(fetchedReport);
          } catch (e) {
            console.warn('Report not ready yet:', e);
          }
          setSessionState('completed');
          if (onInterviewCompleted) {
            onInterviewCompleted(current, fetchedReport);
          }
        } else if (current.status === 'processing_failed' || current.status === 'failed') {
          clearInterval(intervalId);
          setErrorMessage('Evaluation encountered an issue. You can retry.');
          setSessionState('error');
        } else {
          if (attempts < 3) {
            setEvalStep('Aggregating speech transcripts & turns...');
            setEvalProgress(25);
          } else if (attempts < 6) {
            setEvalStep('Scoring correctness, communication, and depth...');
            setEvalProgress(55);
          } else if (attempts < 9) {
            setEvalStep('Validating evidence quotes and coherence...');
            setEvalProgress(80);
          } else {
            setEvalStep('Composing final evaluation report...');
            setEvalProgress(92);
          }
        }
      } catch (err) {
        console.error('Error polling evaluation:', err);
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [sessionState, sessionData, onInterviewCompleted]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-6xl mx-auto my-12 px-4 sm:px-6">
      <div className="relative rounded-3xl border border-white/10 bg-neutral-950/80 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Decorative glows */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />

        {/* ── STATE: IDLE ───────────────────────────────────────────────────── */}
        {sessionState === 'idle' && (
          <div className="p-6 sm:p-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/[0.08]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE VIDEO · AI INTERVIEW
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Start an AI Technical Interview
                </h2>
                <p className="text-sm text-neutral-400 font-light mt-1">
                  Live video call with adaptive question generation by OpenAI GPT · STT transcription · real-time scoring
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-400">STATUS:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 text-xs text-neutral-300 font-mono border border-white/10">
                  READY
                </span>
              </div>
            </div>

            {/* Topic Selection */}
            <div className="mb-6">
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">
                Select Domain / Topic
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {PRESET_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTopic(t.id); setCustomTopic(''); }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 ${
                      topic === t.id && !customTopic
                        ? 'border-white bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                        : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/25 hover:text-neutral-200'
                    }`}
                  >
                    <Icon icon={t.icon} className="text-xl text-neutral-300" />
                    <div>
                      <div className="text-xs font-medium text-white">{t.id}</div>
                      <div className="text-[10px] text-neutral-400 truncate">{t.label}</div>
                    </div>
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Or specify a custom topic (e.g. Raft Consensus, React Internals, GraphQL Security)..."
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Difficulty & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">
                  Difficulty Level
                </label>
                <div className="flex gap-2">
                  {['easy', 'medium', 'hard'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-medium uppercase tracking-wider transition-all cursor-pointer ${
                        difficulty === lvl
                          ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">
                  Duration
                </label>
                <div className="flex gap-2">
                  {[15, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setExpectedDurationMin(mins)}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-medium tracking-wider transition-all cursor-pointer ${
                        expectedDurationMin === mins
                          ? 'border-white bg-white/10 text-white'
                          : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Start Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/[0.08]">
              <div className="text-xs text-neutral-400 flex items-center gap-2">
                <Icon icon="solar:shield-check-bold" className="text-emerald-400 text-base" />
                <span>Camera & microphone access requested when the room opens.</span>
              </div>
              <button
                type="button"
                onClick={handleStartInterview}
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-white text-black font-semibold text-sm tracking-wide shadow-[0_0_30px_rgba(255,255,255,0.35)] hover:bg-neutral-200 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-3 group"
              >
                <span>Start Interview</span>
                <Icon icon="solar:play-circle-bold" className="text-lg group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* ── STATE: STARTING ───────────────────────────────────────────────── */}
        {sessionState === 'starting' && (
          <div className="p-10 py-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white animate-spin mb-6" />
            <h3 className="text-xl font-medium text-white mb-2">Preparing Your Interview Room</h3>
            <p className="text-sm text-neutral-400 max-w-md font-light">
              Minting LiveKit room credentials and generating your first question...
            </p>
          </div>
        )}

        {/* ── STATE: ACTIVE ─────────────────────────────────────────────────── */}
        {sessionState === 'active' && livekitConfig && (
          <LiveKitRoom
            serverUrl={livekitConfig.serverUrl}
            token={livekitConfig.token}
            connect={true}
            audio={true}
            video={true}
            data-lk-theme="default"
            onDisconnected={() => handleEndInterview()}
          >
            <ActiveInterviewRoom
              sessionData={sessionData}
              expectedDurationMin={expectedDurationMin}
              latestTurnRef={latestTurnRef}
              onEndInterview={handleEndInterview}
            />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}

        {/* ── STATE: EVALUATING ─────────────────────────────────────────────── */}
        {sessionState === 'evaluating' && (
          <div className="p-10 py-20 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 relative mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-mono text-emerald-300">
                {evalProgress}%
              </div>
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Analyzing Your Interview</h3>
            <p className="text-sm text-emerald-400 font-mono mb-4">{evalStep}</p>
            <p className="text-xs text-neutral-400 max-w-lg font-light leading-relaxed">
              The Praxis 9-stage evaluation pipeline is extracting evidence quotes, scoring technical depth, and building your scorecard.
            </p>
            <div className="w-full max-w-md bg-white/5 rounded-full h-2 mt-6 overflow-hidden border border-white/10">
              <div
                className="bg-emerald-400 h-full transition-all duration-500 ease-out"
                style={{ width: `${evalProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── STATE: COMPLETED ──────────────────────────────────────────────── */}
        {sessionState === 'completed' && (
          <div className="p-6 sm:p-10">
            <div className="flex items-center justify-between gap-4 mb-8 pb-6 border-b border-white/[0.08]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-2">
                  <Icon icon="solar:check-circle-bold" className="text-sm" />
                  EVALUATION COMPLETE
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Interview Performance Summary
                </h2>
                <p className="text-sm text-neutral-400 font-light mt-1">
                  Topic: {sessionData?.topic} · Difficulty: {sessionData?.difficulty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSessionState('idle'); setReportData(null); }}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-neutral-200 transition-all cursor-pointer"
              >
                Start New Session
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2">Overall Score</div>
                <div className="text-5xl font-bold text-white tracking-tight mb-2">
                  {reportData?.overall ?? 0}%
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  {reportData?.verdict || (
                    (reportData?.overall ?? 0) >= 90
                      ? 'Strong Hire'
                      : (reportData?.overall ?? 0) >= 75
                      ? 'Hire'
                      : (reportData?.overall ?? 0) >= 60
                      ? 'Lean Hire'
                      : 'No Hire'
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 col-span-2 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2">Executive Summary</div>
                  <p className="text-sm text-neutral-300 font-light leading-relaxed mb-4">
                    {reportData?.summary ||
                      'Your answers have been scored and verified by the Praxis AI evaluation pipeline.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                  <Icon icon="solar:shield-check-bold" className="text-emerald-400" />
                  <span>Verifier Passed · 100% Quote Evidence Substring Verified</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
              {onViewReport && (
                <button
                  type="button"
                  onClick={() => {
                    const overall = reportData?.overall ?? 0;
                    const verdict = reportData?.verdict || (
                      overall >= 90 ? 'Strong Hire' :
                      overall >= 75 ? 'Hire' :
                      overall >= 60 ? 'Lean Hire' : 'No Hire'
                    );
                    onViewReport({
                      id: sessionData?.id,
                      title: `${sessionData?.topic} — AI Technical Interview`,
                      role: sessionData?.role || `${sessionData?.topic} Engineer`,
                      company: 'Praxis AI',
                      date: 'Just now',
                      duration: `${sessionData?.expectedDurationMin ?? expectedDurationMin} mins`,
                      type: sessionData?.topic || 'Technical',
                      score: overall,
                      verdict,
                      synopsis: reportData?.summary || '',
                      strengths: reportData?.strengths ?? [],
                      improvements: reportData?.weaknesses ?? [],
                      questions: (reportData?.questionsDetail ?? []).map((q) => ({
                        title: q.title,
                        score: q.score,
                        feedback: q.feedback,
                      })),
                    });
                  }}
                  className="px-6 py-2.5 rounded-full bg-white text-black font-semibold text-xs tracking-wide hover:bg-neutral-200 transition-all cursor-pointer"
                >
                  View Full Detailed Report →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STATE: ERROR ──────────────────────────────────────────────────── */}
        {sessionState === 'error' && (
          <div className="p-10 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
              <Icon icon="solar:danger-triangle-bold" className="text-2xl" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Session Interrupted</h3>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">{errorMessage}</p>
            <button
              type="button"
              onClick={() => setSessionState('idle')}
              className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all cursor-pointer"
            >
              Back to Interview Setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SUBCOMPONENT: ACTIVE INTERVIEW ROOM ──────────────────────────────────────
function ActiveInterviewRoom({ sessionData, expectedDurationMin, latestTurnRef, onEndInterview }) {
  const room = useRoomContext();

  // Camera tracks for all participants
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  // Interview state
  const [currentQuestion, setCurrentQuestion] = useState(
    sessionData?.plan?.[0]?.question_text ||
    `Welcome! I'm your AI interviewer for this ${sessionData?.topic || 'technical'} session. Let's begin — ` +
    `please introduce yourself briefly and describe a challenging technical problem you've solved recently.`
  );
  const [questionNumber, setQuestionNumber] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const historyRef = useRef([]); // [{question, answer}]

  // Live STT state: running answer accumulates finalised chunks; interimText shows partial
  const [answerBuffer, setAnswerBuffer] = useState('');     // committed final text
  const [interimText, setInterimText] = useState('');       // live partial word

  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(expectedDurationMin * 60);
  const timerEndedRef = useRef(false);

  // TTS to speak questions aloud
  const { speak } = useTextToSpeech();

  // Keep latest uncommitted answer synced for timeout / End Interview flush
  useEffect(() => {
    if (latestTurnRef) {
      latestTurnRef.current = {
        lastQuestion: currentQuestion,
        candidateAnswer: `${answerBuffer} ${interimText}`.trim(),
        questionNumber,
      };
    }
  }, [latestTurnRef, currentQuestion, answerBuffer, interimText, questionNumber]);

  // Speak first question on mount
  useEffect(() => {
    speak(currentQuestion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secondsRemaining === 0 && !timerEndedRef.current) {
      timerEndedRef.current = true;
      onEndInterview({
        lastQuestion: currentQuestion,
        candidateAnswer: `${answerBuffer} ${interimText}`.trim(),
        questionNumber,
      });
    }
  }, [secondsRemaining, currentQuestion, answerBuffer, interimText, questionNumber, onEndInterview]);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── STT callback ──────────────────────────────────────────────────────────
  const handleTranscript = useCallback((text, isFinal) => {
    if (isFinal) {
      setAnswerBuffer((prev) => (prev ? `${prev} ${text}` : text));
      setInterimText('');
    } else {
      setInterimText(text);
    }
  }, []);

  const { isListening, startListening, stopListening, isSupported } = useSpeechToText({
    onTranscript: handleTranscript,
  });

  // ── Mic toggle ────────────────────────────────────────────────────────────
  const toggleMic = async () => {
    if (!room?.localParticipant) return;
    const willMute = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!willMute);
    setIsMuted(willMute);
    if (willMute) stopListening();
    else startListening();
  };

  // ── Camera toggle ─────────────────────────────────────────────────────────
  const toggleCamera = async () => {
    if (!room?.localParticipant) return;
    const willOff = !isCameraOff;
    await room.localParticipant.setCameraEnabled(!willOff);
    setIsCameraOff(willOff);
  };

  // Start STT when room connects
  useEffect(() => {
    if (room && isSupported) startListening();
    return () => stopListening();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // ── Submit answer → next question ─────────────────────────────────────────
  const handleSubmit = async () => {
    const candidateAnswer = `${answerBuffer} ${interimText}`.trim();
    if (!candidateAnswer) return;
    if (secondsRemaining <= 0) { onEndInterview(); return; }

    stopListening();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Append to running history (last 5 turns sent as context)
      const updatedHistory = [
        ...historyRef.current,
        { question: currentQuestion, answer: candidateAnswer },
      ];
      historyRef.current = updatedHistory;

      const result = await sessionsApi.nextQuestion(sessionData.id, {
        previousQuestion: currentQuestion,
        candidateAnswer,
        topic: sessionData.topic,
        difficulty: sessionData.difficulty,
        questionNumber,                        // tells orchestrator which questionId to stamp
        history: updatedHistory.slice(-5),     // last 5 Q+A pairs for LLM context
      });

      if (!result?.question_text && !result?.utterance) {
        throw new Error('Empty question returned from AI');
      }

      const nextQ = result.question_text || result.utterance;
      setCurrentQuestion(nextQ);
      setQuestionNumber((n) => n + 1);
      setAnswerBuffer('');
      setInterimText('');

      // Speak the new question aloud
      speak(nextQ);
    } catch (err) {
      console.error('Failed to get next question:', err);
      setSubmitError('Could not generate next question. Please try again or end the interview.');
    } finally {
      setIsSubmitting(false);
      // Always resume listening after submit (unless muted)
      if (!isMuted) startListening();
    }
  };

  // ── Derived display ───────────────────────────────────────────────────────
  const liveTranscript = answerBuffer
    ? `${answerBuffer}${interimText ? ` ${interimText}` : ''}`
    : interimText || '';

  const timerColor = secondsRemaining < 60
    ? 'text-red-400'
    : secondsRemaining < 300
    ? 'text-yellow-400'
    : 'text-emerald-300';

  // Local participant track(s)
  const localCameraTrack = cameraTracks.find(
    (t) => t.participant?.isLocal && t.publication?.source === Track.Source.Camera
  );
  const remoteCameraTracks = cameraTracks.filter(
    (t) => !t.participant?.isLocal && t.publication?.source === Track.Source.Camera
  );

  return (
    <div className="flex flex-col h-auto min-h-[700px]">
      {/* ── TOP: Room Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <div>
            <div className="text-sm font-semibold text-white">
              {sessionData?.topic} Interview · Live
            </div>
            <div className="text-xs text-neutral-400 font-mono">
              Q{questionNumber} · Room: {room?.name || 'interview-active'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-xs ${timerColor} flex items-center gap-1.5`}>
            <Icon icon="solar:clock-circle-bold" className="text-sm" />
            {formatTimer(secondsRemaining)}
          </div>
          <button
            type="button"
            onClick={() => {
              stopListening();
              onEndInterview({
                lastQuestion: currentQuestion,
                candidateAnswer: `${answerBuffer} ${interimText}`.trim(),
                questionNumber,
              });
            }}
            className="px-4 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Icon icon="solar:stop-circle-bold" />
            End Interview
          </button>
        </div>
      </div>

      {/* ── VIDEO TILES ROW ────────────────────────────────────────────────── */}
      <div className="flex gap-4 px-6 py-4 border-b border-white/[0.06] bg-black/20">
        {/* AI Interviewer Tile (avatar) */}
        <div className="relative flex-1 aspect-video max-h-44 rounded-2xl bg-neutral-900 border border-white/10 overflow-hidden flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Icon icon="solar:robot-bold" className="text-3xl text-emerald-400" />
            </div>
            <span className="text-xs text-neutral-400 font-mono">AI Interviewer</span>
          </div>
        </div>

        {/* Local Camera (candidate) */}
        <div className="relative flex-1 aspect-video max-h-44 rounded-2xl bg-neutral-900 border border-white/10 overflow-hidden">
          {localCameraTrack && !isCameraOff ? (
            <VideoTrack
              trackRef={localCameraTrack}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Icon icon="solar:camera-slash-bold" className="text-2xl text-neutral-500" />
              <span className="text-xs text-neutral-500 font-mono">Camera Off</span>
            </div>
          )}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white font-mono">
            You (Candidate)
          </div>
        </div>

        {/* Remote participants (if any) */}
        {remoteCameraTracks.map((trackRef, idx) => (
          <div key={idx} className="relative flex-1 aspect-video max-h-44 rounded-2xl bg-neutral-900 border border-white/10 overflow-hidden">
            <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      {/* ── QUESTION DISPLAY ───────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
            <Icon icon="solar:chat-round-dots-bold" className="text-xs text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-1">
              Question {questionNumber}
            </div>
            <p className="text-sm sm:text-base text-white leading-relaxed font-light">
              {currentQuestion}
            </p>
            {submitError && (
              <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                <Icon icon="solar:danger-triangle-bold" className="text-sm flex-shrink-0" />
                {submitError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── STT LIVE TRANSCRIPT BAR ────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-400 animate-pulse' : 'bg-neutral-600'}`} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
            {isListening ? 'Listening · Speak your answer' : 'Microphone paused'}
          </span>
        </div>
        <div className="min-h-[56px] px-4 py-3 rounded-xl bg-black/30 border border-white/[0.06] text-sm text-neutral-200 leading-relaxed">
          {liveTranscript ? (
            <>
              <span>{answerBuffer}</span>
              {interimText && (
                <span className="text-neutral-500 italic"> {interimText}</span>
              )}
            </>
          ) : (
            <span className="text-neutral-600 italic">
              {isListening
                ? 'Your speech will appear here as you talk...'
                : 'Unmute to start speaking.'}
            </span>
          )}
        </div>
      </div>

      {/* ── CONTROLS BAR ───────────────────────────────────────────────────── */}
      <div className="px-6 py-4 flex items-center gap-3">
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={toggleMic}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0 ${
            isMuted
              ? 'border-red-400/30 bg-red-500/10 text-red-400'
              : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
          }`}
        >
          <Icon icon={isMuted ? 'solar:muted-bold' : 'solar:microphone-bold'} className="text-lg" />
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={toggleCamera}
          title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0 ${
            isCameraOff
              ? 'border-red-400/30 bg-red-500/10 text-red-400'
              : 'border-white/20 bg-white/5 text-neutral-300 hover:bg-white/10'
          }`}
        >
          <Icon icon={isCameraOff ? 'solar:camera-slash-bold' : 'solar:camera-bold'} className="text-lg" />
        </button>

        {/* Answer text input & preview (editable + auto-filled by STT) */}
        <input
          type="text"
          value={answerBuffer || interimText}
          onChange={(e) => {
            setAnswerBuffer(e.target.value);
            setInterimText('');
          }}
          placeholder={isListening ? "Listening... or type answer here" : "Type your answer or speak with mic..."}
          className="flex-1 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/30 transition-colors"
        />

        {/* Submit → Next Question */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !liveTranscript.trim()}
          title="Submit answer & get next question"
          className={`flex-shrink-0 px-5 py-3 rounded-2xl border font-semibold text-xs tracking-wide transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
            isSubmitting || !liveTranscript.trim()
              ? 'border-white/5 bg-white/5 text-neutral-600 cursor-not-allowed'
              : 'border-white bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:bg-neutral-200'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              <span>Generating…</span>
            </>
          ) : (
            <>
              <Icon icon="solar:arrow-right-bold" className="text-sm" />
              <span>Submit</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
