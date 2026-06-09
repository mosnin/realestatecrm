import 'server-only';
import { z } from 'zod';

/**
 * Boot-time environment validation.
 *
 * server-only — this module must NEVER be imported into a client component.
 * It is wired into `instrumentation.ts` `register()` so it runs once when the
 * Node.js server runtime boots, and fails fast (process-killing throw) if a
 * genuinely-required variable is missing.
 *
 * Two tiers:
 *   - REQUIRED: the app cannot serve a single authenticated request without
 *     these. The CI/build harness sets exactly this set as placeholders, so
 *     the hard-required schema below is satisfied by those placeholders alone.
 *   - OPTIONAL-WITH-WARNING: features degrade or go inert without them, but the
 *     server can still boot (preview deploys, CI, partial environments). We log
 *     a single grouped warning rather than crash.
 *
 * Be conservative: anything that might legitimately be absent in preview/CI is
 * optional. We do not hard-require Stripe, Upstash, Modal, etc. — they are
 * feature-gated at their call sites and warned about here.
 */

// ── REQUIRED — must be present in every real environment (and in CI) ─────────
const requiredSchema = z.object({
  // Supabase (the database every request touches)
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // OpenAI (powers every interactive chat turn + embeddings)
  OPENAI_API_KEY: z.string().min(1),

  // Clerk (realtor authentication — no request is served without it)
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
});

// ── OPTIONAL — feature-gated; absence degrades a feature, not the boot ───────
const optionalSchema = z.object({
  // Upstash KV — rate limiting
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),

  // Stripe billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Legacy single price — Solo's fallback until the tiered products exist.
  STRIPE_PRICE_ID: z.string().optional(),
  // Tier price IDs (lib/plans.ts) — set these when the new Stripe products are
  // created. Solo $97 / Pro $197 bill the Space; Team $497 / Team Plus $897
  // bill the Brokerage.
  STRIPE_PRICE_SOLO: z.string().optional(),
  STRIPE_PRICE_SOLO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  STRIPE_PRICE_TEAM_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS_ANNUAL: z.string().optional(),

  // Cron protection
  CRON_SECRET: z.string().optional(),

  // LLM routing
  OPENROUTER_API_KEY: z.string().optional(),

  // Email / SMS
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_FROM_NUMBER: z.string().optional(),

  // Object storage (Wasabi S3)
  WASABI_ACCESS_KEY_ID: z.string().optional(),
  WASABI_SECRET_ACCESS_KEY: z.string().optional(),
  WASABI_BUCKET: z.string().optional(),
  WASABI_ENDPOINT: z.string().optional(),
  WASABI_REGION: z.string().optional(),
  WASABI_PUBLIC_BASE_URL: z.string().optional(),

  // Media generation
  FAL_KEY: z.string().optional(),

  // Google Calendar / Maps
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string().optional(),

  // Modal agent plumbing
  MODAL_CHAT_URL: z.string().optional(),
  MODAL_WEBHOOK_URL: z.string().optional(),
  MODAL_SWARM_URL: z.string().optional(),
  AGENT_INTERNAL_SECRET: z.string().optional(),
  AGENT_IMMEDIATE_EVENTS: z.string().optional(),
  CHIPPI_CHAT_RUNTIME: z.string().optional(),

  // Composio integrations
  COMPOSIO_API_KEY: z.string().optional(),

  // Direct Postgres (Modal side)
  DATABASE_URL: z.string().optional(),

  // App URLs / flags
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_AGENT_AUTO_SEND: z.string().optional(),

  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // FirstPromoter affiliate
  FIRST_PROMOTER_API_KEY: z.string().optional(),
  FIRST_PROMOTER_ACCOUNT_ID: z.string().optional(),
  NEXT_PUBLIC_FIRST_PROMOTER_CID: z.string().optional(),

  // Client portal
  CLIENT_AUTH_SECRET: z.string().optional(),
  NEXT_PUBLIC_CLIENTS_URL: z.string().optional(),
});

const envSchema = requiredSchema.merge(optionalSchema);

export type Env = z.infer<typeof envSchema>;

/**
 * Optional groups worth a boot-time warning when entirely unset. These are not
 * fatal — preview/CI runs legitimately lack them — but an operator running a
 * real deploy almost certainly wants them, so we surface a single clear note.
 */
const warnGroups: Array<{ label: string; keys: Array<keyof Env> }> = [
  { label: 'Stripe billing', keys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  { label: 'Upstash rate limiting', keys: ['KV_REST_API_URL', 'KV_REST_API_TOKEN'] },
];

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => i.path.join('.'))
      .filter((p, idx, arr) => arr.indexOf(p) === idx);
    // Fail fast — kill the boot with an explicit, actionable list.
    throw new Error(
      'Environment validation failed. Missing or invalid required variables:\n' +
        missing.map((m) => `  - ${m}`).join('\n') +
        '\n\nSet these in your Vercel project settings or .env.local file. ' +
        'See .env.example for the full reference.'
    );
  }

  const env = parsed.data;

  // Non-fatal warnings for unset optional feature groups.
  for (const group of warnGroups) {
    const allUnset = group.keys.every((k) => !env[k]);
    if (allUnset) {
      // eslint-disable-next-line no-console
      console.warn(
        `[env] ${group.label} is not configured (${group.keys.join(', ')}). ` +
          'That feature will be inert until these are set.'
      );
    }
  }

  return env;
}

export const env: Env = validateEnv();
