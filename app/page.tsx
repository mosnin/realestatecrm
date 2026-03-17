'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Link2,
  MessageSquareMore,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { track } from '@vercel/analytics';
import { PulseFitHero } from '@/components/ui/pulse-fit-hero';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';
import {
  AnimatedCard,
  CardVisual,
  CardBody,
  CardTitle,
  CardDescription,
  Visual3,
} from '@/components/ui/animated-card-chart';
import {
  AnimatedCard as AnimatedCard2,
  CardVisual as CardVisual2,
  CardBody as CardBody2,
  CardTitle as CardTitle2,
  CardDescription as CardDescription2,
  Visual2,
} from '@/components/ui/animated-card-diagram';
import {
  AnimatedCard as AnimatedCard3,
  CardVisual as CardVisual3,
  CardBody as CardBody3,
  CardTitle as CardTitle3,
  CardDescription as CardDescription3,
  Visual1,
} from '@/components/ui/animated-card-line';
import { Stats } from '@/components/ui/statistics-card';

const leadFeedItems = [
  {
    name: 'New rental application',
    description: 'Jordan Reyes · Budget $2,800 · Midtown · Move-in Aug 1',
    time: 'just now',
    icon: '📝',
    color: '#B8963E',
  },
  {
    name: 'Lead scored: warm',
    description: 'Ava Thompson · Score 68 · Strong timeline match',
    time: '2m ago',
    icon: '📊',
    color: '#D4A843',
  },
  {
    name: 'New renter inquiry',
    description: 'Carlos Mendez · 2BR · Pet friendly · Downtown',
    time: '4m ago',
    icon: '🏠',
    color: '#C9856A',
  },
  {
    name: 'Priority lead',
    description: 'Nina Patel · Score 82 · Ready to tour this week',
    time: '7m ago',
    icon: '⚡',
    color: '#C94040',
  },
];

const animatedLeadFeed = Array.from({ length: 3 }, () => leadFeedItems).flat();

const featureHighlights = [
  {
    icon: Link2,
    title: 'One intake link',
    description:
      'Share a single clean link in your bio, listing replies, or email signature. Every renter inquiry starts in the same place.',
  },
  {
    icon: ClipboardList,
    title: 'Structured qualification',
    description:
      'Capture budget, move-in date, neighborhoods, household details, and deal blockers in a guided flow.',
  },
  {
    icon: Gauge,
    title: 'AI lead scoring',
    description:
      'Get assistive lead priority with context so you know who to call first and why — not just a number.',
  },
  {
    icon: MessageSquareMore,
    title: 'Faster follow-up',
    description:
      'Review qualified records in one lightweight command center instead of piecing together DMs and notes.',
  },
  {
    icon: Users,
    title: 'Contact CRM',
    description:
      'Full contact profiles with activity logs, email history, deal tracking, and follow-up scheduling.',
  },
  {
    icon: TrendingUp,
    title: 'Pipeline analytics',
    description:
      'Track qualification rates, lead velocity, and conversion trends in one view — no spreadsheet required.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Share your intake link',
    body: 'Drop it in your bio, listing replies, or email signature. Renters fill out a structured form in minutes.',
  },
  {
    step: '02',
    title: 'Capture structured details',
    body: 'Budget, move-in date, neighborhoods, household size — every submission lands as a clean lead record.',
  },
  {
    step: '03',
    title: 'Review with AI context',
    body: 'See which leads to prioritize with practical scoring and supporting context already attached.',
  },
  {
    step: '04',
    title: 'Follow up from one workflow',
    body: 'Status, notes, contacts, and next steps — all in one command center instead of scattered threads.',
  },
];

