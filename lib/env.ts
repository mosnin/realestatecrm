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
  STRIPE_PRICE_ID: z.string().optional(), // legacy single Solo price (fallback)
  // Pricing V2 plan + top-up price IDs. Read by lib/plans.ts and the checkout
  // routes; previously pulled straight from process.env with no schema entry or
  // boot validation, so a deploy missing one only surfaced at the first failed
  // checkout. Listed here (typed + boot-warned via the warnGroup below).
  STRIPE_PRICE_SOLO: z.string().optional(),
  STRIPE_PRICE_SOLO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  STRIPE_PRICE_TEAM_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS_ANNUAL: z.string().optional(),
  // Per-unit brokerage seat add-on prices (above the plan's included seats).
  // MUST be quantity-billed prices; the flat base prices above are NOT reused.
  STRIPE_PRICE_TEAM_ADDON: z.string().optional(),
  STRIPE_PRICE_TEAM_ADDON_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS_ADDON: z.string().optional(),
  STRIPE_PRICE_TEAM_PLUS_ADDON_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TOPUP_STARTER: z.string().optional(),
  STRIPE_PRICE_TOPUP_GROWTH: z.string().optional(),
  STRIPE_PRICE_TOPUP_POWER: z.string().optional(),
  // Legacy brokerage tier prices still read by the brokerage checkout path.
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),

  // Cron protection
  CRON_SECRET: z.string().optional(),
  CRON_WORKSPACE_RUN_RECOVERY_DISABLED: z.string().optional(),
  CRON_CONVERSATION_TURN_RECOVERY_DISABLED: z.string().optional(),

  // LLM routing
  OPENROUTER_API_KEY: z.string().optional(),

  // Property "Analyze" web research. Both required for the feature to function;
  // absent → the Analyze action returns a "research not configured" state (no
  // crash). TAVILY_API_KEY drives web search for the subject property;
  // FIRECRAWL_API_KEY drives scraping the listing/record pages found.
  TAVILY_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

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
  CHIPPI_CHAT_MODEL: z.string().optional(),
  CHIPPI_REASONING_EFFORT: z.string().optional(),

  // Composio integrations
  COMPOSIO_API_KEY: z.string().optional(),

  // RentCast — real comparables + valuation for the CMA engine (lib/rentcast.ts).
  // Unset → CMA falls back to the workspace's own Property rows and labels the
  // report's data source as "your CRM data" instead of "RentCast market data".
  RENTCAST_API_KEY: z.string().optional(),

  // Ably real-time pub/sub — powers the live activity feed. SERVER-ONLY (never
  // NEXT_PUBLIC). Unset → the feed still works from the DB; only live updates
  // are disabled (publish no-ops, /api/ably/token returns 503).
  ABLY_API_KEY: z.string().optional(),

  // Direct Postgres (Modal side)
  DATABASE_URL: z.string().optional(),

  // App URLs / flags
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_AGENT_AUTO_SEND: z.string().optional(),
  NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED: z.string().optional(),
  NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED: z.string().optional(),

  // Credit metering kill switch (lib/billing/meter.ts). Enforcement is ON by
  // default; set CREDITS_ENFORCED=false to disable the credit gate entirely
  // (emergency rollback — workflows run free, nobody blocked for a zero
  // balance). Any other value (or unset) leaves enforcement ON.
  CREDITS_ENFORCED: z.string().optional(),

  // Tenant-scope observer / enforce (lib/supabase-guard.ts). Optional so CI
  // and preview boot; prod should set TENANT_GUARD=1 (see docs/PROD-STATE.md).
  TENANT_GUARD: z.string().optional(),
  TENANT_GUARD_ENFORCE: z.string().optional(),
  ACCOUNT_DELETION_HARD_DELETE: z.string().optional(),

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

  // ── Read from process.env in code but previously absent from this schema ──
  // All consumed somewhere in app/ or lib/ yet undocumented, so nobody setting
  // up a new deployment would know to set them. Typed here so the environment is
  // fully described in one place.

  // App domain / canonical URLs
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),    // lib/utils.ts, MCP OAuth discovery, Stripe redirect
  NEXT_PUBLIC_SITE_URL: z.string().optional(),       // app/robots.ts, app/sitemap.ts
  NEXT_PUBLIC_APP_ORIGIN: z.string().optional(),     // lib/briefing/delivery.ts (email links)

  // Webhook signing secrets
  CLERK_WEBHOOK_SECRET: z.string().optional(),       // app/api/webhooks/clerk
  COMPOSIO_WEBHOOK_SECRET: z.string().optional(),    // app/api/webhooks/composio
  TELNYX_WEBHOOK_SECRET: z.string().optional(),      // app/api/webhooks/telnyx-voice (legacy shared-secret gate)
  TELNYX_PUBLIC_KEY: z.string().optional(),          // app/api/webhooks/telnyx-voice (Ed25519 signature verification)

  // Telnyx voice
  TELNYX_AGENT_NUMBER: z.string().optional(),        // app/api/calls
  TELNYX_VOICE_CONNECTION_ID: z.string().optional(), // lib/voice.ts

  // Crypto / token signing (each falls back to CLERK_SECRET_KEY if unset)
  ENCRYPTION_KEY: z.string().optional(),             // lib/crypto.ts
  MCP_JWT_SECRET: z.string().optional(),             // app/api/mcp + oauth/token

  // Inngest (scheduled crons + Studio scheduled posts + Composio trigger
  // dispatch + work sessions); SDK reads env
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_CRONS_ENABLED: z.string().optional(),
  INNGEST_CRONS_DISABLED: z.string().optional(),

  // Cloudflare background worker (worker/, docs/WORKER.md): job offload +
  // recurring jobs run on Cloudflare Queues; Redis serves the app cache
  WORKER_URL: z.string().optional(),                 // lib/queue.ts → the Worker's /enqueue + /health
  WORKER_SECRET: z.string().optional(),              // app/api/worker/execute + enqueue auth
  REDIS_URL: z.string().optional(),                  // lib/redis-cache.ts

  // Realtime Voice. The server flag is intentionally not NEXT_PUBLIC: the UI
  // receives only the readiness result. Specialist controls have a second,
  // independently default-off rollout gate.
  REALTIME_VOICE_GATEWAY_ENABLED: z.string().optional(),
  CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED: z.string().optional(),

  // Research Workspace. Both public/server switches plus an explicit Space
  // allowlist must agree before the browser UI or Modal launch path is exposed.
  CHIPPI_RESEARCH_WORKSPACE_ENABLED: z.string().optional(),
  NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED: z.string().optional(),
  CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS: z.string().optional(),
  MODAL_HEADLESS_BROWSER_URL: z.string().optional(),
  CHIPPI_BROWSER_WORKER_SECRET: z.string().optional(),

  // Managed Workspace Runs and their private terminal/follow-up slice. Every
  // switch is optional and default-off; missing runtime configuration is
  // surfaced as a warning only after an operator opts into the feature.
  CHIPPI_WORKSPACE_RUNS_ENABLED: z.string().optional(),
  NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED: z.string().optional(),
  CHIPPI_WORKSPACE_RUNS_SPACE_IDS: z.string().optional(),
  CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED: z.string().optional(),
  CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED: z.string().optional(),
  NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED: z.string().optional(),
  CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS: z.string().optional(),
  CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED: z.string().optional(),
  MODAL_WORKSPACE_RUN_URL: z.string().optional(),
  MODAL_WORKSPACE_RUN_TASK_URL: z.string().optional(),
  CHIPPI_WORKSPACE_MODAL_SECRET: z.string().optional(),
  CHIPPI_WORKSPACE_CALLBACK_SECRET: z.string().optional(),

  // Durable trusted-execution rollout and reversible kill switches.
  AGENT_RUN_POLICY_MODE: z.string().optional(),
  AGENT_RUN_POLICY_SECRET: z.string().optional(),
  DURABLE_SCHEDULE_OCCURRENCES_ENABLED: z.string().optional(),
  WORK_SESSION_ACTIONS_DISABLED: z.string().optional(),

  // Briefing email sender domain
  BRIEF_EMAIL_DOMAIN: z.string().optional(),         // lib/briefing/delivery.ts

  // Web push (VAPID) — push notifications go inert without these
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Sentry client-side trace sampling (server variant: SENTRY_TRACES_SAMPLE_RATE)
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.string().optional(), // instrumentation-client.ts
});

