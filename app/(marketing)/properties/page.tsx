/**
 * `/properties`, every property in one place, on the white + pastel system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass property record: listing, photos & docs, showings) → soft white
 * bento with owner image slots → pastel CTA card. One idea: the listing
 * carries everything, synced from the CRMs you already run.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  CalendarCheck,
  FileText,
  ImagePlus,
  LayoutGrid,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { CloudCta } from '@/components/marketing/site/home/cloud-cta';

export const metadata = {
  title: 'Properties · Chippi',
  description:
    'Every listing in one place, synced from kvCORE, Follow-up Boss, Compass, Salesforce, and more. Chippi keeps your properties current across every tool you already use.',
};

/** Owner image slot, exactly the FeaturesBento vocabulary. */
function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-400">
          Image placeholder, <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

const BENTO = [
  {
    slot: 'properties-board',
    title: 'The whole portfolio.',
    sub: 'Active, pending, closed, every property on one board you can actually read.',
  },
  {
    slot: 'properties-sync',
    title: 'Synced, not migrated.',
    sub: 'Chippi pulls listings from the CRM you already run and writes changes back. No double entry.',
  },
  {
    slot: 'properties-media',
    title: 'Photos and docs attached.',
    sub: 'Disclosures, photos, and files live on the listing they belong to, found in one search.',
  },
  {
    slot: 'properties-showings',
    title: 'Showings on the listing.',
    sub: 'Every tour sits on the property and on your calendar, with nothing retyped.',
  },
];

/* The "sync in, manage in one window" feature row. */
const SYNC: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: RefreshCw,
    title: 'Sync from any CRM.',
    body: 'kvCORE, Follow Up Boss, Compass, Salesforce, connect once and listings flow in on their own.',
  },
  {
    icon: LayoutGrid,
    title: 'Manage in one window.',
    body: 'Active, pending, and closed sit on a single board, no tab-hopping between five systems.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Changes written back.',
    body: 'Edit a price or a status here and Chippi pushes it to every source. One record, kept honest.',
  },
];

/* Status pill tones for the portfolio-window rows. */
const STATUS_TONE: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700',
  Pending: 'bg-amber-50 text-amber-700',
  Closed: 'bg-neutral-100 text-neutral-600',
};

/* Rows for the skeleton portfolio window. */
const PORTFOLIO: { addr: string; source: string; status: keyof typeof STATUS_TONE; w: string }[] = [
  { addr: '14 Oak St', source: 'kvCORE', status: 'Active', w: 'w-28' },
  { addr: '208 Birch Ave', source: 'Follow Up Boss', status: 'Pending', w: 'w-32' },
  { addr: '91 Cedar Ct', source: 'Compass', status: 'Active', w: 'w-24' },
  { addr: '5 Maple Row', source: 'Salesforce', status: 'Closed', w: 'w-36' },
];

