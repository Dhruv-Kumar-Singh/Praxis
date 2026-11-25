import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('localhost'),
  JWT_SECRET: z.string().min(32).default('change_me_32_chars_minimum_secret_key_12345'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  JWT_INTERVIEW_EXPIRES: z.string().default('5m'),
  REPO_DRIVER: z.enum(['memory', 'firebase', 'mongo']).default('mongo'),

  // ── MongoDB Configuration ──────────────────────────────────────────────────
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/praxis'),

  // ── Orchestrator Internal API ──────────────────────────────────────────────
  ORCHESTRATOR_URL: z.string().default('http://127.0.0.1:8000'),
  ORCHESTRATOR_INTERNAL_SECRET: z.string().default('praxis_internal_dev_secret_32char_minimum'),

  // ── LiveKit Cloud ──────────────────────────────────────────────────────────
  LIVEKIT_URL: z.string().default('wss://praxis-u12f8rl1.livekit.cloud'),
  LIVEKIT_API_KEY: z.string().default('APIc4p6X9hGrVeh'),
  LIVEKIT_API_SECRET: z.string().default('XjegJFtoFVd8TH3fSAuUh3s2hkyYcXo8Fx9P0K5nbHU'),

  // ── Firebase Realtime Database ─────────────────────────────────────────────
  FIREBASE_DATABASE_URL: z
    .string()
    .url()
    .default('https://praxis-b8ea5-default-rtdb.firebaseio.com/'),

  /**
   * Full service-account JSON as a single-line string.
   * Required when REPO_DRIVER=firebase unless GOOGLE_APPLICATION_CREDENTIALS is set.
   * Leave blank to fall back to Application Default Credentials.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  PROVIDER_STT: z.enum(['mock', 'deepgram']).default('mock'),
  PROVIDER_LLM: z.enum(['mock', 'anthropic']).default('mock'),
  PROVIDER_TTS: z.enum(['mock', 'elevenlabs']).default('mock'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
  SESSION_MAX_DURATION_MS: z.coerce.number().default(3600000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
