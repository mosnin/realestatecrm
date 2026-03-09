'use client';

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
  CheckCircle2,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

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

export default function HomePage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-[#0a0a0a] dark:text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0a0a]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Building2 size={22} className="text-neutral-900 dark:text-white" />
            <span className="font-semibold text-[15px] tracking-tight">WorkflowRouting</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-600 dark:text-neutral-400">
            <a href="#features" className="hover:text-neutral-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#testimonials" className="hover:text-neutral-900 dark:hover:text-white transition-colors">Testimonials</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link href="/sign-in" className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors">Log in</Link>
            <Link href="/sign-up" className="text-sm bg-neutral-900 text-white px-4 py-2 rounded-full font-medium hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors">Get started</Link>
          </div>
        </div>
      </header>

      <section className="pt-40 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 bg-neutral-50 text-xs text-neutral-600 mb-8 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Now in public beta
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08]">
            Close more deals.<br />
            <span className="text-neutral-500">Spend less time on admin.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            The CRM built for real estate agents who want to focus on selling,
            not spreadsheets. AI-powered pipeline management that actually helps
            you close.
          </p>
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-neutral-50/70 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold tracking-tight">{stat.value}</div>
              <div className="mt-1 text-sm text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to manage your pipeline</h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">Purpose-built tools for real estate professionals. No bloat, no learning curve.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-neutral-200 bg-white p-6 hover:bg-neutral-50 transition-colors dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
                <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-white/10 flex items-center justify-center mb-4">
                  <feature.icon size={20} className="text-neutral-700 dark:text-neutral-300" />
                </div>
                <h3 className="text-[15px] font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-24 px-6 border-t border-neutral-200 dark:border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Trusted by agents who close</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["Sarah Chen", "Marcus Rivera", "Jennifer Park"].map((name) => (
              <div key={name} className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex gap-1 mb-4">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} className="fill-amber-400 text-amber-400" />)}</div>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mb-6">“Finally a CRM that was built for how agents actually work.”</p>
                <p className="text-sm font-medium">{name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6 border-t border-neutral-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Ready to close more deals?</h2>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up" className="flex items-center gap-2 bg-neutral-900 text-white px-8 py-3.5 rounded-full font-medium hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors text-sm">
              CREATE FREE ACCOUNT <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> No credit card</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Free forever plan</span>
          </div>
        </div>
      </section>
    </div>
  );
}
