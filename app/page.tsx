'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Gauge,
  Link2,
  MessageSquareMore,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { track } from '@vercel/analytics';
import { useTheme } from '@/components/theme-provider';
import { BrandLogo } from '@/components/brand-logo';

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

const marqueeQuotes = [
  '“Feels way cleaner than managing renter leads in DMs.”',
  '“I can finally tell who to follow up with first.”',
  '“The intake flow makes me look organized right away.”',
  '“Simple on purpose. That’s exactly what I needed.”',
  '“I open one view and know what to do next.”'
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
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth relative overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.14),transparent_60%)]" />

      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 h-16 grid grid-cols-[auto_1fr_auto] items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo className="h-7" alt="Chippi" />
          </Link>

          <nav className="hidden lg:flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 p-1.5 shadow-sm">
              {pillNav.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => onTrack('pill_nav_click', { section: item.id, source: 'header_pill_menu' })}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-surface"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              onClick={() => onTrack('hero_cta_click', { location: 'header' })}
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium hover:opacity-90 transition-colors"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-20 md:pt-24 pb-12 px-6 relative">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs text-muted-foreground">
            <CircleDashed size={12} className="text-primary" />
            Leasing-first workflow for solo realtors
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.08]">
            Qualify leasing leads without the chaos
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Chippi helps realtors capture, qualify, and organize leasing leads from one clean workflow,
            so follow up is faster, clearer, and more professional.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              onClick={() => onTrack('hero_cta_click', { location: 'hero' })}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-full font-medium hover:opacity-90 transition-colors"
            >
              Start free trial <ArrowRight size={16} />
            </Link>
            <a
              href="#how-it-works"
              onClick={() => onTrack('pill_nav_click', { section: 'how-it-works', source: 'hero' })}
              className="px-8 py-3 rounded-full font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              See how it works
            </a>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-3 text-left max-w-4xl mx-auto">
            {[
              { label: 'One intake link', tone: 'text-primary' },
              { label: 'Structured qualification', tone: 'text-lead-cold' },
              { label: 'Practical lead scoring', tone: 'text-lead-warm' }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card/90 p-4 shadow-[0_12px_30px_-22px_rgba(17,24,39,0.45)]">
                <p className={`text-xs font-semibold uppercase tracking-wide ${item.tone}`}>{item.label}</p>
                <p className="mt-2 text-xs text-muted-foreground">Built for leasing speed, clarity, and cleaner daily execution.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="problem" className="py-16 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-start rounded-2xl border border-border bg-card p-8 shadow-[0_20px_50px_-40px_rgba(17,24,39,0.45)]">
          <div>
            <p className="text-sm text-primary font-medium">The problem</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Leasing inquiries move fast. Most workflows don&apos;t.
            </h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Leads arrive through DMs, listing sites, texts, and forms. Important context gets lost, follow-up
            order gets fuzzy, and every day starts with cleanup. Chippi gives you one clean intake path and one
            command center so you can act faster with less manual chaos.
          </p>
        </div>
      </section>

      <section id="solution" className="py-16 px-6">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card p-8 md:p-10 shadow-[0_20px_50px_-40px_rgba(17,24,39,0.45)]">
          <p className="text-sm text-primary font-medium">The solution</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">One clean place to capture, qualify, and organize leasing leads.</h2>
          <div className="mt-6 grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="rounded-xl border border-border bg-surface p-4 hover:-translate-y-0.5 transition-transform">One link intake</div>
            <div className="rounded-xl border border-border bg-surface p-4 hover:-translate-y-0.5 transition-transform">Structured qualification</div>
            <div className="rounded-xl border border-border bg-surface p-4 hover:-translate-y-0.5 transition-transform">Lightweight CRM clarity</div>
            <div className="rounded-xl border border-border bg-surface p-4 hover:-translate-y-0.5 transition-transform">Practical AI assistance</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-primary font-medium">How it works</p>
          <div className="mt-4 grid md:grid-cols-4 gap-4">
            {[
              'Share your intake link',
              'Capture structured renter details',
              'Review scored leads with context',
              'Follow up from one workflow'
            ].map((step, idx) => (
              <div key={step} className="rounded-xl border border-border bg-card p-5 hover:-translate-y-0.5 transition-transform">
                <p className="text-xs text-muted-foreground">Step {idx + 1}</p>
                <p className="mt-2 font-medium">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-primary font-medium">Why Chippi</p>
          <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="font-medium">Not another bloated CRM</p>
              <p className="mt-2 text-muted-foreground">Built for leasing first with practical workflows you can run daily.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="font-medium">Faster qualification</p>
              <p className="mt-2 text-muted-foreground">Move from inquiry to prioritized action without spreadsheet cleanup.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="font-medium">Professional follow-up flow</p>
              <p className="mt-2 text-muted-foreground">Keep context, status, and next steps in one lightweight command center.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="font-medium">Setup in minutes</p>
              <p className="mt-2 text-muted-foreground">Get your intake link live quickly and start capturing structured leads today.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="proof" className="py-16 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-primary font-medium">Product proof</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Built for clear intake and clear action.</h2>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            {proofCards.map((card) => (
              <div key={card.title} className="rounded-xl border border-border bg-card p-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface text-primary">
                  <card.icon size={20} />
                </div>
                <h3 className="mt-4 font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-16 px-0 border-t border-border overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 mb-5">
          <p className="text-sm text-primary font-medium">Early feedback</p>
        </div>
        <div className="marquee-track">
          <div className="marquee-content">
            {[...marqueeQuotes, ...marqueeQuotes].map((quote, i) => (
              <button
                key={`${quote}-${i}`}
                type="button"
                onClick={() => onTrack('testimonial_interaction', { index: String(i) })}
                className="rounded-full border border-border bg-card px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {quote}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card p-8 text-center shadow-[0_24px_60px_-45px_rgba(20,184,166,0.65)]">
          <p className="text-sm text-primary font-medium">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">One simple plan</h2>
          <p className="mt-4 text-muted-foreground">
            Fast leasing lead intake, qualification, and follow-up in one workflow.
          </p>
          <div className="mt-6">
            <span className="text-5xl font-bold">$97</span>
            <span className="text-muted-foreground"> / month</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">7-day free trial. No long setup cycle.</p>
          <Link
            href="/sign-up"
            onClick={() => onTrack('pricing_cta_click', { location: 'pricing' })}
            className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-full font-medium hover:opacity-90 transition-colors"
          >
            Start free trial <Sparkles size={16} />
          </Link>
        </div>
      </section>

      <section id="faq" className="py-16 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-primary font-medium">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Answers before you start</h2>
          <div className="mt-8 space-y-3">
            {faqs.map((item, index) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-card p-5"
                onToggle={(e) => {
                  if ((e.currentTarget as HTMLDetailsElement).open) {
                    onTrack('faq_expand', { question_index: String(index + 1) });
                  }
                }}
              >
                <summary className="cursor-pointer list-none font-medium flex items-center justify-between gap-4">
                  <span>{item.q}</span>
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">One link. Clear leads. Fast action.</h2>
          <p className="mt-4 text-muted-foreground">
            Start your free trial and feel the workflow compression in your first week.
          </p>
          <Link
            href="/sign-up"
            onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
            className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-full font-medium hover:opacity-90 transition-colors"
          >
            Start free trial <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-surface/70 relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="rounded-2xl border border-border bg-background p-8 md:p-10">
            <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10">
              <div>
                <BrandLogo className="h-8" alt="Chippi" />
                <p className="mt-4 text-sm text-muted-foreground max-w-sm">
                  Chippi helps solo realtors handle leasing leads faster with one intake link, structured qualification, and clean follow-up workflow.
                </p>
                <Link
                  href="/sign-up"
                  onClick={() => onTrack('footer_cta_click', { location: 'footer_card' })}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90"
                >
                  Start free trial
                </Link>
              </div>

              <div>
                <p className="text-sm font-semibold">Product</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li><a href="#solution" className="hover:text-foreground">Solution</a></li>
                  <li><a href="#proof" className="hover:text-foreground">Product proof</a></li>
                  <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                  <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold">Company</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li><a href="#testimonials" className="hover:text-foreground">Customer feedback</a></li>
                  <li><a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-foreground">X / Twitter</a></li>
                  <li><a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-foreground">LinkedIn</a></li>
                </ul>
              </div>

              <div>
                <p className="text-sm font-semibold">Legal</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
                  <li><Link href="/legal/terms" className="hover:text-foreground">Terms of Service</Link></li>
                  <li><Link href="/legal/cookies" className="hover:text-foreground">Cookie Policy</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <p>© {new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.</p>
              <p>Launch wedge: renter and leasing lead intake + qualification.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
