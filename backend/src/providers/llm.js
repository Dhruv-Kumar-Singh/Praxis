import { env } from '../config/env.js';

export const SYSTEM_PROMPT = `You are Praxis, an expert AI technical interviewer.
Your job is to conduct a realistic mock interview.
Ask one focused question at a time. Wait for the candidate's response before continuing.
Give structured, professional questions matching the role and seniority level.
After the candidate answers, provide brief neutral acknowledgment before the next question.
Do NOT give away answers or be excessively encouraging.`;

/** Mock LLM — streams interviewer questions and generates reports */
const mockLLM = {
  /**
   * Run the interviewer agent and stream the response.
   * @param {object[]} messages - conversation history [{role, content}]
   * @param {object} [opts] - { sessionConfig, onChunk }
   * @returns {Promise<string>} full response text
   */
  async chat(messages, { sessionConfig = {}, onChunk } = {}) {
    const questions = [
      `Hello! Let's begin your interview for the ${sessionConfig.role || 'Senior Software Engineer'} role focusing on ${sessionConfig.topic || 'System Design'}. Can you describe an end-to-end architecture you recently built?`,
      'Great. How did you handle horizontal scaling and state synchronization across multiple regions?',
      'Understood. How would you monitor p99 latency spikes and mitigate cascading downstream failures?',
      'Let us switch to leadership: Tell me about a time you had a strong technical disagreement with a peer or stakeholder. How did you resolve it?',
      'That covers all my core technical questions today. Thank you for your thorough explanations, and best of luck with your next steps!',
    ];

    const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
    const text = questions[Math.min(assistantTurns, questions.length - 1)];

    const words = text.split(' ');
    for (const word of words) {
      await new Promise((r) => setTimeout(r, 20));
      onChunk?.(word + ' ');
    }
    return text;
  },

  /**
   * Generates structured report analysis from transcript.
   * @param {object[]} transcriptChunks
   * @param {object} session
   * @returns {Promise<object>}
   */
  async generateReport(transcriptChunks, session) {
    // Generate deterministic yet sensible mock scores based on transcript volume
    const score = Math.min(94, 80 + (transcriptChunks.length % 15));
    return {
      scores: {
        overall: score,
        technicalKnowledge: score + 1,
        systemDesign: Math.max(70, score - 2),
        communication: Math.min(98, score + 3),
        problemSolving: score,
      },
      strengths: [
        'Clear, articulate explanation of architectural trade-offs',
        'Demonstrated strong awareness of high availability and fault tolerance',
        'Structured answers following STAR methodology for behavioral inquiries',
      ],
      weaknesses: [
        'Could provide deeper quantitative metrics (e.g. throughput numbers, P99 targets)',
        'Slight hesitation when discussing edge-case network partition recovery',
      ],
      summary: `Candidate demonstrated solid competence for the ${session.role || 'Software Engineer'} track on ${session.topic || 'General'}. Clear communication, strong fundamentals, and pragmatic design choices.`,
      verdict: score >= 90 ? 'Strong Hire' : score >= 85 ? 'Hire' : 'Lean Hire',
    };
  },
};

/** Anthropic adapter stub */
const anthropicLLM = {
  async chat(messages, opts) {
    throw new Error('Anthropic LLM adapter not configured. Set PROVIDER_LLM=mock for local dev.');
  },
  async generateReport(transcriptChunks, session) {
    throw new Error('Anthropic LLM adapter not configured. Set PROVIDER_LLM=mock for local dev.');
  },
};

const adapters = {
  mock: mockLLM,
  anthropic: anthropicLLM,
};

export const llmProvider = adapters[env.PROVIDER_LLM] || mockLLM;

