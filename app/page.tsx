'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Link2,
  MessageSquareMore,
  Sparkles,
} from 'lucide-react';
import { track } from '@vercel/analytics';
import { PulseFitHero } from '@/components/ui/pulse-fit-hero';
import { BrandLogo } from '@/components/brand-logo';
import FeatureSection from '@/components/ui/feature-section';

const pillNav = [
  { id: 'problem', label: 'Problem' },
  { id: 'solution', label: 'Solution' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'proof', label: 'Product proof' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' }
];

const proofCards = [
  {
    icon: Link2,
    title: 'One intake link',
    description:
      'Share one clean link in your bio, email, or listing replies. Every renter inquiry starts in the same place.'
  },
  {
    icon: ClipboardList,
    title: 'Structured qualification',
    description:
      'Capture budget, move-in date, neighborhoods, household details, and deal blockers in a guided flow.'
  },
  {
    icon: Gauge,
    title: 'Practical AI scoring',
    description:
      'Get assistive lead priority with context so you know who to call first and why.'
  },
  {
    icon: MessageSquareMore,
    title: 'Faster follow up',
    description:
      'Review qualified records in one lightweight command center instead of piecing together DMs and notes.'
  }
];

const howItWorks = [
  {
    step: '01',
    title: 'Share your intake link',
    body: 'Drop it in your bio, listing replies, or email signature. Renters fill out a structured form in minutes.'
  },
  {
    step: '02',
    title: 'Capture structured details',
    body: 'Budget, move-in date, neighborhoods, household size — every submission lands as a clean lead record.'
  },
  {
    step: '03',
    title: 'Review with AI context',
    body: 'See which leads to prioritize with practical scoring and supporting context already attached.'
  },
  {
    step: '04',
    title: 'Follow up from one workflow',
    body: 'Status, notes, contacts, and next steps — all in one command center instead of scattered threads.'
  }
];

const marqueeQuotes = [
  '"Feels way cleaner than managing renter leads in DMs."',
  '"I can finally tell who to follow up with first."',
  '"The intake flow makes me look organized right away."',
  '"Simple on purpose. That\'s exactly what I needed."',
  '"I open one view and know what to do next."'
];

const faqs = [
  {
    q: 'What is Chippi?',
    a: 'Chippi is a leasing lead workflow for solo realtors. It helps you capture renter inquiries, qualify them in a structured way, and follow up faster from one clear view.'
  },
  {
    q: 'Who is Chippi for?',
    a: 'Chippi is built for agents handling renter and leasing leads who want a cleaner daily workflow without a bloated CRM setup.'
  },
  {
    q: 'How does the intake link work?',
    a: 'You share one intake link. Renters submit details through a guided flow, and each submission becomes a structured lead record in Chippi.'
  },
  {
    q: 'What does AI scoring actually do?',
    a: 'It helps prioritize lead follow-up by reviewing submitted context and surfacing a practical score. It is assistive, not autopilot.'
  },
  {
    q: 'Do I need to replace my current CRM?',
    a: 'No. Many agents start Chippi as a leasing command center first, then decide what to sync or keep elsewhere.'
  },
  {
    q: 'How fast can I get set up?',
    a: 'Most agents can get their intake link live in minutes and start collecting structured renter data the same day.'
  },
  {
    q: 'What happens after a renter submits the form?',
    a: 'You get a lead record with qualification context, status visibility, and clear next actions for follow-up.'
  },
  {
    q: 'Can I review why a lead was scored a certain way?',
    a: 'Yes. Chippi keeps the supporting context visible so prioritization is understandable and practical.'
  },
  {
    q: 'How much does Chippi cost?',
    a: 'Chippi is $97 per month on one simple plan.'
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every account starts with a 7-day free trial so you can test the workflow before paying.'
  }
];

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth relative overflow-x-hidden">
      {/* Radial hero glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(20,184,166,0.12),transparent_70%)]" />

      <PulseFitHero
        logo="Chippi"
        navigation={[
          { label: 'Problem', onClick: () => { onTrack('pill_nav_click', { section: 'problem', source: 'hero_nav' }); window.location.hash = '#problem'; } },
          { label: 'Solution', onClick: () => { onTrack('pill_nav_click', { section: 'solution', source: 'hero_nav' }); window.location.hash = '#solution'; } },
          { label: 'How it works', onClick: () => { onTrack('pill_nav_click', { section: 'how-it-works', source: 'hero_nav' }); window.location.hash = '#how-it-works'; } },
          { label: 'Pricing', onClick: () => { onTrack('pill_nav_click', { section: 'pricing', source: 'hero_nav' }); window.location.hash = '#pricing'; } },
          { label: 'FAQ', onClick: () => { onTrack('pill_nav_click', { section: 'faq', source: 'hero_nav' }); window.location.hash = '#faq'; } }
        ]}
        ctaButton={{
          label: 'Log in',
          onClick: () => {
            onTrack('hero_cta_click', { location: 'hero_nav_login' });
            window.location.href = '/sign-in';
          }
        }}
        title="Qualify leasing leads without the chaos"
        subtitle="One intake link. Structured qualification. Practical AI scoring. Follow up faster from one clean workflow."
        primaryAction={{
          label: 'Start free trial',
          onClick: () => {
            onTrack('hero_cta_click', { location: 'hero' });
            window.location.href = '/sign-up';
          }
        }}
        secondaryAction={{
          label: 'See how it works',
          onClick: () => {
            onTrack('pill_nav_click', { section: 'how-it-works', source: 'hero' });
            window.location.hash = '#how-it-works';
          }
        }}
        disclaimer="*7-day free trial · No credit card required"
        socialProof={{
          avatars: [
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
            'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop',
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop',
            'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=80&h=80&fit=crop'
          ],
          text: 'Built for modern solo realtors handling renter and leasing leads'
        }}
        programs={[
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhGMcGZtyL4M4bkN4ih0093zMY_rTFuC96zzFIKtfwmOWquEs3Sk-XRKpCOBGtRQ-B0Hs7Rxh5oIU2jDmnzroGPjanrMOnCJMUh-mvhVo4q41zDaWyJ2YAbRdZ5QvOb87XQCWPwWoseCUovKM4wfWAv8xMB0vJrHwEThu7hixCGPrl8Cp3wR4FlOaLqOg7J/s320/image%20(9).webp',
            category: 'INTAKE',
            title: 'One clean renter application link'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjD2O0IZ0h1I9vgmeVaPXnzI_jW-QQ5F2btwiicMK3w6VOFalshOQf1fMcTcp_JoZxLgBSldtUuuzgtiX5wtgUiveo61ZhHTbTXOh4QvdWt2hh26xU_TNtGNShy50mFfd_9dOrVz3Nb4mZ80Wme1dn9piIUfmAZSoBhHLeNxTouqIlTDeudwAdhOxQACp2R/s320/image%20(20).webp',
            category: 'QUALIFICATION',
            title: 'Budget, timeline, and area details in one flow'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjvxm32eiKeYuMWzVrE8ceLPgtIYxarpuF7MEQ0x7GLvXHv0R3Imatn_HB7Dp0JKBmSj-OZV1Dh7YaLICwsJcvf0NGepCD8P57GplS_D6LvtH55equqXGab5FlQ3OeEREih8cJhxk3m6CM44jJWuqJaR4RaNA9KoNhyphenhyphen-kTPOFgTO3GUz3Vob52fX_yeXwKg/w376-h503/image%20(18).webp',
            category: 'SCORING',
            title: 'Practical lead scoring you can explain'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgLwJ0YL6WhcH21NDvTvwXf5QzFLnC9EswU6WJxsSkJIF-OwI0AmQOSJKdK7glFSkhj9EKVvYLnoioJYcV4Zk8pOTWiz5tnzjtokZbsg0NNLndICQYwkpC3YxNumbpb4lihz_TX1wPalludzUsnYUlVsbMlpewT7dGbidTVxejO_eOxy68KODvFyK0scsoA/w378-h506/image%20(19).webp',
            category: 'FOLLOW-UP',
            title: 'Triage faster from one lightweight command center'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhiZ1tFXPwDXluFGeBqEXACxplP1iQ_81eRUVIUZNQerUihAeSWaTbqR1NzLPIcSqzwY8Vx3UWSMzn81oISmradd83ibWnDpKcf3m0ucXTOqy1Nf5QrXQGMQ5oxDQye-GMbYA_egtdzlGCO7ZlbMg2Go0qwi0BPcZHpH7MS9Cd4XQfY8cNueudPbwD_wtyz/s320/image%20(16).webp',
            category: 'WORKFLOW',
            title: 'Stay organized from inquiry to follow-up'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhngTR2PdwGNsbqWfcYeys1VueaJnXPMxAP_HddEbm9_0hovwbXHtcpvYFKTm6O5XyVkQA7CzwrprZnhw801GuxYa3rU00L-fvptf4Fz_RTVNClMkUtonP-02eE53c4qcX88_xux8oHXnTjh0RIDJ-6m1y6UOrxFxYhwDW0bZpaeePK-IA3pFFXWvrUIU8s/s320/image%20(14).webp',
            category: 'CRM',
            title: 'All lead context in one command center'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi3PfScU4mNCfuh2GZwML64cHH2FnC-YKJJWySY8JuKSxgM4nh5oRzYmBWmG99vw25ltzW6mM8TOTnc7jZEgYM0R2bPKcysD3SbTFKXmukopF5mmLOH5fMx8H-X_0ZMu5JejkHbrJMe9oDP1nWQ1zMMHhkX3xICg3erJjvwQQtloybCJQbiaftespj8mNYv/s320/image%20(10).webp',
            category: 'SPEED',
            title: 'Act faster with cleaner lead data'
          },
          {
            image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh-6yyH4q_xbd0MXJyqr5v-qlp9sTNJwWtuTGZqSM1g3NmyLuMGTshyphenhyphenOlGWsdZBn7sC4jK7-c2bLa_EniNXh9YDIPdEMXRDGPUzOqcozCUFEnWCtOndrTSzrkjG9Q0FoLhyIuH_RIKhDGi4zY4G0D45iYnQM3mz-2jGd3Zlu23YPnaxG6COSM-REkO2Kw3S/s320/image%20(12).webp',
            category: 'CONSISTENCY',
            title: 'Professional intake experience every time'
          }
        ]}
      />

      <FeatureSection />

      {/* Problem */}
      <section id="problem" className="py-20 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)] grid md:grid-cols-2 gap-8 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">The problem</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight leading-tight">
                Leasing inquiries move fast.<br />Most workflows don&apos;t.
              </h2>
            </div>
            <div className="space-y-3 text-muted-foreground leading-relaxed text-sm">
              <p>
                Leads arrive through DMs, listing sites, texts, and forms. Important context gets lost,
                follow-up order gets fuzzy, and every day starts with cleanup.
              </p>
              <p>
                Chippi gives you one clean intake path and one command center so you can act faster with less manual chaos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section id="solution" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">The solution</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              One clean place to capture, qualify, and organize leasing leads.
            </h2>
            <div className="mt-8 grid md:grid-cols-2 gap-3">
              {[
                { title: 'One link intake', body: 'A single shareable URL collects every renter inquiry in a structured format.' },
                { title: 'Structured qualification', body: 'Budget, move-in date, neighborhoods, and household details — all captured automatically.' },
                { title: 'Lightweight CRM clarity', body: 'A focused command center for leasing leads, not a bloated sales tool repurposed for rentals.' },
                { title: 'Practical AI assistance', body: 'Prioritize who to call first with context-backed scoring, not just a number.' }
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-background px-5 py-4 hover:-translate-y-px transition-transform"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                    <p className="font-medium text-sm">{item.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed pl-5">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">From inquiry to action in four steps.</h2>
          <div className="mt-8 grid md:grid-cols-4 gap-4">
            {howItWorks.map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-border bg-card px-5 py-5 hover:-translate-y-px transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
              >
                <p className="text-2xl font-bold text-primary/20 tabular-nums">{item.step}</p>
                <p className="mt-3 font-semibold text-sm leading-snug">{item.title}</p>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product proof */}
      <section id="proof" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Product proof</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built for clear intake and clear action.</h2>
          <div className="mt-8 grid md:grid-cols-2 gap-4">
            {proofCards.map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-border bg-card px-6 py-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:-translate-y-px transition-transform"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/8 text-primary">
                  <card.icon size={20} />
                </div>
                <h3 className="mt-4 font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials marquee */}
      <section id="testimonials" className="py-20 px-0 border-t border-border overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Early feedback</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">What agents are saying.</h2>
        </div>
        <div className="marquee-track">
          <div className="marquee-content">
            {[...marqueeQuotes, ...marqueeQuotes].map((quote, i) => (
              <button
                key={`${quote}-${i}`}
                type="button"
                onClick={() => onTrack('testimonial_interaction', { index: String(i) })}
                className="rounded-full border border-border bg-card px-5 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                {quote}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 border-t border-border">
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-[0_4px_24px_-8px_rgba(13,148,136,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">One simple plan</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
              Fast leasing lead intake, qualification, and follow-up in one workflow.
            </p>
            <div className="mt-7 flex items-end justify-center gap-1">
              <span className="text-6xl font-bold tracking-tight">$97</span>
              <span className="text-muted-foreground text-lg mb-2">/ mo</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">7-day free trial &middot; Cancel any time</p>

            <div className="mt-6 space-y-2.5 text-sm text-left max-w-xs mx-auto">
              {[
                'Custom intake link',
                'Structured lead capture',
                'AI lead scoring & prioritization',
                'Leasing pipeline CRM',
                'Full follow-up workflow'
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2.5 text-muted-foreground">
                  <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <Link
              href="/sign-up"
              onClick={() => onTrack('pricing_cta_click', { location: 'pricing' })}
              className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm w-full justify-center"
            >
              Start free trial <Sparkles size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Answers before you start</h2>
          <div className="mt-8 space-y-2">
            {faqs.map((item, index) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-card px-5 py-4 transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
                onToggle={(e) => {
                  if ((e.currentTarget as HTMLDetailsElement).open) {
                    onTrack('faq_expand', { question_index: String(index + 1) });
                  }
                }}
              >
                <summary className="cursor-pointer list-none font-medium text-sm flex items-center justify-between gap-4">
                  <span>{item.q}</span>
                  <span className="text-muted-foreground/60 group-open:rotate-45 transition-transform flex-shrink-0 text-lg leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            One link.<br className="hidden md:block" /> Clear leads. Fast action.
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Start your free trial and feel the workflow compression in your first week.
          </p>
          <Link
            href="/sign-up"
            onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
            className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            Start free trial <ArrowRight size={16} />
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">7-day free trial &middot; No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-[1.8fr_1fr_1fr_1fr] gap-10">
            <div>
              <BrandLogo className="h-7" alt="Chippi" />
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs">
                Chippi helps solo realtors handle leasing leads faster with one intake link,
                structured qualification, and clean follow-up workflow.
              </p>
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'footer_card' })}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Start free trial
              </Link>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li><a href="#solution" className="hover:text-foreground transition-colors">Solution</a></li>
                <li><a href="#proof" className="hover:text-foreground transition-colors">Product proof</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Company</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li><a href="#testimonials" className="hover:text-foreground transition-colors">Customer feedback</a></li>
                <li><a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">X / Twitter</a></li>
                <li><a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">LinkedIn</a></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Legal</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li><Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                <li><Link href="/legal/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <p>&copy; {new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.</p>
            <p>Launch wedge: renter and leasing lead intake + qualification.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
