import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import gsap from 'gsap';
import Background from '../components/Background';
import LiveInterviewSection from '../components/LiveInterviewSection';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { sessionsApi } from '../api/client';

export default function HomePage({ userName = 'Alex', onViewReport }) {
  const [topicInput, setTopicInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);

  // Real interview history from DB
  const [previousInterviews, setPreviousInterviews] = useState([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);

  const fileInputRef = useRef(null);
  const greetingRef = useRef(null);
  const hooklineRef = useRef(null);
  const composerRef = useRef(null);
  const scrollCueRef = useRef(null);

  // Speech-to-Text: mic button fills the textarea with spoken words
  const { isListening, startListening, stopListening, isSupported: sttSupported } =
    useSpeechToText({ onTranscript: (text) => setTopicInput(text) });

  // ── Load completed past interviews from DB ─────────────────────────────────
  const loadInterviews = useCallback(async () => {
    setInterviewsLoading(true);
    try {
      const { items = [] } = await sessionsApi.list({ limit: 20 });
      // Only sessions with a report
      const done = items.filter((s) =>
        s.status === 'feedback_ready' || s.status === 'completed'
      );
      if (!done.length) {
        setPreviousInterviews([]);
        return;
      }
      // Fetch reports in parallel
      const withReports = await Promise.all(
        done.map(async (session) => {
          try {
            const report = await sessionsApi.getReport(session.id);
            return { session, report };
          } catch {
            return { session, report: null };
          }
        })
      );
      // Map to card shape
      const cards = withReports
        .filter(({ report }) => report)
        .map(({ session, report }) => {
          const overall = report.overall ?? 0;
          const verdict =
            report.verdict ||
            (overall >= 90 ? 'Strong Hire' :
            overall >= 75 ? 'Hire' :
            overall >= 60 ? 'Lean Hire' : 'No Hire');
          const created = session.createdAt
            ? new Date(session.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
            : '—';
          const durationMin = session.expectedDurationMin ?? 30;
          return {
            id: session.id,
            title: `${session.topic} — AI Technical Interview`,
            role: session.role || `${session.topic} Engineer`,
            company: 'Praxis AI',
            date: created,
            duration: `${durationMin} mins`,
            badge: `CONFIDENCE ${overall}%`,
            type: session.topic,
            score: overall,
            verdict,
            synopsis: report.summary || 'AI-scored technical interview session.',
            breakdown: report.questionsDetail?.length > 0
              ? report.questionsDetail.map((q) => ({
                  label: q.title,
                  score: q.score,
                }))
              : [
                  { label: 'Technical Problem Solving', score: report.scores?.correctness ?? overall },
                  { label: 'Communication', score: report.scores?.communication ?? overall },
                  { label: 'Depth & Trade-offs', score: report.scores?.depth ?? overall },
                ],
            strengths: report.strengths ?? [],
            improvements: report.weaknesses ?? [],
            questions: (report.questionsDetail ?? []).map((q) => ({
              title: q.title,
              score: q.score,
              feedback: q.feedback,
            })),
            // carry full report for onViewReport
            _session: session,
            _report: report,
          };
        });
      setPreviousInterviews(cards);
    } catch (err) {
      console.warn('Could not load previous interviews:', err);
      setPreviousInterviews([]);
    } finally {
      setInterviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInterviews();
  }, [loadInterviews]);

  // Soft entrance animation matching landing page hero
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.fromTo(
      [greetingRef.current, hooklineRef.current, composerRef.current, scrollCueRef.current],
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.85, stagger: 0.12, ease: 'power3.out' }
    );
  }, []);

  // Global intersection observer for fade-up scroll reveal (re-runs when cards load)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: '0px', threshold: 0.1 }
    );

    document.querySelectorAll('.fade-up, .scale-in').forEach((el) => {
      if (!el.classList.contains('visible')) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [interviewsLoading, previousInterviews.length]);

  // Handle file picker selection
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files).map((file, idx) => ({
        id: `${Date.now()}-${idx}`,
        name: file.name,
        size: `${Math.round(file.size / 1024)} KB`,
      }));
      setAttachedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeFile = (id) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="min-h-screen text-neutral-200 antialiased selection:bg-white/20 selection:text-white relative bg-black">
      {/* Background texture matching landing page */}
      <Background />

      {/* ============================================================ */}
      {/* 1. CENTERED HERO STATE (INITIAL VIEWPORT — 100VH) */}
      {/* ============================================================ */}
      <section className="h-screen min-h-[640px] flex flex-col items-center justify-center px-6 pt-24 pb-12 relative select-none">
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center">
          {/* Greeting: Hi, {userName} — large, font-medium, matching landing hero headline */}
          <h1
            ref={greetingRef}
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-white mb-3 opacity-0"
            style={{ textShadow: '0 4px 40px rgba(0,0,0,0.5)' }}
          >
            Hi, {userName}
          </h1>

          {/* Short hookline beneath greeting in muted text-neutral-400 style */}
          <p
            ref={hooklineRef}
            className="text-base sm:text-lg text-neutral-400 font-light mb-8 max-w-xl leading-relaxed opacity-0"
          >
            What would you like to practice today?
          </p>

          {/* Prompt / Composer Bar: wide, pill or rounded-2xl glass-panel treatment */}
          <div
            ref={composerRef}
            className="w-full rounded-2xl sm:rounded-3xl p-3 sm:p-4 bg-white/[0.03] backdrop-blur-xl border border-white/10 transition-all duration-300 focus-within:border-white/25 focus-within:shadow-[0_0_30px_rgba(255,255,255,0.12)] glass-panel opacity-0 text-left"
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.md"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Attached file pills display */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {attachedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-neutral-200"
                  >
                    <Icon icon="solar:document-text-bold-duotone" className="text-emerald-400 text-xs" />
                    <span className="font-mono text-[11px] max-w-[150px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="text-neutral-500 hover:text-white transition-colors ml-1 cursor-pointer"
                    >
                      <Icon icon="solar:close-circle-bold" className="text-xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea for typing topic or instructions */}
            <textarea
              rows={2}
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Enter a topic or upload your syllabus to start practicing..."
              className="w-full bg-transparent text-neutral-100 placeholder-neutral-500 text-sm sm:text-base font-normal outline-none resize-none px-2 py-1 leading-relaxed"
            />

            {/* Composer bottom toolbar: '+' attach button + send action */}
            <div className="flex items-center justify-between pt-2 px-1 border-t border-white/[0.04]">
              {/* '+' button on the left for attaching documents */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 rounded-full border border-white/15 hover:border-white/35 bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition-all cursor-pointer active:scale-95 shadow-sm"
                  title="Attach syllabus, notes, or resume (PDF, DOC, Images)"
                >
                  <Icon icon="solar:add-linear" className="text-lg" />
                </button>

                {/* 🎤 Mic button — Speech-to-Text */}
                {sttSupported && (
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 shadow-sm ${
                      isListening
                        ? 'border-red-400/50 bg-red-400/10 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse'
                        : 'border-white/15 hover:border-white/35 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white'
                    }`}
                    title={isListening ? 'Stop recording' : 'Speak your topic'}
                  >
                    <Icon
                      icon={isListening ? 'solar:microphone-bold' : 'solar:microphone-linear'}
                      className="text-lg"
                    />
                  </button>
                )}

                <span className="text-[11px] font-mono text-neutral-500 hidden sm:inline">
                  {isListening
                    ? 'Listening...'
                    : attachedFiles.length > 0
                    ? `${attachedFiles.length} file attached`
                    : 'Attach syllabus or notes'}
                </span>
              </div>

              {/* Send / start session button */}
              <button
                type="button"
                onClick={() => {
                  document.getElementById('live-interview-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  topicInput.trim() || attachedFiles.length > 0
                    ? 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                    : 'bg-white/10 text-neutral-500 hover:text-neutral-400'
                }`}
                title="Start session"
              >
                <Icon icon="solar:arrow-up-linear" className="text-base stroke-2" />
              </button>
            </div>
          </div>
        </div>

        {/* Scroll indicator hinting at Live Interview Section */}
        <div
          ref={scrollCueRef}
          onClick={() => {
            document.getElementById('live-interview-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer group opacity-0"
          title="Scroll to Live AI Interview"
        >
          <span className="text-[10px] font-mono tracking-widest uppercase">Start Live AI Interview</span>
          <Icon icon="solar:alt-arrow-down-linear" className="text-xs group-hover:translate-y-1 transition-transform" />
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. REALTIME LIVEKIT VOICE & CHAT INTERVIEW SECTION */}
      {/* ============================================================ */}
      <section id="live-interview-section" className="relative z-10 py-12 bg-black border-t border-white/[0.04]">
        <LiveInterviewSection
          initialTopic={topicInput}
          onViewReport={onViewReport}
          onInterviewCompleted={loadInterviews}
        />
      </section>

      {/* ============================================================ */}
      {/* 3. SCROLL-REVEALED SECTION — PREVIOUS INTERVIEWS */}
      {/* ============================================================ */}
      <section id="previous-interviews" className="relative z-10 py-24 md:py-32 bg-black border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          {/* Section Header */}
          <div className="flex flex-col items-start mb-16 fade-up">
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4 text-white">
              Previous Interviews
            </h2>
            <p className="text-base text-neutral-400 max-w-xl font-light leading-relaxed">
              Review your recorded performance, AI scores, and detailed competency breakdowns.
            </p>
          </div>

          {/* Loading skeleton */}
          {interviewsLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-3xl border border-white/10 bg-[#050505] p-7 md:p-8 animate-pulse h-56 flex flex-col justify-between">
                  <div>
                    <div className="h-3 w-28 bg-white/10 rounded mb-4" />
                    <div className="h-5 w-3/4 bg-white/10 rounded mb-2" />
                    <div className="h-4 w-full bg-white/5 rounded mb-1" />
                    <div className="h-4 w-5/6 bg-white/5 rounded" />
                  </div>
                  <div className="h-3 w-24 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!interviewsLoading && previousInterviews.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center fade-up">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Icon icon="solar:clipboard-list-bold-duotone" className="text-3xl text-neutral-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No completed interviews yet</h3>
              <p className="text-sm text-neutral-400 max-w-sm font-light">
                Complete your first interview above. After AI evaluation finishes, your results will appear here.
              </p>
            </div>
          )}

          {/* Responsive Card Grid */}
          {!interviewsLoading && previousInterviews.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {previousInterviews.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onViewReport && onViewReport(item)}
                  className="rounded-3xl border border-white/10 bg-[#050505] p-7 md:p-8 relative overflow-hidden group hover:border-white/20 transition-all duration-500 hover:-translate-y-1 fade-up shadow-[0_4px_30px_rgba(0,0,0,0.5)] cursor-pointer flex flex-col justify-between"
                >
                  {/* Background grid accent on hover */}
                  <div className="absolute inset-0 bg-grid opacity-[0.03] pointer-events-none group-hover:opacity-[0.1] transition-opacity" />

                  <div>
                    {/* Top row: score badge + date */}
                    <div className="flex items-center justify-between gap-3 mb-6 relative z-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-mono text-white uppercase tracking-widest">
                          {item.badge}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                        {item.date}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg sm:text-xl font-semibold text-white tracking-tight group-hover:text-neutral-100 transition-colors mb-2.5 relative z-10">
                      {item.title}
                    </h3>

                    {/* Synopsis */}
                    <p className="text-xs sm:text-sm text-neutral-400 font-light leading-relaxed mb-6 line-clamp-3 relative z-10">
                      {item.synopsis}
                    </p>

                    {/* Score bar mini preview */}
                    <div className="relative z-10 flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-emerald-400 flex-shrink-0">{item.score}%</span>
                      <span className="text-[10px] font-mono text-neutral-500 flex-shrink-0">{item.verdict}</span>
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.05] text-xs font-mono text-neutral-500 group-hover:text-white transition-colors relative z-10">
                    <span>{item.duration}</span>
                    <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      VIEW DETAILS →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
