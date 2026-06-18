/**
 * IntegrationsPage, the /integrations body on the bold-canvas system.
 *
 * One idea: connect your tools once, and Chippi works inside them. The
 * owner-provided IntegrationHero above carries the opener (50+ apps, two
 * minutes to connect), so no second hero here, just a three-step "how it
 * works" in white soft-shadow cards → the catalog rendered straight from
 * `lib/integrations/catalog.ts` (the source of truth, no invented entries)
 * → a closing CTA. Each app reads as a letter monogram (no fabricated brand
 * logos).
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/marketing/site/reveal';
import { EyebrowChip } from '@/components/marketing/site/section';
import {
  INTEGRATIONS,
  type IntegrationApp,
  type IntegrationCategory,
} from '@/lib/integrations/catalog';

const CATEGORY_ORDER: { key: IntegrationCategory; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'social', label: 'Social' },
  { key: 'ads', label: 'Ads' },
  { key: 'payments', label: 'Payments' },
  { key: 'docs', label: 'Docs & sheets' },
  { key: 'storage', label: 'Storage' },
  { key: 'crm', label: 'CRM' },
  { key: 'real-estate', label: 'Real estate' },
  { key: 'docs-sign', label: 'Signing' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'forms', label: 'Forms' },
  { key: 'video', label: 'Video & meetings' },
];

function grouped(): { key: IntegrationCategory; label: string; apps: IntegrationApp[] }[] {
  return CATEGORY_ORDER.map(({ key, label }) => ({
    key,
    label,
    apps: INTEGRATIONS.filter((a) => a.category === key),
  })).filter((g) => g.apps.length > 0);
}

const TOTAL = INTEGRATIONS.length;

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Connect your tools',
    body: 'Pick the apps you already work in and authorize each one in about two minutes. Chippi connects through Composio over OAuth, no keys to copy, no scripts to wire.',
  },
  {
    n: '02',
    title: 'Chippi uses them as tools',
    body: 'Once connected, each app becomes a tool Chippi can call mid-task. Ask it to chase a lead or book a tour and it reaches for the right one on its own.',
  },
  {
    n: '03',
    title: 'Data flows both ways',
    body: 'Chippi pulls what it needs out of your tools and writes results back in. Anything that posts or sends waits for your approval first.',
  },
];

export function IntegrationsPage() {
  const groups = grouped();

  return (
    <>
      {/* How it works, three white soft-shadow cards */}
      <section className="mt-4 px-4 sm:mt-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <EyebrowChip>How it works</EyebrowChip>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Connect once. Chippi does the reaching.
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.05}>
                <div className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-8">
                  <span className="text-sm font-semibold tracking-[0.14em] text-[#ff4b29]">
                    {step.n}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Catalog, open white */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <EyebrowChip>The catalog</EyebrowChip>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {TOTAL} apps Chippi can work inside.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Connected through Composio. Each one becomes a tool Chippi can call mid-task,
              reading what it needs and writing back where the work lives.
            </p>
          </Reveal>

          <div className="mt-14 space-y-14">
            {groups.map((group) => (
              <CategoryBlock key={group.key} label={group.label} apps={group.apps} />
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mt-24 px-4 pb-24 sm:mt-32 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-4xl">
            Connect your stack. Let Chippi work inside it.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            Bring the tools you already use.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-7 text-[15px] font-semibold text-zinc-950 transition-colors duration-150 hover:bg-black/[0.04]"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-neutral-500">7 days free, then $97/mo. Cancel anytime.</p>
        </Reveal>
      </section>
    </>
  );
}

function CategoryBlock({ label, apps }: { label: string; apps: IntegrationApp[] }) {
  return (
    <Reveal>
      <div className="flex items-baseline justify-between border-b border-black/5 pb-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-neutral-400">{apps.length}</span>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <IntegrationRow key={app.toolkit} app={app} />
        ))}
      </div>
    </Reveal>
  );
}

function IntegrationRow({ app }: { app: IntegrationApp }) {
  return (
    <div className="flex items-start gap-4">
      <Monogram name={app.name} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-[15px] font-semibold tracking-tight text-zinc-950">
            {app.name}
          </h4>
          {app.comingSoon ? (
            <span className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 ring-1 ring-black/10">
              soon
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-snug text-neutral-600">{app.blurb}</p>
      </div>
    </div>
  );
}

/** Letter chip, we ship no logo image assets, so each app reads as its
 *  initial in a soft white square. No fabricated brand marks. */
function Monogram({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-neutral-500 shadow-sm ring-1 ring-black/5">
      {initial}
    </div>
  );
}