const envSchema = requiredSchema.merge(optionalSchema);

export type Env = z.infer<typeof envSchema>;

/**
 * Optional groups worth a boot-time warning when absent or partially wired.
 * These are not fatal — preview/CI runs legitimately lack them — and restored
 * feature groups stay silent until an operator opts into their rollout flag.
 */
type WarnGroup = {
  label: string;
  keys: Array<keyof Env>;
  /** Default warns only when the whole group is absent; true also catches a partial pair/set. */
  requireAll?: boolean;
  /** Feature-gated groups stay silent until an operator opts into that feature. */
  when?: (env: Env) => boolean;
};

function isSet(env: Env, key: keyof Env): boolean {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function isValue(env: Env, key: keyof Env, expected: string): boolean {
  return env[key]?.trim().toLowerCase() === expected;
}

function envWarn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(message);
}

const warnGroups: WarnGroup[] = [
  { label: 'Stripe billing', keys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  {
    label: 'Stripe plan/top-up prices',
    keys: [
      'STRIPE_PRICE_SOLO', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_TEAM', 'STRIPE_PRICE_TEAM_PLUS',
      'STRIPE_PRICE_TOPUP_STARTER', 'STRIPE_PRICE_TOPUP_GROWTH', 'STRIPE_PRICE_TOPUP_POWER',
    ],
  },
  {
    label: 'Upstash rate limiting and scheduler-heartbeat evidence',
    keys: ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    requireAll: true,
  },
  {
    label: 'Property Analyze web research — the "Analyze" action is inert without BOTH',
    keys: ['TAVILY_API_KEY', 'FIRECRAWL_API_KEY'],
    requireAll: true,
  },
  // Cutover-critical secrets that boot GREEN when missing but then fail
  // silently: without CRON_SECRET every cron route 401s — the Inngest cron
  // functions authenticate to the /api/cron/* routes with it, so sweeps /
  // briefings / SLA stop; without AGENT_INTERNAL_SECRET the Modal agent's
  // callbacks 503 (Chippi goes dark). Kept optional so CI/preview boot
  // without them, but warned individually so a real deploy notices.
  {
    label:
      'Cron auth — the Cloudflare Worker (or explicit Inngest fallback) authenticates to cron routes with CRON_SECRET; every scheduled tick 401s without it',
    keys: ['CRON_SECRET'],
  },
  {
    label: 'Agent↔Modal auth — agent callbacks 503 without AGENT_INTERNAL_SECRET',
    keys: ['AGENT_INTERNAL_SECRET'],
  },
  // Background-execution prerequisites. Each is optional (CI/preview boot
  // without them) but a real deploy that lacks them sees the feature fail
  // SILENTLY: routines stamp 'error' with no dispatch, integration triggers
  // never fire, chat never offloads to Modal. Warned individually so the gap
  // is visible in the boot log instead of being discovered by "it doesn't work".
  {
    label: 'Autonomous runs (routines / triggers / sweeps) — inert without the Modal webhook URL',
    keys: ['MODAL_WEBHOOK_URL'],
  },
  {
    label: 'Background chat executor — chat stays in-process (no detached run) without MODAL_CHAT_URL',
    keys: ['MODAL_CHAT_URL'],
  },
  {
    label: 'Inngest event jobs and optional cron fallback — delivery never runs without both Inngest keys',
    keys: ['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'],
    requireAll: true,
  },
  {
    label: 'Cloudflare background worker — recurring jobs and task offload are inert without WORKER_URL + WORKER_SECRET (deploy worker/, see docs/WORKER.md)',
    keys: ['WORKER_URL', 'WORKER_SECRET'],
    requireAll: true,
  },
  {
    label: 'Redis cache — lib/redis-cache.ts runs cold (every read is a miss) without REDIS_URL',
    keys: ['REDIS_URL'],
  },
  {
    label: 'Composio integrations — connecting apps and receiving triggers needs COMPOSIO_API_KEY',
    keys: ['COMPOSIO_API_KEY'],
  },
  {
    label: 'Realtime Voice — OpenAI transport is required after the gateway is enabled',
    keys: ['REALTIME_VOICE_GATEWAY_ENABLED', 'OPENAI_API_KEY'],
    requireAll: true,
    when: (env) => isValue(env, 'REALTIME_VOICE_GATEWAY_ENABLED', '1'),
  },
  {
    label: 'Realtime Voice floor manager — specialist controls require the Voice gateway',
    keys: ['CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED', 'REALTIME_VOICE_GATEWAY_ENABLED'],
    requireAll: true,
    when: (env) => isValue(env, 'CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED', 'true'),
  },
  {
    label: 'Research Workspace — server/client flags, allowlist, and the dedicated Modal browser must be configured together',
    keys: [
      'CHIPPI_RESEARCH_WORKSPACE_ENABLED',
      'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED',
      'CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS',
      'MODAL_HEADLESS_BROWSER_URL',
      'CHIPPI_BROWSER_WORKER_SECRET',
    ],
    requireAll: true,
    when: (env) =>
      isValue(env, 'CHIPPI_RESEARCH_WORKSPACE_ENABLED', 'true') ||
      isValue(env, 'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED', 'true'),
  },
  {
    label: 'Managed Workspace Runs — rollout flags, allowlist, Modal runtime, callback auth, and private object storage must be configured together',
    keys: [
      'CHIPPI_WORKSPACE_RUNS_ENABLED',
      'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED',
      'CHIPPI_WORKSPACE_RUNS_SPACE_IDS',
      'MODAL_WORKSPACE_RUN_URL',
      'CHIPPI_WORKSPACE_MODAL_SECRET',
      'CHIPPI_WORKSPACE_CALLBACK_SECRET',
      'WASABI_ACCESS_KEY_ID',
      'WASABI_SECRET_ACCESS_KEY',
      'WASABI_BUCKET',
      'WASABI_ENDPOINT',
      'WASABI_REGION',
    ],
    requireAll: true,
    when: (env) =>
      isValue(env, 'CHIPPI_WORKSPACE_RUNS_ENABLED', 'true') ||
      isValue(env, 'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'true'),
  },
  {
    label: 'Workspace Run recovery — recovery requires the base rollout and cron authentication',
    keys: [
      'CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED',
      'CHIPPI_WORKSPACE_RUNS_ENABLED',
      'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED',
      'CRON_SECRET',
    ],
    requireAll: true,
    when: (env) => isValue(env, 'CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED', 'true'),
  },
  {
    label: 'Workspace private terminal/follow-ups — rollout flags, allowlist, and task runtime must be configured together',
    keys: [
      'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
      'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
      'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS',
      'CHIPPI_WORKSPACE_RUNS_ENABLED',
      'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED',
      'MODAL_WORKSPACE_RUN_TASK_URL',
    ],
    requireAll: true,
    when: (env) =>
      isValue(env, 'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', 'true') ||
      isValue(env, 'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', 'true'),
  },
  {
    label: 'Workspace task recovery — scanner requires the follow-up rollout and cron authentication',
    keys: [
      'CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED',
      'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
      'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
      'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS',
      'CRON_SECRET',
    ],
    requireAll: true,
    when: (env) => isValue(env, 'CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED', 'true'),
  },
  {
    label: 'Enforced agent run policy — the shared signing secret must be present in both Vercel and Modal',
    keys: ['AGENT_RUN_POLICY_MODE', 'AGENT_RUN_POLICY_SECRET'],
    requireAll: true,
    when: (env) => env.AGENT_RUN_POLICY_MODE?.trim().toLowerCase() === 'enforce',
  },
];

function warnConditionalInvariants(env: Env): void {
  const allowedValues: Array<{ key: keyof Env; allowed: string[] }> = [
    { key: 'REALTIME_VOICE_GATEWAY_ENABLED', allowed: ['0', '1'] },
    { key: 'CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED', allowed: ['false', 'true'] },
    { key: 'NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', allowed: ['false', 'true'] },
    { key: 'NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', allowed: ['false', 'true'] },
    { key: 'CHIPPI_RESEARCH_WORKSPACE_ENABLED', allowed: ['false', 'true'] },
    { key: 'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED', allowed: ['false', 'true'] },
    { key: 'CHIPPI_WORKSPACE_RUNS_ENABLED', allowed: ['false', 'true'] },
    { key: 'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', allowed: ['false', 'true'] },
    { key: 'CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED', allowed: ['false', 'true'] },
    { key: 'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', allowed: ['false', 'true'] },
    { key: 'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', allowed: ['false', 'true'] },
    { key: 'CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED', allowed: ['false', 'true'] },
    { key: 'TENANT_GUARD', allowed: ['0', '1'] },
    { key: 'TENANT_GUARD_ENFORCE', allowed: ['0', '1'] },
    { key: 'ACCOUNT_DELETION_HARD_DELETE', allowed: ['false', 'true'] },
    { key: 'AGENT_RUN_POLICY_MODE', allowed: ['shadow', 'enforce'] },
    { key: 'DURABLE_SCHEDULE_OCCURRENCES_ENABLED', allowed: ['0', '1', 'false', 'true'] },
    { key: 'CHIPPI_CHAT_RUNTIME', allowed: ['ts', 'modal'] },
    { key: 'CHIPPI_REASONING_EFFORT', allowed: ['low', 'medium', 'high'] },
  ];
  for (const { key, allowed } of allowedValues) {
    if (!isSet(env, key)) continue;
    const normalized = env[key]?.trim().toLowerCase() ?? '';
    if (!allowed.includes(normalized)) {
      envWarn(
        `[env] ${key} has an unsupported value; expected one of: ${allowed.join(', ')}.`,
      );
    }
  }

  const workerReady = isSet(env, 'WORKER_URL') && isSet(env, 'WORKER_SECRET');
  const inngestDispatchReady =
    isSet(env, 'INNGEST_EVENT_KEY') && isSet(env, 'INNGEST_SIGNING_KEY');
  const voiceEnabled = isValue(env, 'REALTIME_VOICE_GATEWAY_ENABLED', '1');
  const floorManagerEnabled = isValue(
    env,
    'CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED',
    'true',
  );
  const researchServerEnabled = isValue(env, 'CHIPPI_RESEARCH_WORKSPACE_ENABLED', 'true');
  const researchClientEnabled = isValue(
    env,
    'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED',
    'true',
  );
  const workspaceServerEnabled = isValue(env, 'CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
  const workspaceClientEnabled = isValue(
    env,
    'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED',
    'true',
  );
  const workspaceEnabled = workspaceServerEnabled || workspaceClientEnabled;
  const followUpsServerEnabled = isValue(
    env,
    'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
    'true',
  );
  const followUpsClientEnabled = isValue(
    env,
    'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
    'true',
  );

  if ((voiceEnabled || workspaceEnabled) && !workerReady && !inngestDispatchReady) {
    envWarn(
      '[env] Durable Work Session dispatch is unavailable. Configure WORKER_URL + WORKER_SECRET ' +
        'for the primary Cloudflare rail, or INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for the legacy fallback.',
    );
  }

  if (floorManagerEnabled && !voiceEnabled) {
    envWarn(
      '[env] CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED=true has no effect until REALTIME_VOICE_GATEWAY_ENABLED=1.',
    );
  }

  if (researchServerEnabled !== researchClientEnabled) {
    envWarn(
      '[env] Research Workspace rollout is split: CHIPPI_RESEARCH_WORKSPACE_ENABLED and ' +
        'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED must both be true or both be false.',
    );
  }

  if (workspaceServerEnabled !== workspaceClientEnabled) {
    envWarn(
      '[env] Managed Workspace rollout is split: CHIPPI_WORKSPACE_RUNS_ENABLED and ' +
        'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED must both be true or both be false.',
    );
  }

  if (followUpsServerEnabled !== followUpsClientEnabled) {
    envWarn(
      '[env] Workspace follow-up rollout is split: CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED and ' +
        'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED must both be true or both be false.',
    );
  }

  if (
    (followUpsServerEnabled || followUpsClientEnabled) &&
    !(workspaceServerEnabled && workspaceClientEnabled)
  ) {
    envWarn(
      '[env] Workspace follow-ups require the base Managed Workspace server and client flags to both be true.',
    );
  }

  if (
    isValue(env, 'CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED', 'true') &&
    !(workspaceServerEnabled && workspaceClientEnabled)
  ) {
    envWarn(
      '[env] CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED=true has no effect until both base Managed Workspace flags are true.',
    );
  }

  if (
    isValue(env, 'CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED', 'true')
    && !(followUpsServerEnabled && followUpsClientEnabled)
  ) {
    envWarn(
      '[env] CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED=true has no effect until both Workspace follow-up flags are true.',
    );
  }

  if (workerReady && env.INNGEST_CRONS_ENABLED?.trim() === '1') {
    envWarn(
      '[env] Scheduler conflict: INNGEST_CRONS_ENABLED must be UNSET while the Cloudflare Worker ' +
        'is configured. Cloudflare remains authoritative and the Inngest cron mirror will not register.',
    );
  }

  if (isSet(env, 'INNGEST_CRONS_ENABLED')) {
    if (env.INNGEST_CRONS_ENABLED?.trim() !== '1') {
      envWarn(
        '[env] INNGEST_CRONS_ENABLED requires exact value 1 for an intentional fallback; otherwise UNSET it.',
      );
    } else {
      const missing = (['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'] as const).filter(
        (key) => !isSet(env, key),
      );
      if (missing.length) {
        envWarn(
          `[env] Inngest cron fallback is enabled but incomplete (missing: ${missing.join(', ')}).`,
        );
      }
    }
  }

  if (
    env.AGENT_RUN_POLICY_MODE?.trim().toLowerCase() === 'enforce' &&
    (env.AGENT_RUN_POLICY_SECRET?.length ?? 0) < 32
  ) {
    envWarn(
      '[env] AGENT_RUN_POLICY_MODE=enforce requires AGENT_RUN_POLICY_SECRET with at least 32 characters.',
    );
  }

  if (
    ['1', 'true'].includes(
      env.DURABLE_SCHEDULE_OCCURRENCES_ENABLED?.trim().toLowerCase() ?? '',
    )
  ) {
    envWarn(
      '[env] DURABLE_SCHEDULE_OCCURRENCES_ENABLED is construction-only: no durable occurrence executor is wired, so 1/true has no runtime effect. Keep it false until selective claim with versioned input, atomic loop-state persistence, an audited unattended executor, opaque leases, and provider idempotency are accepted.',
    );
  }

  if (
    isSet(env, 'WORK_SESSION_ACTIONS_DISABLED') &&
    env.WORK_SESSION_ACTIONS_DISABLED !== '1'
  ) {
    envWarn(
      '[env] WORK_SESSION_ACTIONS_DISABLED treats every non-empty value as enabled; use 1 to disable or UNSET it to enable actions.',
    );
  }

  if (!isValue(env, 'TENANT_GUARD', '1') && process.env.NODE_ENV === 'production') {
    envWarn(
      '[env] TENANT_GUARD is not 1 — unscoped tenant-table reads will not be observed. ' +
        'Set TENANT_GUARD=1 in production (docs/PROD-STATE.md), then TENANT_GUARD_ENFORCE=1 after a clean week.',
    );
  }

  if (isSet(env, 'INNGEST_CRONS_DISABLED') && env.INNGEST_CRONS_DISABLED !== '1') {
    envWarn(
      '[env] INNGEST_CRONS_DISABLED treats every non-empty value as enabled; use 1 to disable or UNSET it.',
    );
  }

  if (
    isSet(env, 'CRON_WORKSPACE_RUN_RECOVERY_DISABLED') &&
    env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED !== '1'
  ) {
    envWarn(
      '[env] CRON_WORKSPACE_RUN_RECOVERY_DISABLED requires exact value 1 to disable recovery; otherwise UNSET it.',
    );
  }

  if (
    isSet(env, 'CRON_CONVERSATION_TURN_RECOVERY_DISABLED') &&
    env.CRON_CONVERSATION_TURN_RECOVERY_DISABLED !== '1'
  ) {
    envWarn(
      '[env] CRON_CONVERSATION_TURN_RECOVERY_DISABLED requires exact value 1 to disable recovery; otherwise UNSET it.',
    );
  }
}

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
    if (group.when && !group.when(env)) continue;
    const missing = group.keys.filter((key) => !isSet(env, key));
    const shouldWarn = group.requireAll
      ? missing.length > 0
      : missing.length === group.keys.length;
    if (shouldWarn) {
      envWarn(
        `[env] ${group.label} is not configured (missing: ${missing.join(', ')}). ` +
          'That feature will be inert until the missing configuration is set.'
      );
    }
  }

  warnConditionalInvariants(env);

  return env;
}

export const env: Env = validateEnv();
