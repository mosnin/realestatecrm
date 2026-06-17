'use client';

/**
 * Subscribe — the commit moment, in the onboarding's voice.
 *
 * This is the same calm, paper-flat, Chippi-speaks aesthetic as the
 * conversational onboarding: the brand-warm wash, a serif line in Chippi's
 * first person, a hairline panel (no shadow, no animated border, no decorative
 * orange), and a soft fade-in arrival. By the time a realtor reaches here
 * they've met Chippi; this should feel like the next sentence, not a pivot to
 * a loud SaaS pricing page.
 *
 * The billing logic is UNCHANGED — auth gate, slug resolution, and the
 * /api/billing/checkout call are byte-for-byte what shipped before. Only the
 * surface changed.
 */

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { motion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { brandOrange } from '@/lib/colors';
import { TITLE_FONT } from '@/lib/typography';
import { PLANS, resolveSelfServePlan, type SelfServePlanId } from '@/lib/plans';
import { readSignupPlan } from '@/lib/signup-plan';

const FEATURES = [
  'I draft every follow-up. You approve.',
  'AI lead scoring on every applicant.',
  'Intake links that qualify leads for you.',
  'Tours scheduled and booked.',
  'Unlimited contacts and deals.',
  'Notes, calendar, and analytics.',
  'Connect Gmail, Slack, and more.',
  'MCP access for Claude and Cursor.',
];

function SubscribeContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const [slug, setSlug] = useState(searchParams.get('slug') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Did the URL explicitly pin the tier? If so it wins and we never override it.
  const urlPlan = searchParams.get('plan');
  const urlPinnedPlan = urlPlan === 'solo' || urlPlan === 'pro';

  // The tier to show + charge. Resolution order, most-trusted first:
  //   1. ?plan= on the URL (explicit, e.g. a re-entry from the cancel link).
  //   2. The plan persisted on the user's Space at onboarding (the carrier
  //      that survives Clerk's redirects), fetched from /api/auth/me below.
  //   3. The sessionStorage hint captured at the marketing CTA (transport).
  //   4. Solo — the historical default for direct visitors.
  const [plan, setPlan] = useState<SelfServePlanId>(() =>
    urlPinnedPlan ? (urlPlan as SelfServePlanId) : readSignupPlan() ?? 'solo',
  );
  const planDef = PLANS[plan];

  // Billing cadence + whether annual is purchasable for each self-serve plan.
  // annualEnabled is server-derived (Stripe annual price ids are server-only
  // env), delivered by /api/auth/me below; until it loads we assume no annual so
  // the toggle never flashes an option the checkout would refuse.
  const [cadence, setCadence] = useState<'monthly' | 'annual'>('monthly');
  const [annualEnabled, setAnnualEnabled] = useState<Record<SelfServePlanId, boolean>>({
    solo: false,
    pro: false,
  });
  const annualOk = annualEnabled[plan];
  // The cadence actually used (pinned to monthly when annual isn't available for
  // the shown plan, e.g. after switching plans or before the signal loads).
  const effectiveCadence: 'monthly' | 'annual' = annualOk && cadence === 'annual' ? 'annual' : 'monthly';
  const isAnnual = effectiveCadence === 'annual';
  const monthlyPrice = planDef.priceMonthly;
  const annualPerMonth = Math.round(monthlyPrice * 0.8);
  const displayPrice = isAnnual ? annualPerMonth : monthlyPrice;

  // Resolve slug, the persisted Space.plan, and annual availability from the
  // user's account. We hit /api/auth/me on load — the common gate path arrives
  // as /subscribe?slug=… (slug set, no plan), so the persisted plan (the durable
  // carrier) still needs adopting, and annualEnabled is ALWAYS server-derived,
  // so we fetch it even when slug + plan are already pinned.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!slug && d.slug) setSlug(d.slug);
        if (!urlPinnedPlan && d.plan) setPlan(resolveSelfServePlan(d.plan));
        if (d.annualEnabled) setAnnualEnabled(d.annualEnabled);
      })
      .catch(() => {});
  }, [slug, isLoaded, isSignedIn, urlPinnedPlan, urlPlan]);

  // Redirect unauthenticated users.
  if (isLoaded && !isSignedIn) {
    window.location.href = '/login/realtor';
    return null;
  }

  async function handleStartTrial() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, plan, cadence: effectiveCadence }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        setError(data.error || 'Failed to start checkout');
        setLoading(false);
      }
    } catch {
      setError("That didn't go through. Usually temporary.");
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      {/* Brand-warm wash — same as the onboarding surface, one of the five
          sanctioned orange contexts. */}
      <div
        aria-hidden
        className={brandOrange(
          'LOGO',
          'pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-orange-50/70 via-background to-orange-50/50 dark:from-orange-500/[0.04] dark:via-background dark:to-orange-500/[0.03]',
        )}
      />

      <motion.div
        className="relative z-10 w-full max-w-md"
        initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8 flex justify-center">
          <BrandLogo className="h-6 opacity-90" alt="Chippi" />
        </div>

        {/* Chippi speaks — the focal element. */}
        <header className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">Chippi {planDef.label}.</p>
          <h1 className="text-3xl leading-tight tracking-tight sm:text-[2.5rem]" style={TITLE_FONT}>
            Let&apos;s keep working together.
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            Everything you set up stays exactly as it is. Start your free trial and I&apos;ll keep going.
          </p>
        </header>

        {/* Paper-flat panel — hairline border, no shadow. */}
        <div className="mt-8 rounded-xl border border-border/70 bg-card p-6 sm:p-7">
          {/* Monthly/Annual choice — only when annual is purchasable for this
              tier (server-derived). The chosen cadence is sent to checkout. */}
          {annualOk && (
            <div className="mb-5 flex justify-center">
              <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setCadence('monthly')}
                  className={
                    'rounded-full px-3.5 py-1 text-xs transition-colors ' +
                    (!isAnnual ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')
                  }
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setCadence('annual')}
                  className={
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs transition-colors ' +
                    (isAnnual ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground')
                  }
                >
                  Annual
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Price — from lib/plans.ts (single source of truth), keyed to the
              tier the buyer chose so it can't drift from what's charged. Annual
              shows the discounted monthly-equivalent; the real charge is the
              annual Stripe price. */}
          <div className="flex items-end justify-center gap-1.5">
            <span className="text-[2.75rem] leading-none tabular-nums tracking-tight" style={TITLE_FONT}>
              ${displayPrice}
            </span>
            <span className="mb-1 text-base text-muted-foreground">/mo</span>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {isAnnual
              ? `7 days free, then $${displayPrice * 12} a year. Cancel anytime.`
              : `7 days free, then $${monthlyPrice} a month. Cancel anytime.`}
          </p>

          {/* Features */}
          <ul className="mt-6 space-y-3 border-t border-border/60 pt-6">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm leading-snug text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
                  <Check size={11} className="text-foreground/70" />
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={handleStartTrial}
            disabled={loading || !slug}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Taking you to checkout.' : 'Start your 7 days free'}
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Card required to start — you won&apos;t be charged until your trial ends. Cancel anytime.
          </p>
        </div>

        {/* Plans + already subscribed */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need more?{' '}
          <a href="/pricing" className="text-foreground underline-offset-2 hover:underline">
            See all plans
          </a>
          {' · '}
          Already subscribed?{' '}
          <a
            href={slug ? `/s/${slug}/billing` : '#'}
            className="text-foreground underline-offset-2 hover:underline"
          >
            Manage billing
          </a>
        </p>
      </motion.div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
}