function LeadFeedItem({
  name,
  description,
  icon,
  color,
  time,
}: {
  name: string;
  description: string;
  icon: string;
  color: string;
  time: string;
}) {
  return (
    <figure className="mx-auto w-full rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-transform duration-200 hover:scale-[1.02]">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
          style={{ backgroundColor: `${color}18` }}
        >
          <span>{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <figcaption className="flex items-center gap-1 text-sm font-semibold text-foreground">
            <span className="truncate">{name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs font-normal text-muted-foreground">{time}</span>
          </figcaption>
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </figure>
  );
}

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

export default function HomePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />
      <main className="flex-1 scroll-smooth relative overflow-x-hidden">
        {/* Hero */}
        <section id="hero">
          <PulseFitHero
            className="pt-[116px] md:pt-[126px]"
            showHeader={false}
            logo="Chippi"
            navigation={[
              { label: 'Features', onClick: () => { onTrack('pill_nav_click', { section: 'features', source: 'hero_nav' }); window.location.href = '/features'; } },
              { label: 'Pricing', onClick: () => { onTrack('pill_nav_click', { section: 'pricing', source: 'hero_nav' }); window.location.href = '/pricing'; } },
              { label: 'FAQ', onClick: () => { onTrack('pill_nav_click', { section: 'faq', source: 'hero_nav' }); window.location.href = '/faq'; } },
            ]}
            ctaButton={{
              label: 'Log in',
              onClick: () => {
                onTrack('hero_cta_click', { location: 'hero_nav_login' });
                window.location.href = '/sign-in';
              },
            }}
            title="Get more done. Close more deals."
            subtitle="One intake link. Structured qualification. Practical AI scoring. Follow up faster from one clean workflow."
            primaryAction={{
              label: 'GET EARLY ACCESS',
              onClick: () => {
                onTrack('hero_cta_click', { location: 'hero' });
                window.location.href = '/sign-up';
              },
            }}
            secondaryAction={{
              label: 'See how it works',
              onClick: () => {
                onTrack('pill_nav_click', { section: 'how-it-works', source: 'hero' });
                window.location.href = '/features';
              },
            }}
            disclaimer="7-day free trial · No credit card required"
            socialProof={{
              avatars: [
                'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
                'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop',
                'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop',
                'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=80&h=80&fit=crop',
              ],
              text: 'Built for modern solo realtors handling renter and leasing leads',
            }}
            programs={[
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhGMcGZtyL4M4bkN4ih0093zMY_rTFuC96zzFIKtfwmOWquEs3Sk-XRKpCOBGtRQ-B0Hs7Rxh5oIU2jDmnzroGPjanrMOnCJMUh-mvhVo4q41zDaWyJ2YAbRdZ5QvOb87XQCWPwWoseCUovKM4wfWAv8xMB0vJrHwEThu7hixCGPrl8Cp3wR4FlOaLqOg7J/s320/image%20(9).webp',
                category: 'INTAKE',
                title: 'One clean renter application link',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjD2O0IZ0h1I9vgmeVaPXnzI_jW-QQ5F2btwiicMK3w6VOFalshOQf1fMcTcp_JoZxLgBSldtUuuzgtiX5wtgUiveo61ZhHTbTXOh4QvdWt2hh26xU_TNtGNShy50mFfd_9dOrVz3Nb4mZ80Wme1dn9piIUfmAZSoBhHLeNxTouqIlTDeudwAdhOxQACp2R/s320/image%20(20).webp',
                category: 'QUALIFICATION',
                title: 'Budget, timeline, and area details in one flow',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjvxm32eiKeYuMWzVrE8ceLPgtIYxarpuF7MEQ0x7GLvXHv0R3Imatn_HB7Dp0JKBmSj-OZV1Dh7YaLICwsJcvf0NGepCD8P57GplS_D6LvtH55equqXGab5FlQ3OeEREih8cJhxk3m6CM44jJWuqJaR4RaNA9KoNhyphenhyphen-kTPOFgTO3GUz3Vob52fX_yeXwKg/w376-h503/image%20(18).webp',
                category: 'SCORING',
                title: 'Practical lead scoring you can explain',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgLwJ0YL6WhcH21NDvTvwXf5QzFLnC9EswU6WJxsSkJIF-OwI0AmQOSJKdK7glFSkhj9EKVvYLnoioJYcV4Zk8pOTWiz5tnzjtokZbsg0NNLndICQYwkpC3YxNumbpb4lihz_TX1wPalludzUsnYUlVsbMlpewT7dGbidTVxejO_eOxy68KODvFyK0scsoA/w378-h506/image%20(19).webp',
                category: 'FOLLOW-UP',
                title: 'Triage faster from one lightweight command center',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhiZ1tFXPwDXluFGeBqEXACxplP1iQ_81eRUVIUZNQerUihAeSWaTbqR1NzLPIcSqzwY8Vx3UWSMzn81oISmradd83ibWnDpKcf3m0ucXTOqy1Nf5QrXQGMQ5oxDQye-GMbYA_egtdzlGCO7ZlbMg2Go0qwi0BPcZHpH7MS9Cd4XQfY8cNueudPbwD_wtyz/s320/image%20(16).webp',
                category: 'WORKFLOW',
                title: 'Stay organized from inquiry to follow-up',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhngTR2PdwGNsbqWfcYeys1VueaJnXPMxAP_HddEbm9_0hovwbXHtcpvYFKTm6O5XyVkQA7CzwrprZnhw801GuxYa3rU00L-fvptf4Fz_RTVNClMkUtonP-02eE53c4qcX88_xux8oHXnTjh0RIDJ-6m1y6UOrxFxYhwDW0bZpaeePK-IA3pFFXWvrUIU8s/s320/image%20(14).webp',
                category: 'CRM',
                title: 'All lead context in one command center',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi3PfScU4mNCfuh2GZwML64cHH2FnC-YKJJWySY8JuKSxgM4nh5oRzYmBWmG99vw25ltzW6mM8TOTnc7jZEgYM0R2bPKcysD3SbTFKXmukopF5mmLOH5fMx8H-X_0ZMu5JejkHbrJMe9oDP1nWQ1zMMHhkX3xICg3erJjvwQQtloybCJQbiaftespj8mNYv/s320/image%20(10).webp',
                category: 'SPEED',
                title: 'Act faster with cleaner lead data',
              },
              {
                image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh-6yyH4q_xbd0MXJyqr5v-qlp9sTNJwWtuTGZqSM1g3NmyLuMGTshyphenhyphenOlGWsdZBn7sC4jK7-c2bLa_EniNXh9YDIPdEMXRDGPUzOqcozCUFEnWCtOndrTSzrkjG9Q0FoLhyIuH_RIKhDGi4zY4G0D45iYnQM3mz-2jGd3Zlu23YPnaxG6COSM-REkO2Kw3S/s320/image%20(12).webp',
                category: 'CONSISTENCY',
                title: 'Professional intake experience every time',
              },
            ]}
          />
        </section>

        {/* Live lead flow */}
        <section className="px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <span className="pill-badge">Live workflow signal</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                See new applications and lead context arrive in real time.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                Chippi captures structured renter submissions, adds scoring context, and keeps your next actions clear — so you can respond faster with less back-and-forth.
              </p>
              <Link
                href="/features"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
              >
                See all features <ArrowRight size={14} />
              </Link>
            </div>

            <div className="relative h-[460px] overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm p-3">
              <div className="lead-feed-scroll space-y-3">
                {animatedLeadFeed.map((item, idx) => (
                  <LeadFeedItem key={`${item.name}-${idx}`} {...item} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-card to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
            </div>
          </div>
        </section>

        {/* Stats / Problem */}
        <Stats />

        {/* Features bento grid */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
              <div>
                <span className="pill-badge">Everything you need</span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  A complete leasing lead system.
                </h2>
              </div>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
              >
                View all features <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {featureHighlights.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border/60 bg-card px-6 py-6 shadow-sm hover:-translate-y-px transition-transform"
                >
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent text-primary">
                    <feature.icon size={20} />
                  </div>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
              <div>
                <span className="pill-badge">How it works</span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">From inquiry to action in four steps.</h2>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {howItWorks.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-border/60 bg-card px-5 py-5 hover:-translate-y-px transition-transform shadow-sm"
                >
                  <p className="text-2xl font-bold text-primary/25 tabular-nums">{item.step}</p>
                  <p className="mt-3 font-semibold text-sm leading-snug">{item.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Animated feature cards */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <span className="pill-badge">Product depth</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight mb-8">Built for clear intake and clear action.</h2>

            {/* Pipeline card */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden mb-4">
              <div className="grid md:grid-cols-2">
                <AnimatedCard3 className="rounded-none border-0 border-r border-border/60 shadow-none">
                  <CardVisual3>
                    <Visual1 mainColor="#B8963E" secondaryColor="#D4A843" />
                  </CardVisual3>
                  <CardBody3>
                    <CardTitle3>Intake pipeline over time</CardTitle3>
                    <CardDescription3>Hover to see weekly qualification volume.</CardDescription3>
                  </CardBody3>
                </AnimatedCard3>
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <span className="pill-badge w-fit">Pipeline</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">One link captures every inquiry, automatically</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Share a single intake link in your bio, listing replies, or email signature. Every renter fills out the same structured form so your pipeline stays clean and consistent.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Structured form captures budget, dates & household details',
                      'Every submission lands as a clean lead record',
                      'No duplicate data entry or manual logging',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* AI Scoring card */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden mb-4">
              <div className="grid md:grid-cols-2">
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <span className="pill-badge w-fit">AI Scoring</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">Know who to call before you pick up the phone</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Every submission is scored across budget fit, move-in timeline, neighborhood match, and household criteria — so you always have context before reaching out.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Multi-signal lead scoring on every intake',
                      'Context attached — not just a number',
                      'Instant priority ranking across all leads',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <AnimatedCard2 className="rounded-none border-0 border-l border-border/60 shadow-none">
                  <CardVisual2>
                    <Visual2 mainColor="#B8963E" secondaryColor="#D4A843" />
                  </CardVisual2>
                  <CardBody2>
                    <CardTitle2>AI qualification breakdown</CardTitle2>
                    <CardDescription2>Hover to reveal scoring signals.</CardDescription2>
                  </CardBody2>
                </AnimatedCard2>
              </div>
            </div>

            {/* Analytics card */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="grid md:grid-cols-2">
                <AnimatedCard className="rounded-none border-0 border-r border-border/60 shadow-none">
                  <CardVisual>
                    <Visual3 mainColor="#B8963E" secondaryColor="#D4A843" />
                  </CardVisual>
                  <CardBody>
                    <CardTitle>Lead performance at a glance</CardTitle>
                    <CardDescription>Hover to explore conversion trends.</CardDescription>
                  </CardBody>
                </AnimatedCard>
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <span className="pill-badge w-fit">Analytics</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">See exactly where your pipeline stands</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Track qualification rates, lead velocity, and conversion performance in one view — no spreadsheet juggling required.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Qualified vs. disqualified lead ratio',
                      'Weekly intake volume trends',
                      'Average time-to-follow-up',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/features"
                onClick={() => onTrack('features_cta_click', { location: 'proof_section' })}
                className="inline-flex items-center gap-2 border border-border/60 bg-card px-6 py-3 rounded-full text-sm font-medium hover:bg-accent transition-colors"
              >
                Explore all features <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-3xl border border-primary/20 bg-card shadow-lg overflow-hidden animated-gradient-card">
              <div className="grid md:grid-cols-2">
                <div className="px-8 py-10 md:px-10 border-b md:border-b-0 md:border-r border-border/40">
                  <span className="pill-badge">Pricing</span>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight">One simple plan, everything included.</h2>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-5xl font-bold tracking-tight">$97</span>
                    <span className="text-muted-foreground text-lg mb-1">/ mo</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">7-day free trial · Cancel any time</p>
                  <div className="mt-6 flex gap-3 flex-wrap">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home_teaser' })}
                      className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 border border-border bg-background px-6 py-2.5 rounded-full text-sm font-medium hover:bg-muted transition-colors"
                    >
                      See full details <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
                <div className="px-8 py-10 md:px-10">
                  <p className="text-sm font-medium text-foreground mb-4">Everything in one plan:</p>
                  <ul className="space-y-3">
                    {[
                      'Custom intake link',
                      'Structured lead capture',
                      'AI lead scoring & prioritization',
                      'Leasing pipeline CRM',
                      'Contact management',
                      'Deal tracking',
                      'Analytics dashboard',
                      'Full follow-up workflow',
                    ].map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <span className="pill-badge">
              <Zap size={12} />
              7-day free trial — no card required
            </span>
            <h2 className="mt-6 text-3xl md:text-5xl font-bold tracking-tight leading-tight">
              One link.<br className="hidden md:block" /> Clear leads. Fast action.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Start your free trial and feel the workflow compression in your first week.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                className="inline-flex items-center gap-2 bg-foreground text-background px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 border border-border px-8 py-3.5 rounded-full font-medium hover:bg-card transition-colors"
              >
                View features <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <AnimatedFooter
          leftLinks={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/faq', label: 'FAQ' },
            { href: '/sign-up', label: 'Get started' },
          ]}
          rightLinks={[
            { href: '/legal/privacy', label: 'Privacy' },
            { href: '/legal/terms', label: 'Terms' },
            { href: '/legal/cookies', label: 'Cookies' },
            { href: '/sign-in', label: 'Log in' },
          ]}
          copyrightText={`© ${new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.`}
        />
      </main>
    </div>
  );
}
