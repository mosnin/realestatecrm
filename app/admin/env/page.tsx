/**
 * app/admin/env/page.tsx — runtime environment diagnostic.
 *
 * One idea: "What does the LIVE server actually see?"
 *
 * A platform-admin, read-only view of which environment variables are present
 * in the running deployment — PRESENCE ONLY, never the secret values. Born from
 * the recurring "I set it in Vercel but it still says missing" class of bug
 * (Vercel only injects env into deployments built AFTER the change, and a blank
 * value reads as missing). This page reflects THIS deployment's runtime env, so
 * it ends the guessing.
 *
 * Server component, force-dynamic so it never caches a stale snapshot. Admin is
 * already enforced by app/admin/layout.tsx (requireAdmin); we re-assert here.
 */

import { requireAdmin } from '@/lib/admin';
import { PLANS, type PlanId } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';

export const dynamic = 'force-dynamic';

/** A var is "set" only if it's a non-empty, non-whitespace string. */
function isSet(key: string): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

/** Stripe price ids should look like `price_…`; anything else is suspect. */
function priceStatus(v: string | null): 'ok' | 'missing' | 'suspect' {
  if (!v || v.trim().length === 0) return 'missing';
  return v.startsWith('price_') ? 'ok' : 'suspect';
}

const PAID_TIERS: PlanId[] = ['solo', 'pro', 'team', 'team_plus'];

const SERVICE_GROUPS: { label: string; vars: string[]; note?: string }[] = [
  { label: 'Core', vars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY', 'ENCRYPTION_KEY', 'CRON_SECRET'] },
  { label: 'Billing — Stripe', vars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  { label: 'SMS / Voice — Telnyx', vars: ['TELNYX_API_KEY', 'TELNYX_FROM_NUMBER', 'TELNYX_VOICE_CONNECTION_ID', 'TELNYX_AGENT_NUMBER'] },
  { label: 'Email — Resend', vars: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'] },
  { label: 'Web push — VAPID', vars: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] },
  { label: 'AI models', vars: ['OPENAI_API_KEY', 'OPENROUTER_API_KEY'] },
  { label: 'Property research', vars: ['RENTCAST_API_KEY', 'TAVILY_API_KEY', 'FIRECRAWL_API_KEY'] },
  { label: 'Realtime — Ably', vars: ['ABLY_API_KEY'] },
  { label: 'Agent — Modal', vars: ['MODAL_WEBHOOK_URL', 'MODAL_CHAT_URL', 'AGENT_INTERNAL_SECRET'] },
  { label: 'Integrations — Composio', vars: ['COMPOSIO_API_KEY', 'COMPOSIO_WEBHOOK_SECRET'] },
  { label: 'Storage — Wasabi', vars: ['WASABI_ACCESS_KEY_ID', 'WASABI_SECRET_ACCESS_KEY', 'WASABI_ENDPOINT', 'WASABI_REGION', 'WASABI_BUCKET'] },
  { label: 'Cache — KV / Redis', vars: ['KV_REST_API_URL', 'KV_REST_API_TOKEN'] },
  { label: 'Calendar — Google', vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { label: 'Error tracking — Sentry', vars: ['SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN', 'NEXT_PUBLIC_SENTRY_DSN'] },
  { label: 'Affiliate — FirstPromoter', vars: ['FIRST_PROMOTER_API_KEY', 'FIRST_PROMOTER_ACCOUNT_ID'] },
];

function Pill({ tone, children }: { tone: 'ok' | 'bad' | 'warn'; children: React.ReactNode }) {
  const styles =
    tone === 'ok'
      ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
      : tone === 'warn'
        ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
        : 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15';
  return (
    <span className={cn('inline-flex text-[11px] font-medium rounded-full px-2 py-0.5 flex-shrink-0', styles)}>
      {children}
    </span>
  );
}

function PriceCell({ status }: { status: 'ok' | 'missing' | 'suspect' }) {
  if (status === 'ok') return <Pill tone="ok">set</Pill>;
  if (status === 'suspect') return <Pill tone="warn">not a price_ id</Pill>;
  return <Pill tone="bad">missing</Pill>;
}

export default async function AdminEnvPage() {
  await requireAdmin();

  const planRows = PAID_TIERS.map((id) => ({
    id,
    label: PLANS[id].label,
    monthly: priceStatus(PLANS[id].stripePriceMonthly),
    annual: priceStatus(PLANS[id].stripePriceAnnual),
  }));
  const missingMonthly = planRows.filter((r) => r.monthly !== 'ok').map((r) => r.label);

  const statusSentence =
    missingMonthly.length === 0
      ? 'Every paid tier has a monthly Stripe price id. Invoices will map to a plan and grant credits.'
      : `${missingMonthly.join(', ')} ${missingMonthly.length === 1 ? 'is' : 'are'} missing a monthly Stripe price id — their invoices won't map to a plan and credit grants will be SKIPPED.`;

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>System.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Environment
        </h1>
        <p className={BODY_MUTED}>
          What this running deployment actually sees — presence only, never the values. Reflects the
          live runtime env at {new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC.
        </p>
      </header>

      {/* ── Plan prices (the team_plus class of bug) ───────────────────────── */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Stripe plan prices</p>
        <p className={cn('text-xs', missingMonthly.length === 0 ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400')}>
          {statusSentence}
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2 bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Tier</span>
            <span className="text-right">Monthly</span>
            <span className="text-right">Annual</span>
          </div>
          <div className="divide-y divide-border">
            {planRows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-4 py-2.5 text-sm">
                <span className="font-medium">
                  {r.label} <span className="text-muted-foreground font-normal">({r.id})</span>
                </span>
                <span className="text-right"><PriceCell status={r.monthly} /></span>
                <span className="text-right"><PriceCell status={r.annual} /></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Service configuration ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Service configuration</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_GROUPS.map((group) => (
            <div key={group.label} className="rounded-lg border border-border overflow-hidden">
              <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/40">
                {group.label}
              </p>
              <div className="divide-y divide-border">
                {group.vars.map((key) => {
                  const set = isSet(key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <code className="truncate text-foreground/80">{key}</code>
                      {set ? <Pill tone="ok">set</Pill> : <Pill tone="bad">missing</Pill>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground max-w-2xl">
        Note: Vercel only injects env changes into deployments built <strong>after</strong> the change —
        if you just added or edited a variable, redeploy before trusting this. A blank value reads as
        “missing”. <code>NEXT_PUBLIC_*</code> vars are baked at build time; the rest are read at runtime.
        This page never prints secret values.
      </p>
    </div>
  );
}
