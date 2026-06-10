/**
 * IntegrationsPage — the /integrations body on the calm site system.
 *
 * One idea: connect your tools once, and Chippi works inside them. PageHero →
 * a three-step "how it works" → the catalog rendered straight from
 * `lib/integrations/catalog.ts` (the source of truth — no invented entries) →
 * a calm closing CTA. Each app reads as a paper-flat monogram (no fabricated
 * brand logos).
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { TITLE_FONT } from '@/lib/typography';
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
    body: 'Pick the apps you already work in and authorize them once. Chippi connects through Composio over OAuth — no keys to copy, no scripts to wire.',
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
      <PageHero
        eyebrow={`${TOTAL} integrations, one agent`}
        title="Your whole stack, wired into one agent."
        sub="Connect the tools you already pay for. Chippi connects through Composio, then calls each one as a tool while it works — pulling data out of your workflows and writing it back where it belongs."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* How it works */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Connect once. Chippi does the reaching.
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 md:grid-cols-3">
            {STEPS.map((step) => (
              <Reveal key={step.n}>
                <div className="flex h-full flex-col bg-background px-7 py-8">
                  <span style={TITLE_FONT} className="text-2xl leading-none text-brand">{step.n}</span>
                  <h3 className="mt-6 text-[17px] font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Catalog */}
      <section className="bg-background px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The catalog
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              {TOTAL} apps Chippi can work inside.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
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
      <section className="bg-background px-4 pb-24 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Connect your stack. Let Chippi work inside it.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Bring the tools you already use.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">7 days free, then $97/mo. Cancel anytime.</p>
        </Reveal>
      </section>
    </>
  );
}

function CategoryBlock({ label, apps }: { label: string; apps: IntegrationApp[] }) {
  return (
    <Reveal>
      <div className="flex items-baseline justify-between border-b border-border/60 pb-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{apps.length}</span>
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
          <h4 className="truncate text-[15px] font-semibold text-foreground">{app.name}</h4>
          {app.comingSoon ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              soon
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{app.blurb}</p>
      </div>
    </div>
  );
}

/** Paper-flat letter chip — we ship no logo image assets, so each app reads as
 *  its initial in a hairline-ringed square. No fabricated brand marks. */
function Monogram({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-[15px] font-semibold text-foreground/65">
      {initial}
    </div>
  );
}
