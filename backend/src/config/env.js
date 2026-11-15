import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('localhost'),
  JWT_SECRET: z.string().min(32).default('change_me_32_chars_minimum_secret_key_12345'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  JWT_INTERVIEW_EXPIRES: z.string().default('5m'),
  REPO_DRIVER: z.enum(['memory']).default('memory'),
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