/** Skeleton "portfolio window", many listings, many sources, one board. */
function PortfolioWindow() {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
      <div
        className="overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">Your portfolio</h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
              <RefreshCw className="h-4 w-4 text-[#ff4b29]" />
              4 sources synced
            </span>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
            {/* Column header */}
            <div className="flex items-center gap-3 px-1 pb-2 text-[9px] uppercase tracking-widest text-neutral-400">
              <span className="flex-1">Property</span>
              <span className="hidden sm:inline">Source</span>
              <span className="w-16 text-right">Status</span>
            </div>

            <div className="space-y-2">
              {PORTFOLIO.map((row) => (
                <div
                  key={row.addr}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm"
                >
                  <div className="h-9 w-12 flex-shrink-0 rounded-lg bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-neutral-800">{row.addr}</div>
                    <div className={`mt-1.5 h-1.5 ${row.w} rounded bg-neutral-200`} />
                  </div>
                  <span className="hidden items-center gap-1 text-[9px] text-neutral-500 sm:inline-flex">
                    <RefreshCw className="h-3 w-3 text-[#ff4b29]" />
                    {row.source}
                  </span>
                  <span
                    className={`w-16 rounded-full px-2 py-0.5 text-center text-[9px] font-medium ${STATUS_TONE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer, one window summary */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 ring-1 ring-inset ring-black/5">
              <span className="text-[10px] text-neutral-600">All listings · one window</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Up to date
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  return (
    <div>
      <PageHero
        eyebrow="Properties"
        title="Every property. One place."
        sub="Chippi syncs your listings in from the CRMs you already run and keeps them current, photos, documents, and showings attached to the listing, one search away."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split, air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, dark button */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Bring your listings. Keep your tools.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Chippi is not another place to retype your portfolio. It syncs
              with the stack you already run and keeps one record honest.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <RefreshCw className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Synced from your CRM</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Connect kvCORE, Follow Up Boss, Compass, listings flow
                      in and changes flow back. No double entry, no stale copy.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Paperclip className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Everything attached</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Photos, disclosures, and showings live on the listing
                      they belong to, not across five tabs.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">50+</span>
                  <p className="mt-1 text-xs text-neutral-600">Integrations across CRMs, email, and calendar</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">Sync that keeps every record current</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/integrations"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 py-2.5 text-base leading-none text-white shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] transition-all duration-150 hover:opacity-85"
              >
                Explore integrations
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, skeleton property record */}
          <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
            <article
              className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.65)',
              }}
            >
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">14 Oak St</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                    <RefreshCw className="h-4 w-4 text-[#ff4b29]" />
                    Live sync
                  </span>
                </div>

                {/* One record: listing, media & docs, showings */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">PROPERTY</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                        Active
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="h-10 w-14 flex-shrink-0 rounded-lg bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-24 rounded bg-neutral-900" />
                        <div className="mt-1.5 h-2 w-32 rounded bg-neutral-200" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[9px] text-neutral-500">
                        <RefreshCw className="h-3 w-3 text-[#ff4b29]" />
                        kvCORE
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">PHOTOS &amp; DOCS</span>
                      <span className="text-[10px] text-neutral-400">Attached</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <div className="h-10 rounded-lg bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5" />
                      <div className="h-10 rounded-lg bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5" />
                      <div className="h-10 rounded-lg bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5" />
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                        <div className="h-1.5 w-24 rounded bg-neutral-200" />
                        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                          Filed
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                        <div className="h-1.5 w-32 rounded bg-neutral-200" />
                        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                          Filed
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">SHOWINGS</span>
                      <span className="text-[10px] text-neutral-400">This week</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1.5 text-neutral-700">
                        <CalendarCheck className="h-3 w-3 text-[#ff4b29]" />
                        Buyer tour · Sat 2:00
                      </span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">
                        On calendar
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1.5 text-neutral-700">
                        <CalendarCheck className="h-3 w-3 text-neutral-400" />
                        Open house · Sun 1–3
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-600">
                        Scheduled
                      </span>
                    </div>
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">One record per property</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      The listing carries its photos, documents, and tours, 
                      one click deep from the deal.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Written back</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Change a price once and it is right everywhere your
                      stack looks.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Sync in, manage in one window, feature row + portfolio window */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            Sync in, manage in one window
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Your listings flow in. You never retype them.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Connect the CRMs you already run. Chippi pulls every listing into one
            board and writes your changes back, no double entry, no stale copy.
          </p>
        </FadeUp>

        <Stagger className="mt-12 grid gap-6 sm:gap-8 lg:grid-cols-3">
          {SYNC.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <item.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{item.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* One board, every source, copy beside the skeleton portfolio window */}
        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:items-center sm:mt-16">
          <FadeUp>
            <h3 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Five systems, read as one.
            </h3>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Active, pending, and closed sit on a single board, each row labeled
              with the source it came from, each kept current as the source moves.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <LayoutGrid className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h4 className="font-semibold tracking-tight text-zinc-950">One board to read</h4>
                    <p className="mt-1 text-sm text-neutral-600">
                      Every listing in one window with a status you can scan, no
                      tab-hopping between five tools to see where things stand.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <ArrowLeftRight className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h4 className="font-semibold tracking-tight text-zinc-950">Honest both ways</h4>
                    <p className="mt-1 text-sm text-neutral-600">
                      Edit a price or a status here and the change is pushed back
                      to its source. One record, true everywhere your stack looks.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <PortfolioWindow />
          </FadeUp>
        </div>
      </section>

      {/* Soft bento, owner image slots, big air above */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            The property record
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            One listing. Everything attached.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            The board, the sync, the media, the showings, one record that
            carries it all.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
          {BENTO.map((cell) => (
            <StaggerItem key={cell.slot} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {cell.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{cell.sub}</p>
                <ImageSlot name={cell.slot} />
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Break-up closer */}
      <div className="mt-24 sm:mt-32">
        <CloudCta />
      </div>
    </div>
  );
}
