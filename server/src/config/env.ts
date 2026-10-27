import { z } from 'zod';

// Load a local .env file when present. Variables already set in the real
// environment (Docker, CI, tests) take precedence over the file.
try {
  process.loadEnvFile();
} catch {
  // No .env file – rely on the process environment.
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/chat'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Set to true when the app is served over HTTPS.
  COOKIE_SECURE: z.stringbool().optional(),
  // Number of reverse proxies in front of the API (nginx in Docker = 1).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Public URL of the web app, used in emailed links (defaults to the first CLIENT_ORIGIN).
  APP_URL: z.url().optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // Outgoing email (password resets). Without SMTP_HOST, emails are printed to the server log.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.stringbool().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Pulse Chat <no-reply@pulse.local>'),

  // Optional bootstrap admin account, created on startup if it does not exist.
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

// Treat empty variables (e.g. `ADMIN_PASSWORD=` from docker-compose) as unset.
const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
const parsed = schema.safeParse(defined);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production',
  APP_URL: (parsed.data.APP_URL ?? parsed.data.CLIENT_ORIGIN.split(',')[0] ?? '').replace(/\/$/, ''),
};

export const isTest = env.NODE_ENV === 'test';
