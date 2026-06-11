/**
 * `/bio` — the realtor's public bio: one link that carries your listings,
 * your tour-booking link, and a contact form — every tap feeding Chippi.
 * Hero pairs the pitch with a phone-frame mock of the bio page (placeholder
 * tiles, no external images), then how-it-captures, then the ask.
 */

import Link from 'next/link';
import { ArrowRight, CalendarCheck, MessageCircle, Home, MapPin } from 'lucide-react';
import { Reveal } from '@/components/marketing/site/reveal';
import { FeatureGrid, DarkStatBand } from '@/components/marketing/site/section';
import { PanelFrame } from '@/components/marketing/site/frame';
import { DraftPanel } from '@/components/marketing/site/home/live-panels';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Your public bio · Chippi',
  description:
    'One link in every profile — your listings, your booking link, your contact form. Every visitor who taps becomes a scored lead in Chippi, followed up in your voice.',
};

function BioPhone() {
  return (
    <div className="mx-auto w-[290px] overflow-hidden rounded-[2.4rem] border border-border/70 bg-card p-2 shadow-2xl shadow-foreground/[0.12] ring-1 ring-inset ring-white/5">
      <div className="overflow-hidden rounded-[1.9rem] border border-border/60 bg-background">
        {/* header */}
        <div className="flex flex-col items-center bg-gradient-to-b from-brand-subtle to-background px-5 pb-5 pt-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border/60 bg-foreground/10 text-lg font-semibold text-foreground/70">
            AR
          </span>
          <p className="mt-3 text-base font-semibold text-foreground">Alex Rivera</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> Oakland · Berkeley · Alameda
          </p>
          <p className="mt-2 max-w-[210px] text-center text-[11px] leading-relaxed text-muted-foreground">
            Helping East Bay buyers and sellers land the right home.
          </p>
        </div>
        {/* links */}
        <div className="space-y-2 px-4 pb-6">
          <div className="flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-subtle px-3.5 py-2.5">
            <CalendarCheck className="h-4 w-4 flex-shrink-0 text-brand" />
            <span className="text-sm font-medium text-foreground">Book a tour with me</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5">
            <Home className="h-4 w-4 flex-shrink-0 text-brand" />
            <span className="text-sm text-foreground">My active listings</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5">
            <MessageCircle className="h-4 w-4 flex-shrink-0 text-brand" />
            <span className="text-sm text-foreground">Ask me anything</span>
          </div>
          {/* listing tiles */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { addr: '14 Oak St', price: '$1.2M' },
              { addr: '5 Birch Ln', price: '$960K' },
            ].map((l) => (
              <div key={l.addr} className="overflow-hidden rounded-xl border border-border/60">
                <div
                  className="flex h-16 items-center justify-center bg-muted/40"
                  style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
                    backgroundSize: '14px 14px',
                  }}
                >
                  <Home className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium text-foreground">{l.addr}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{l.price}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="pt-2 text-center text-[10px] text-muted-foreground">
            Powered by <span className="font-medium text-brand">Chippi</span>
          </p>
        </div>
      </div>
    </div>
  );
}

const CAPTURES = [
  { kicker: 'Tours', title: 'Taps become tours', body: 'The booking link checks your real availability. A confirmed tour lands on your calendar — and the visitor lands in your book, scored.' },
  { kicker: 'Leads', title: 'Questions become leads', body: '"Ask me anything" goes straight to Chippi. It drafts the reply in your voice and queues it for your tap.' },
  { kicker: 'One link', title: 'Everywhere you are', body: 'Instagram, Zillow, your email signature, the open-house QR code — one URL keeps every channel feeding the same pipeline.' },
];

export default function BioPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-16 sm:px-6 sm:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Reveal className="text-center lg:text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Your public bio</p>
            <h1 className="mt-5 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-[3.25rem]" style={TITLE_FONT}>
              One link. Every lead.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-muted-foreground lg:mx-0">
              Your listings, your booking link, your contact form — on one page with your
              name on it. Every visitor who taps becomes a scored lead in Chippi.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href="/login/realtor?intent=signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
              >
                Claim your bio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/capture"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
              >
                All capture channels
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <BioPhone />
          </Reveal>
        </div>
      </section>

      {/* What it captures */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Built to capture</p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              A bio page that works the room.
            </h2>
          </Reveal>
          <div className="mt-10">
            <FeatureGrid items={CAPTURES} />
          </div>
        </div>
      </section>

      {/* Proof — from tap to drafted reply */}
      <section className="bg-background px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">From tap to reply</p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              A visitor asks. Chippi answers — in your voice.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Every &quot;ask me anything&quot; lands in Chippi, gets scored against your
              book, and comes back as a drafted reply waiting for your tap. The bio page
              isn&apos;t a brochure — it&apos;s a front door with someone working it.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <PanelFrame>
              <DraftPanel />
            </PanelFrame>
          </Reveal>
        </div>
      </section>

      <DarkStatBand
        eyebrow="The outcome"
        title="One link that closes."
        stats={[
          { value: '1', label: 'link, everywhere' },
          { value: '24/7', label: 'capturing & replying' },
          { value: '0', label: 'missed taps' },
        ]}
      />

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Put your link to work.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Claim your bio, drop the link everywhere, and let Chippi work whoever shows up.
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
