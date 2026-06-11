/**
 * `/` (home): the reference composition, faithfully.
 *
 * NexusSci: sticker-headline gradient hero card → bento row (vermillion
 * product card · giant-stat card · photo card with sticker labels).
 * Arist: white benefits mega-card (✦ eyebrow → vermillion feature card with
 * floating UI chips → stat cells → how-it-works split) → vermillion photo
 * band with Learn-more pills → testimonial-slot promise card → pale demo
 * card with floating channel icons. Black footer card closes (layout).
 *
 * Honesty holds: live product panels as proof, defensible facts as stats,
 * the approval promise in the testimonial slot — no fabricated social proof.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Flame,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Hero } from '@/components/marketing/site/home/hero';
import {
  Section,
  SectionHeader,
  StatStrip,
  EyebrowChip,
  FadeUp,
  Stagger,
  StaggerItem,
} from '@/components/marketing/site/section';

const STATS = [
  { value: '24/7', label: 'Chippi works your inbox around the clock' },
  { value: '50+', label: 'integrations — two minutes to connect' },
  { value: '100%', label: 'approval-first. Nothing sends without you' },
  { value: '7 days', label: 'free trial, then $97/mo. Cancel anytime' },
];

const FLOOR = [
  {
    title: 'For realtors',
    sub: 'Your book, worked while you show houses.',
    href: '/realtors',
    img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1600&auto=format&fit=crop',
    alt: 'Modern home exterior at dusk',
  },
  {
    title: 'For brokerages',
    sub: 'Every agent on the floor, with a Chippi behind them.',
    href: '/brokerages',
    img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1600&auto=format&fit=crop',
    alt: 'Luxury house with pool at golden hour',
  },
  {
    title: 'Integrations',
    sub: 'Gmail, Outlook, your CRM — connected in minutes.',
    href: '/integrations',
    img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1600&auto=format&fit=crop',
    alt: 'Bright modern living room interior',
  },
];

/** Rounded photo block — the reference cards are photography-led. */
function Photo({
  src,
  alt,
  className = '',
  sizes = '(max-width: 1024px) 100vw, 50vw',
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}

/** Floating UI chip — the Arist "Sales playbook / .PDF" move. */
function FloatChip({
  icon,
  iconBg,
  label,
  sub,
  className,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute z-10 hidden items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_12px_32px_-10px_rgba(20,16,12,0.3)] dark:bg-[#1c1c1f] lg:flex ${className}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${iconBg}`}>{icon}</span>
      <span>
        <span className="block text-[13px] font-semibold leading-tight text-[#16161a] dark:text-white">{label}</span>
        {sub ? <span className="block text-[11px] text-[#16161a]/55 dark:text-white/55">{sub}</span> : null}
      </span>
    </div>
  );
}

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div>
      {/* ── NexusSci hero card ── */}
      <Hero />

      {/* ── NexusSci bento row ── */}
      <section className="px-2.5 pb-2.5 sm:px-4 sm:pb-4">
        <Stagger className="mx-auto grid max-w-[1400px] grid-cols-1 gap-2.5 sm:gap-4 lg:grid-cols-[1.15fr_0.85fr_1fr]">
          {/* Vermillion product card */}
          <StaggerItem className="h-full">
            <div className="flex h-full min-h-[440px] flex-col justify-between rounded-[2rem] bg-[#ff4b29] p-7 text-white">
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-[22ch] text-lg font-semibold leading-snug">
                  The agentic OS for groundbreaking realtors.
                </p>
                <span aria-hidden className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl">
                  ✦
                </span>
              </div>
              <Photo
                src="https://images.unsplash.com/photo-1568605114967-8130f3a36994?q=80&w=1400&auto=format&fit=crop"
                alt="Craftsman home with a wide porch"
                className="my-6 h-56 sm:h-64"
              />
              <Link
                href="/chippi"
                className="inline-flex h-12 w-fit items-center gap-2 rounded-full bg-white px-6 text-[13px] font-bold uppercase tracking-[0.08em] text-[#16161a] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                Learn more
                <Plus className="h-4 w-4" />
              </Link>
            </div>
          </StaggerItem>

          {/* Giant stat card */}
          <StaggerItem className="h-full">
            <div className="flex h-full min-h-[440px] flex-col justify-between rounded-[2rem] bg-white p-7 dark:bg-[#151517]">
              <p className="font-display text-[5rem] font-bold leading-none tracking-[-0.04em] text-[#16161a] dark:text-white sm:text-[6rem]">
                50+
              </p>
              <Link
                href="/integrations"
                className="inline-flex w-fit items-center gap-2 rounded-full bg-[#dcdce4] px-5 py-3 text-[15px] font-semibold text-[#16161a] transition-colors hover:bg-[#d2d2dc] dark:bg-[#26262b] dark:text-white dark:hover:bg-[#2e2e34]"
              >
                Integrations at your fingertips
              </Link>
            </div>
          </StaggerItem>

          {/* Photo card */}
          <StaggerItem className="h-full">
            <Link href="/demo" className="group relative block h-full min-h-[440px] overflow-hidden rounded-[2rem]">
              <Image
                src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1400&auto=format&fit=crop"
                alt="Agent handing over house keys"
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute left-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-[#ff4b29] text-white transition-transform duration-200 group-hover:rotate-12">
                <ArrowUpRight className="h-5 w-5" />
              </span>
              <span className="absolute bottom-6 left-6 right-6 w-fit rounded-2xl bg-white px-5 py-3 text-[15px] font-semibold leading-snug text-[#16161a] dark:bg-[#151517] dark:text-white">
                See it work on your own book
              </span>
            </Link>
          </StaggerItem>
        </Stagger>
      </section>

      {/* ── Arist benefits mega-card ── */}
      <Section tone="card">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <EyebrowChip className="justify-center">Benefits</EyebrowChip>
          <h2 className="font-display mt-5 text-[2rem] font-bold leading-[1.08] tracking-[-0.03em] text-[#16161a] dark:text-white sm:text-[2.6rem]">
            Close more by meeting your leads the moment they land
          </h2>
        </FadeUp>

        {/* Vermillion feature card with floating chips */}
        <FadeUp delay={0.1} className="mt-12">
          <div className="rounded-[2rem] bg-[#ff4b29] p-7 text-white sm:p-12">
            <div className="mb-8 flex flex-wrap gap-2">
              {['Connect your inbox', 'Approve the drafts', 'Watch it close'].map((step, i) => (
                <span key={step} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[12px] font-semibold">
                  {i > 0 ? <span aria-hidden className="text-white/60">›</span> : null}
                  {step}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h3 className="font-display text-3xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-4xl">
                  Days that close themselves
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
                  Chippi turns every inbound into a scored lead, a drafted reply,
                  and a booked tour — before you open the thread.
                </p>
                <Link
                  href="/login/realtor?intent=signup"
                  className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#16161a] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Try Chippi
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative">
                <FloatChip
                  icon={<MessageSquare className="h-4 w-4" />}
                  iconBg="bg-emerald-500"
                  label="Reply drafted"
                  sub="in your voice"
                  className="-left-6 -top-5 -rotate-3"
                />
                <FloatChip
                  icon={<CalendarCheck className="h-4 w-4" />}
                  iconBg="bg-sky-500"
                  label="Tour confirmed"
                  sub="Saturday · 2:00 PM"
                  className="-right-7 top-1/3 rotate-2"
                />
                <FloatChip
                  icon={<Flame className="h-4 w-4" />}
                  iconBg="bg-[#ff4b29]"
                  label="Maya scored 82"
                  sub="hot · 14 Oak St"
                  className="-bottom-5 left-8 rotate-1"
                />
                <Photo
                  src="https://images.unsplash.com/photo-1556157382-97eda2d62296?q=80&w=1400&auto=format&fit=crop"
                  alt="Realtor taking a call between showings"
                  className="h-[380px]"
                />
              </div>
            </div>
          </div>
        </FadeUp>

        {/* Stat cells */}
        <div className="mt-4">
          <StatStrip stats={STATS} />
        </div>

        {/* How it works split */}
        <FadeUp className="mt-20 text-center">
          <EyebrowChip className="justify-center">Features</EyebrowChip>
          <h2 className="font-display mt-5 text-[2rem] font-bold tracking-[-0.03em] text-[#16161a] dark:text-white sm:text-[2.4rem]">
            How it works
          </h2>
        </FadeUp>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <FadeUp className="h-full">
            <div className="flex h-full flex-col rounded-[1.75rem] bg-[#f4f4f6] p-8 dark:bg-[#1c1c1f] sm:p-10">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-[#16161a] dark:text-white sm:text-3xl">
                A better way to follow up
              </h3>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#16161a]/60 dark:text-white/55">
                Less chasing, more closing. Chippi replaces the sticky-note
                follow-up system with an agent that never forgets a lead.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  'No new apps for your leads to download',
                  'Every reply waits for your approval',
                  'One-click connect for Gmail and Outlook',
                  'Pipeline updates write themselves',
                ].map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[14px] font-medium text-[#16161a]/80 dark:text-white/75">
                    <span aria-hidden className="mt-0.5 text-[#ff4b29]">✦</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/chippi"
                className="mt-9 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-[#ff4b29] px-6 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
              >
                Read how it works
              </Link>
            </div>
          </FadeUp>
          <FadeUp delay={0.1} className="h-full">
            <div className="flex h-full min-h-[420px] flex-col rounded-[1.75rem] bg-[#ff4b29] p-4">
              <Photo
                src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1400&auto=format&fit=crop"
                alt="Bright staged living room ready for a tour"
                className="h-full min-h-[388px] rounded-[1.35rem]"
              />
            </div>
          </FadeUp>
        </div>
      </Section>

      {/* ── Vermillion photo band ── */}
      <Section tone="brand">
        <SectionHeader
          dark
          align="center"
          eyebrow="Built for the floor"
          title="Clear impact, from solo book to hundred-agent floor"
        />
        <Stagger className="mt-10 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          {FLOOR.map((card) => (
            <StaggerItem key={card.href} className="h-full">
              <Link href={card.href} className="group relative block h-[320px] overflow-hidden rounded-[1.5rem]">
                <Image
                  src={card.img}
                  alt={card.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="font-display text-xl font-bold tracking-[-0.01em] text-white">{card.title}</h3>
                  <p className="mt-1 text-[13px] leading-snug text-white/80">{card.sub}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#ff4b29] px-4 py-2 text-[12px] font-bold text-white transition-transform duration-200 group-hover:translate-x-1">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* ── The promise — the testimonial slot, kept honest ── */}
      <Section tone="card">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <FadeUp>
            <EyebrowChip>The promise</EyebrowChip>
            <h2 className="font-display mt-5 text-[2rem] font-bold leading-[1.08] tracking-[-0.03em] text-[#16161a] dark:text-white sm:text-[2.4rem]">
              Our default since day one
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#16161a]/60 dark:text-white/55">
              An agent you can hand your book to has to earn it. Chippi drafts,
              books, and updates — and you stay the signature on every send.
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="flex h-full flex-col justify-between rounded-[1.75rem] bg-[#f4f4f6] p-8 dark:bg-[#1c1c1f] sm:p-12">
              <p aria-hidden className="font-accent text-7xl leading-none text-[#dcdce4] dark:text-[#2c2c32]">
                &ldquo;
              </p>
              <p className="font-accent mt-2 text-3xl italic leading-[1.15] text-[#16161a] dark:text-white sm:text-4xl">
                Nothing leaves without your name on it.
              </p>
              <p className="mt-8 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#16161a]/45 dark:text-white/45">
                The approval-first principle — built into every send
              </p>
            </div>
          </FadeUp>
        </div>
      </Section>

      {/* ── Get a demo — pale card with floating channels ── */}
      <section className="px-3 py-3 sm:px-4 sm:py-4">
        <FadeUp>
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#e7eef4] dark:bg-[#13171b] sm:rounded-[2.75rem]">
            <div className="grid grid-cols-1 items-center gap-10 px-5 py-14 sm:px-10 sm:py-16 lg:grid-cols-2 lg:px-14">
              <div>
                <h2 className="font-display text-[2.4rem] font-bold tracking-[-0.03em] text-[#16161a] dark:text-white sm:text-5xl">
                  Get a demo
                </h2>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#16161a]/65 dark:text-white/60">
                  See Chippi score, draft, and book against your real leads in a
                  20-minute walkthrough.
                </p>
                <Link
                  href="/demo"
                  className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
                >
                  See it in action
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-4 text-[13px] text-[#16161a]/50 dark:text-white/50">
                  7 days free, then $97/mo. Cancel anytime.
                </p>
              </div>
              <div className="relative py-6">
                <FloatChip
                  icon={<MessageSquare className="h-4 w-4" />}
                  iconBg="bg-emerald-500"
                  label="SMS"
                  className="-top-2 right-10 rotate-3"
                />
                <FloatChip
                  icon={<Mail className="h-4 w-4" />}
                  iconBg="bg-sky-500"
                  label="Email"
                  className="-left-4 top-1/4 -rotate-2"
                />
                <FloatChip
                  icon={<CalendarCheck className="h-4 w-4" />}
                  iconBg="bg-violet-500"
                  label="Calendar"
                  className="-bottom-3 left-12 rotate-1"
                />
                <FloatChip
                  icon={<RefreshCw className="h-4 w-4" />}
                  iconBg="bg-amber-500"
                  label="CRM sync"
                  className="-right-2 bottom-10 -rotate-3"
                />
                <Photo
                  src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=1400&auto=format&fit=crop"
                  alt="Agent reviewing drafts at her desk"
                  className="h-[340px]"
                />
              </div>
            </div>
          </div>
        </FadeUp>
      </section>
    </div>
  );
}
