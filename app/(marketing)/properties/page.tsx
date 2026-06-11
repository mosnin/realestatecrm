/**
 * `/properties` — every listing in one place, synced from whatever CRM the
 * realtor already uses. The hero is a deck of throwable property cards over a
 * message; each card wears the CRM it synced in from. Then a calm "how the
 * sync works" band and the ask.
 */

import Link from 'next/link';
import { ArrowRight, RefreshCw, Building2, MapPin } from 'lucide-react';
import { FeatureGrid } from '@/components/marketing/site/section';
import { Reveal } from '@/components/marketing/site/reveal';
import {
  DraggableCardContainer,
  DraggableCardBody,
} from '@/components/marketing/site/properties/draggable-card';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Properties · Chippi',
  description:
    'Every listing in one place — synced from kvCORE, Follow-up Boss, Compass, Salesforce, and more. Chippi keeps your properties current across every tool you already use.',
};

interface Prop {
  address: string;
  city: string;
  price: string;
  beds: string;
  status: 'Active' | 'Pending' | 'New';
  source: string;
  className: string;
  photo: string;
}

const PROPERTIES: Prop[] = [
  { address: '14 Oak St', city: 'Oakland, CA', price: '$1,200,000', beds: '3 bd · 2 ba · 1,840 sqft', status: 'Active', source: 'kvCORE', className: 'absolute left-[8%] top-[8%] rotate-[-6deg]' , photo: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=640&h=420&fit=crop&q=80' },
  { address: '220 Marina Blvd', city: 'San Francisco, CA', price: '$2,400,000', beds: '4 bd · 3 ba · 2,600 sqft', status: 'Active', source: 'Follow-up Boss', className: 'absolute left-[36%] top-[2%] rotate-[5deg]' , photo: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=640&h=420&fit=crop&q=80' },
  { address: '88 Pine Ave', city: 'Alameda, CA', price: '$740,000', beds: '2 bd · 1 ba · 1,100 sqft', status: 'Pending', source: 'Compass', className: 'absolute left-[60%] top-[12%] rotate-[8deg]' , photo: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=640&h=420&fit=crop&q=80' },
  { address: '5 Birch Ln', city: 'Berkeley, CA', price: '$960,000', beds: '3 bd · 2 ba · 1,520 sqft', status: 'Active', source: 'Salesforce', className: 'absolute left-[14%] top-[44%] rotate-[4deg]' , photo: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=640&h=420&fit=crop&q=80' },
  { address: '31 Harbor Way', city: 'Sausalito, CA', price: '$1,800,000', beds: '4 bd · 3 ba · 2,310 sqft', status: 'Active', source: 'HubSpot', className: 'absolute left-[44%] top-[48%] rotate-[-5deg]' , photo: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=640&h=420&fit=crop&q=80' },
  { address: '410 Sunset Dr', city: 'Oakland, CA', price: '$620,000', beds: '2 bd · 2 ba · 980 sqft', status: 'New', source: 'Added by you', className: 'absolute left-[66%] top-[42%] rotate-[7deg]' , photo: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=640&h=420&fit=crop&q=80' },
];

const STATUS_TONE: Record<Prop['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  New: 'bg-brand-subtle text-brand',
};

function PropertyCardInner({ p }: { p: Prop }) {
  return (
    <>
      <div className="-mx-5 -mt-5 mb-4 h-36 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.photo} alt={p.address} className="h-full w-full object-cover" loading="lazy" draggable={false} />
      </div>
      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
          <Building2 className="h-4 w-4" />
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[p.status]}`}>
          {p.status}
        </span>
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">{p.address}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" /> {p.city}
      </p>
      <p className="mt-3 text-xl font-semibold tabular-nums text-foreground" style={TITLE_FONT}>{p.price}</p>
      <p className="mt-1 text-xs text-muted-foreground">{p.beds}</p>
      <div className="mt-4 flex items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <RefreshCw className="h-3 w-3 text-brand" />
        Synced · <span className="font-medium text-foreground">{p.source}</span>
      </div>
    </>
  );
}

const SYNC = [
  {
    kicker: 'Two-way sync',
    title: 'Every CRM, both directions',
    body: 'Connect kvCORE, Follow-up Boss, Compass, Salesforce — Chippi pulls every listing in and writes changes back. No double entry, no stale copy.',
  },
  {
    kicker: 'One truth',
    title: 'Update once, right everywhere',
    body: 'Status, price, photos, and the deal behind it live in one place — correct everywhere your contacts see it.',
  },
  {
    kicker: 'One search',
    title: 'The whole portfolio answers',
    body: 'Ask Chippi for “active listings under $1M in Oakland” and it answers across every source, in plain language.',
  },
];

export default function PropertiesPage() {
  return (
    <>
      {/* Hero — the deck of listings */}
      <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-28 pb-12 sm:px-6 sm:pt-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Properties</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-5 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-[3.5rem]" style={TITLE_FONT}>
              Every listing, one place.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Chippi pulls your properties in from every CRM you already use and keeps them
              current — so the portfolio is always one search away. Toss the cards around.
            </p>
          </Reveal>
        </div>

        {/* Draggable deck */}
        <DraggableCardContainer className="relative mx-auto mt-4 hidden h-[560px] w-full max-w-5xl items-center justify-center overflow-clip md:flex">
          <p
            className="pointer-events-none absolute top-1/2 max-w-sm -translate-y-1/2 text-center text-3xl leading-tight tracking-tight text-muted-foreground/40 lg:text-4xl"
            style={TITLE_FONT}
          >
            Drag them. They land where they belong — together.
          </p>
          {PROPERTIES.map((p) => (
            <DraggableCardBody key={p.address} className={p.className}>
              <PropertyCardInner p={p} />
            </DraggableCardBody>
          ))}
        </DraggableCardContainer>

        {/* Mobile: a calm stacked grid (dragging a deck on a phone is no fun) */}
        <div className="mx-auto mt-10 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
          {PROPERTIES.slice(0, 4).map((p) => (
            <div key={p.address} className="rounded-2xl border border-border/70 bg-card p-5">
              <PropertyCardInner p={p} />
            </div>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/integrations"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              See integrations
            </Link>
          </div>
        </Reveal>
      </section>

      {/* How the sync works */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Synced, not migrated</p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Bring your listings. Keep your tools.
            </h2>
          </Reveal>
          <div className="mt-10">
            <FeatureGrid items={SYNC} />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Your whole portfolio, in one window.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect a CRM and watch your listings land — current, searchable, and tied to the deal.
          </p>
          <div className="mt-8">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
