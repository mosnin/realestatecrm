import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MessageSquareMore,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';

const features = [
  {
    icon: ClipboardCheck,
    title: 'Renter intake that actually converts',
    description:
      'Publish a polished intake link in minutes and collect complete, structured applications without back-and-forth.',
  },
  {
    icon: TrendingUp,
    title: 'Prioritized follow-up queue',
    description:
      'See who to call first with clear scoring, summaries, and watchouts so you can move faster with confidence.',
  },
  {
    icon: Users,
    title: 'CRM cards created automatically',
    description:
      'Every submission flows into your workspace with the context you need to respond professionally and close faster.',
  },
  {
    icon: MessageSquareMore,
    title: 'AI summaries you can trust',
    description:
      'Get concise, practical overviews of each application so you can scan quickly and focus on action.',
  },
  {
    icon: Clock3,
    title: 'Built for busy solo realtors',
    description:
      'Simple defaults, calm UI, and no setup maze. You can start using Chippi the same day you sign up.',
  },
  {
    icon: BadgeCheck,
    title: 'Professional applicant experience',
    description:
      'Give renters a clean, branded flow that sets expectations and makes your process look organized from day one.',
  },
];

const stats = [
  { value: '10 min', label: 'to publish your intake link' },
  { value: '7-step', label: 'guided renter application flow' },
  { value: '24/7', label: 'application capture for inbound leads' },
  { value: '1 view', label: 'to see scoring + CRM context' },
];

const testimonials = [
  {
    quote:
      'Chippi made me look like I had a full ops team. My intake link was live in one afternoon and follow-up got way easier.',
    name: 'Tanya Brooks',
    role: 'Leasing Agent, Independent',
  },
  {
    quote:
      'I stopped losing renter leads in text threads. Now applications come in complete and I know who to prioritize instantly.',
    name: 'Miguel Santos',
    role: 'Solo Realtor',
  },
  {
    quote:
      'The workflow is simple and clean. I send one link, Chippi handles structure, and I spend more time closing.',
    name: 'Avery Collins',
    role: 'Broker Associate',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-blue-100/80 via-cyan-50 to-transparent" />

      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-600 p-1.5 text-white">
              <Building2 size={16} />
            </div>
            <span className="text-sm font-semibold tracking-tight">Chippi</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#reviews" className="hover:text-slate-900">Reviews</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-6 pb-14 pt-14 md:pt-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Sparkles size={13} />
                Built for renter lead qualification
              </div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 md:text-5xl">
                Turn renter leads into organized deals with <span className="text-blue-600">Chippi</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                Publish one intake link, collect complete applications, and route every submission into a CRM workflow you can act on fast.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                  Launch your intake flow
                  <ArrowRight size={15} />
                </Link>
                <Link href="/dashboard" className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Go to dashboard
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-500">No credit card required • Setup in minutes</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Sample application snapshot</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Jordan Lee • 2BR Midtown</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">WARM</span>
                  </div>
                  <p className="mt-1 text-slate-600">Move-in: May 1 • Income band: moderate</p>
                  <p className="mt-2 text-slate-700">Summary: Complete docs, stable employment, no eviction flags. Follow up within 24 hours.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Submission status</p>
                    <p className="mt-1 font-semibold">Under review</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Next action</p>
                    <p className="mt-1 font-semibold">Call this afternoon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-6 py-10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="mt-1 text-xs text-slate-600">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to launch fast</h2>
            <p className="mt-3 text-slate-600">Chippi is focused on activation: intake live, submissions captured, and follow-up clearly prioritized.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <item.icon size={18} className="text-blue-600" />
                <h3 className="mt-3 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-slate-200 bg-white px-6 py-16 md:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold tracking-tight">From signup to live intake in 3 steps</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ['01', 'Complete onboarding', 'Add your basics and choose your public intake slug.'],
                ['02', 'Publish your link', 'Share your branded application link in DMs, email, or listing replies.'],
                ['03', 'Work qualified leads', 'Chippi routes submissions into CRM cards with score + summary.'],
              ].map(([num, title, desc]) => (
                <div key={num} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold text-blue-600">STEP {num}</p>
                  <p className="mt-2 font-semibold">{title}</p>
                  <p className="mt-2 text-sm text-slate-600">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="reviews" className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight">Realtors love the speed</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} className="fill-current" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-slate-700">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-4 text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-slate-500">{t.role}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-blue-600 px-6 py-14 text-white">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Ready to launch your intake workflow?</h2>
              <p className="mt-2 text-sm text-blue-100">Create your Chippi workspace and publish your application link today.</p>
            </div>
            <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              Start with Chippi
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Chippi</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Intake-ready by default</span>
            <span className="inline-flex items-center gap-1"><Sparkles size={12} /> AI-powered triage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
