import Link from 'next/link';
import {
  Users,
  Briefcase,
  Bot,
  Shield,
  Zap,
  BarChart3,
  ArrowRight,
  Building2,
  Star,
  CheckCircle2
} from 'lucide-react';

const features = [
  {
    icon: Users,
    title: 'Client Pipeline',
    description:
      'Track every client from qualification through tour to application. Never lose a lead again.'
  },
  {
    icon: Briefcase,
    title: 'Deal Management',
    description:
      'Kanban boards, deal stages, priorities, and values. See your entire pipeline at a glance.'
  },
  {
    icon: Bot,
    title: 'AI Assistant',
    description:
      'Get instant insights about your pipeline, draft follow-ups, and surface the deals that need attention.'
  },
  {
    icon: BarChart3,
    title: 'Pipeline Analytics',
    description:
      'Real-time metrics on deal volume, conversion rates, and revenue forecasting across every stage.'
  },
  {
    icon: Shield,
    title: 'Secure Workspaces',
    description:
      'Isolated workspaces for your brokerage. Each agent gets their own environment with full data privacy.'
  },
  {
    icon: Zap,
    title: 'Built for Speed',
    description:
      'Instant search, keyboard shortcuts, and a snappy interface. No loading spinners, no waiting.'
  }
];

const stats = [
  { value: '3x', label: 'Faster deal closing' },
  { value: '40%', label: 'More client touchpoints' },
  { value: '2hrs', label: 'Saved per day on admin' },
  { value: '99.9%', label: 'Uptime guaranteed' }
];

const steps = [
  {
    step: '01',
    title: 'Create your workspace',
    description: 'Sign up and name your workspace in under 30 seconds. No credit card required.'
  },
  {
    step: '02',
    title: 'Import your clients',
    description: 'Add your clients and deals manually or let the AI assistant help you organize your pipeline.'
  },
  {
    step: '03',
    title: 'Close more deals',
    description: 'Use AI-powered insights, pipeline analytics, and automated follow-ups to win more business.'
  }
];

const testimonials = [
  {
    quote: 'I went from juggling spreadsheets to closing 12 deals in my first quarter using this CRM. The AI assistant is a game-changer.',
    name: 'Sarah Chen',
    role: 'Residential Agent, Keller Williams',
    rating: 5
  },
  {
    quote: 'The deal pipeline view alone is worth switching. I can see exactly where every transaction stands and what needs my attention today.',
    name: 'Marcus Rivera',
    role: 'Broker, RE/MAX Elite',
    rating: 5
  },
  {
    quote: 'Finally a CRM that was built for how agents actually work. Fast, simple, and the AI saves me hours every week.',
    name: 'Jennifer Park',
    role: 'Team Lead, Compass',
    rating: 5
  }
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Building2 size={22} className="text-white" />
            <span className="font-semibold text-[15px] tracking-tight">WorkflowRouting</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-neutral-200 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-40 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-neutral-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Now in public beta
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08]">
            Close more deals.<br />
            <span className="text-neutral-500">Spend less time on admin.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            The CRM built for real estate agents who want to focus on selling,
            not spreadsheets. AI-powered pipeline management that actually helps
            you close.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 bg-white text-black px-8 py-3.5 rounded-full font-medium hover:bg-neutral-200 transition-colors text-sm"
            >
              START FOR FREE <ArrowRight size={16} />
            </Link>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 px-8 py-3.5 rounded-full font-medium border border-white/15 text-neutral-300 hover:bg-white/5 transition-colors text-sm"
            >
              Sign in to your workspace
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold tracking-tight">{stat.value}</div>
              <div className="mt-1 text-sm text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Everything you need to manage your pipeline
            </h2>
            <p className="mt-4 text-neutral-400 max-w-2xl mx-auto">
              Purpose-built tools for real estate professionals. No bloat, no learning curve.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.05] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">
                  <feature.icon size={20} className="text-neutral-300" />
                </div>
                <h3 className="text-[15px] font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Up and running in minutes
            </h2>
            <p className="mt-4 text-neutral-400">
              Three simple steps to transform how you manage your real estate business.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((item) => (
              <div key={item.step} className="relative">
                <div className="text-5xl font-bold text-white/[0.06] mb-4">{item.step}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Trusted by agents who close
            </h2>
            <p className="mt-4 text-neutral-400">
              Hear from real estate professionals using WorkflowRouting every day.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-neutral-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Ready to close more deals?
          </h2>
          <p className="mt-4 text-neutral-400 text-lg">
            Join thousands of agents who switched to a CRM that actually works for real estate.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 bg-white text-black px-8 py-3.5 rounded-full font-medium hover:bg-neutral-200 transition-colors text-sm"
            >
              CREATE FREE ACCOUNT <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> No credit card</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Free forever plan</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Setup in 30 seconds</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <Building2 size={20} className="text-white" />
                <span className="font-semibold text-sm">WorkflowRouting</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                The modern CRM for real estate professionals who want to close more deals, faster.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-neutral-500">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
                <li><a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-neutral-600">&copy; 2025 WorkflowRouting. All rights reserved.</p>
            <div className="flex items-center gap-6 text-xs text-neutral-600">
              <a href="#" className="hover:text-neutral-400 transition-colors">Twitter</a>
              <a href="#" className="hover:text-neutral-400 transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-neutral-400 transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
