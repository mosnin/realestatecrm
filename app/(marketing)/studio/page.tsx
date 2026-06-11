/**
 * `/studio` — Chippi's content studio, on the calm site system.
 *
 * One idea: make the listing content on the go. The hero is a cover-flow of
 * the posts Chippi drafts (mocked from the product's own card vocabulary, not
 * stock photos), then a calm "how it works" band and the ask.
 */

import Link from 'next/link';
import { ArrowRight, Home, CalendarCheck, BadgeCheck, TrendingUp, Mail } from 'lucide-react';
import { FeatureGrid } from '@/components/marketing/site/section';
import { Reveal } from '@/components/marketing/site/reveal';
import { Coverflow } from '@/components/marketing/site/studio/coverflow';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Content studio · Chippi',
  description:
    'Chippi drafts your listing posts, stories, and emails — in your voice, from your phone. Just listed, open house, just sold, market updates: written and ready while you’re in the field.',
};

/* A single mocked piece of Studio output — a phone-shaped social post. */
function PostCard({
  tag,
  Icon,
  photo,
  headline,
  meta,
  caption,
  tags,
}: {
  tag: string;
  Icon: React.ElementType;
  photo: string;
  headline: string;
  meta: string;
  caption: string;
  tags: string[];
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-2xl shadow-foreground/[0.10] ring-1 ring-inset ring-white/5">
      {/* media */}
      <div className="relative flex flex-1 flex-col justify-between p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={headline} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
        <div className="relative flex items-center justify-between">
          <span className="rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground backdrop-blur-sm">
            {tag}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-sm">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="relative">
          <p className="text-[15px] font-semibold leading-snug text-white">{headline}</p>
          <p className="mt-0.5 text-[11px] text-white/75">{meta}</p>
        </div>
      </div>
      {/* caption */}
      <div className="border-t border-border/60 bg-background p-3.5">
        <div className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-[9px] font-bold text-brand-foreground">C</span>
          <span className="text-[11px] font-medium text-muted-foreground">@yourbrand</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground/80">{caption}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="text-[10px] font-medium text-brand">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const CARDS = [
  <PostCard
    key="listed"
    tag="Just listed"
    Icon={Home}
    photo="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=640&h=900&fit=crop&q=80"
    headline="14 Oak St — just listed"
    meta="$1,200,000 · 3 bd · 2 ba · Oakland"
    caption="Light-filled craftsman steps from the lake. Open this weekend — DM for a private tour."
    tags={['#justlisted', '#oakland', '#forsale']}
  />,
  <PostCard
    key="open"
    tag="Open house"
    Icon={CalendarCheck}
    photo="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=640&h=900&fit=crop&q=80"
    headline="Open Sat 1–3 PM"
    meta="220 Marina Blvd · waterfront"
    caption="Come see the view in person. Coffee’s on us. Saturday 1–3, see you there."
    tags={['#openhouse', '#marina', '#realestate']}
  />,
  <PostCard
    key="sold"
    tag="Just sold"
    Icon={BadgeCheck}
    photo="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=640&h=900&fit=crop&q=80"
    headline="Sold — over asking"
    meta="88 Pine Ave · 6 days on market"
    caption="Another one closed. Thinking of selling? Let’s talk about what your home is worth today."
    tags={['#justsold', '#sold', '#thankyou']}
  />,
  <PostCard
    key="price"
    tag="Price improved"
    Icon={TrendingUp}
    photo="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=640&h=900&fit=crop&q=80"
    headline="New price — $960,000"
    meta="5 Birch Ln · was $995,000"
    caption="Priced to move. Three beds, big yard, top schools. Book a showing this week."
    tags={['#pricedrop', '#newprice', '#homeforsale']}
  />,
  <PostCard
    key="market"
    tag="Market update"
    Icon={Mail}
    photo="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=640&h=900&fit=crop&q=80"
    headline="Your November market, in 60 seconds"
    meta="Email · sent to 1,240 contacts"
    caption="Inventory’s up 8%, rates eased. Here’s what it means if you’re buying or selling."
    tags={['#marketupdate', '#newsletter']}
  />,
];

const STEPS = [
  {
    kicker: 'Step 01',
    title: 'Drafts in your voice',
    body: 'Tell Chippi the listing — or just point it at the deal. It writes the post, the story, and the email the way you actually write, ready to tweak.',
  },
  {
    kicker: 'Step 02',
    title: 'Every channel at once',
    body: 'One listing becomes an Instagram post, a story, a just-listed email, and a flyer — formatted for each, on brand, in seconds.',
  },
  {
    kicker: 'Step 03',
    title: 'Scheduled or sent',
    body: 'Approve it and Chippi queues it for the open-house window — or posts now. The whole campaign runs from your phone between showings.',
  },
];

export default function StudioPage() {
  return (
    <>
      {/* Hero — the cover-flow of content */}
      <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-16 sm:px-6 sm:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Content studio
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-5 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-[3.5rem]" style={TITLE_FONT}>
              Make the content on the go.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Just listed, open house, just sold, the monthly market email — Chippi drafts it
              in your voice and formats it for every channel. From your phone, between showings.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="relative mx-auto mt-12 max-w-4xl">
          <Coverflow cards={CARDS} />
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
              Watch demo
            </Link>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              A whole campaign, from one listing.
            </h2>
          </Reveal>
          <div className="mt-10">
            <FeatureGrid items={STEPS} />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Post the listing before you leave the driveway.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Chippi drafts it the moment a listing goes live. You approve; it posts.
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
