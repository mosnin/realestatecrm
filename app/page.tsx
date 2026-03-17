'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, Sparkles, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { track } from '@vercel/analytics';
import { Navbar } from '@/components/navbar';
import { BrandLogo } from '@/components/brand-logo';

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

/* Real product screenshots */
const screenshots = {
  intake: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhGMcGZtyL4M4bkN4ih0093zMY_rTFuC96zzFIKtfwmOWquEs3Sk-XRKpCOBGtRQ-B0Hs7Rxh5oIU2jDmnzroGPjanrMOnCJMUh-mvhVo4q41zDaWyJ2YAbRdZ5QvOb87XQCWPwWoseCUovKM4wfWAv8xMB0vJrHwEThu7hixCGPrl8Cp3wR4FlOaLqOg7J/s1600/image%20(9).webp',
  scoring: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjvxm32eiKeYuMWzVrE8ceLPgtIYxarpuF7MEQ0x7GLvXHv0R3Imatn_HB7Dp0JKBmSj-OZV1Dh7YaLICwsJcvf0NGepCD8P57GplS_D6LvtH55equqXGab5FlQ3OeEREih8cJhxk3m6CM44jJWuqJaR4RaNA9KoNhyphenhyphen-kTPOFgTO3GUz3Vob52fX_yeXwKg/s1600/image%20(18).webp',
  crm: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhngTR2PdwGNsbqWfcYeys1VueaJnXPMxAP_HddEbm9_0hovwbXHtcpvYFKTm6O5XyVkQA7CzwrprZnhw801GuxYa3rU00L-fvptf4Fz_RTVNClMkUtonP-02eE53c4qcX88_xux8oHXnTjh0RIDJ-6m1y6UOrxFxYhwDW0bZpaeePK-IA3pFFXWvrUIU8s/s1600/image%20(14).webp',
  workflow: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhiZ1tFXPwDXluFGeBqEXACxplP1iQ_81eRUVIUZNQerUihAeSWaTbqR1NzLPIcSqzwY8Vx3UWSMzn81oISmradd83ibWnDpKcf3m0ucXTOqy1Nf5QrXQGMQ5oxDQye-GMbYA_egtdzlGCO7ZlbMg2Go0qwi0BPcZHpH7MS9Cd4XQfY8cNueudPbwD_wtyz/s1600/image%20(16).webp',
  followup: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgLwJ0YL6WhcH21NDvTvwXf5QzFLnC9EswU6WJxsSkJIF-OwI0AmQOSJKdK7glFSkhj9EKVvYLnoioJYcV4Zk8pOTWiz5tnzjtokZbsg0NNLndICQYwkpC3YxNumbpb4lihz_TX1wPalludzUsnYUlVsbMlpewT7dGbidTVxejO_eOxy68KODvFyK0scsoA/s1600/image%20(19).webp',
  qualification: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjD2O0IZ0h1I9vgmeVaPXnzI_jW-QQ5F2btwiicMK3w6VOFalshOQf1fMcTcp_JoZxLgBSldtUuuzgtiX5wtgUiveo61ZhHTbTXOh4QvdWt2hh26xU_TNtGNShy50mFfd_9dOrVz3Nb4mZ80Wme1dn9piIUfmAZSoBhHLeNxTouqIlTDeudwAdhOxQACp2R/s1600/image%20(20).webp',
};

export default function HomePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />

      <main className="overflow-x-hidden">

        {/* ──────────────── 1. HERO ──────────────── */}
        <section className="section-dark relative min-h-[100svh] flex flex-col justify-center overflow-hidden">
          <div className="hero-glow" style={{ width: 700, height: 700, left: '50%', top: '45%', transform: 'translate(-50%, -50%)' }} />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 md:px-12">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="pill-badge">Leasing CRM for modern realtors</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]"
            >
              Your pipeline,{' '}
              <span className="gradient-text">finally</span>
              <br className="hidden sm:block" />
              under control.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.55 }}
              className="mt-6 text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed"
            >
              One intake link. AI lead scoring. A command center that keeps every
              deal moving — so you close faster with less busywork.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.75 }}
              className="mt-10 flex flex-col sm:flex-row items-start gap-3"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('hero_cta_click', { location: 'hero' })}
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Get early access
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
              >
                See how it works
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.95 }}
              className="mt-4 text-xs text-muted-foreground/60 tracking-wide"
            >
              7-day free trial &middot; No credit card required
            </motion.p>
          </div>
        </section>


        {/* ──────────────── 2. PRODUCT ──────────────── */}
        <section className="bg-background px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fadeUp()} className="text-center mb-14">
              <span className="pill-badge">The product</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight">
                See the whole picture. Act on what matters.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-md mx-auto">
                From renter inquiry to signed lease — structured, scored, and tracked in one place.
              </p>
            </motion.div>

            {/* Large hero screenshot */}
            <motion.div
              {...fadeUp(0.1)}
              className="rounded-2xl overflow-hidden border border-border bg-card card-elevated"
            >
              <img
                src={screenshots.workflow}
                alt="Chippi command center — full pipeline view"
                className="w-full h-auto"
              />
            </motion.div>

            {/* Two supporting screenshots */}
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <motion.div
                {...fadeUp(0.15)}
                className="rounded-2xl overflow-hidden border border-border bg-card card-elevated"
              >
                <img
                  src={screenshots.scoring}
                  alt="AI lead scoring view"
                  className="w-full h-auto"
                />
              </motion.div>
              <motion.div
                {...fadeUp(0.2)}
                className="rounded-2xl overflow-hidden border border-border bg-card card-elevated"
              >
                <img
                  src={screenshots.crm}
                  alt="Contact CRM view"
                  className="w-full h-auto"
                />
              </motion.div>
            </div>
          </div>
        </section>


        {/* ──────────────── 3. FEATURES ──────────────── */}
        <section className="bg-background px-6 md:px-12 pb-24 md:pb-36">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fadeUp()} className="mb-14">
              <span className="pill-badge">Features</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight">
                Three tools. One workflow.
              </h2>
            </motion.div>

            <div className="space-y-20">
              {/* Feature 1: Intake */}
              <motion.div {...fadeUp()} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight leading-snug">
                    One link captures every inquiry.
                  </h3>
                  <p className="mt-4 text-muted-foreground leading-relaxed">
                    Share a single intake link in your bio, listing replies, or email signature.
                    Every renter fills out the same structured form — budget, timeline, household
                    details — so your pipeline starts clean and consistent.
                  </p>
                  <Link
                    href="/features/intake"
                    className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="rounded-2xl overflow-hidden border border-border bg-card card-elevated">
                  <img src={screenshots.intake} alt="Intake link flow" className="w-full h-auto" />
                </div>
              </motion.div>

              {/* Feature 2: AI Scoring */}
              <motion.div {...fadeUp()} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div className="order-2 lg:order-1 rounded-2xl overflow-hidden border border-border bg-card card-elevated">
                  <img src={screenshots.qualification} alt="AI qualification breakdown" className="w-full h-auto" />
                </div>
                <div className="order-1 lg:order-2">
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight leading-snug">
                    Know who to call first.
                  </h3>
                  <p className="mt-4 text-muted-foreground leading-relaxed">
                    Every submission is scored across budget fit, move-in timeline, and qualification
                    signals. You get clear priorities and context — not just a number.
                  </p>
                  <Link
                    href="/features/ai-scoring"
                    className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>

              {/* Feature 3: Follow-up */}
              <motion.div {...fadeUp()} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight leading-snug">
                    Follow up from one place.
                  </h3>
                  <p className="mt-4 text-muted-foreground leading-relaxed">
                    Status, notes, contacts, and next steps — all in a single command center.
                    No more bouncing between DMs, spreadsheets, and sticky notes.
                  </p>
                  <Link
                    href="/features/pipeline"
                    className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="rounded-2xl overflow-hidden border border-border bg-card card-elevated">
                  <img src={screenshots.followup} alt="Follow-up command center" className="w-full h-auto" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ──────────────── 4. STATS ──────────────── */}
        <section className="section-dark py-20 md:py-28">
          <div className="mx-auto max-w-4xl px-6 md:px-12">
            <motion.div {...fadeUp()} className="grid grid-cols-3 gap-6 md:gap-12 text-center">
              {[
                { value: '< 2 min', label: 'to score a new lead' },
                { value: '92%', label: 'faster follow-up' },
                { value: '3x', label: 'more qualified conversations' },
              ].map((stat, i) => (
                <motion.div key={stat.label} {...fadeUp(i * 0.08)}>
                  <p className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-primary">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>


        {/* ──────────────── 5. PRICING ──────────────── */}
        <section className="bg-background px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-3xl">
            <motion.div {...fadeUp()} className="text-center mb-12">
              <span className="pill-badge">Pricing</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight">
                One plan. Everything included.
              </h2>
            </motion.div>

            <motion.div
              {...fadeUp(0.1)}
              className="rounded-2xl border border-border bg-card card-elevated overflow-hidden"
            >
              <div className="grid md:grid-cols-2">
                {/* Price */}
                <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-border">
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black tracking-tight">$97</span>
                    <span className="text-muted-foreground text-base mb-1">/ month</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">7-day free trial &middot; Cancel any time</p>

                  <div className="mt-8 flex flex-col gap-2.5">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home' })}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border text-sm font-medium hover:bg-accent transition-colors"
                    >
                      See details <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                {/* Features list */}
                <div className="p-8 md:p-10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">Includes</p>
                  <div className="space-y-3">
                    {[
                      'Custom intake link',
                      'AI lead scoring',
                      'Full pipeline CRM',
                      'Contact management',
                      'Analytics dashboard',
                      'Follow-up workflow',
                      'Unlimited leads',
                      'Email notifications',
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2.5 text-sm">
                        <Check size={14} className="text-primary shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ──────────────── 6. CLOSING CTA ──────────────── */}
        <section className="section-dark relative overflow-hidden">
          <div className="hero-glow" style={{ width: 600, height: 600, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />

          <div className="relative z-10 mx-auto max-w-3xl px-6 md:px-12 py-28 md:py-40 text-center">
            <motion.h2
              {...fadeUp()}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]"
            >
              Close more deals.
              <br />
              Start today.
            </motion.h2>
            <motion.p
              {...fadeUp(0.08)}
              className="mt-5 text-muted-foreground max-w-sm mx-auto"
            >
              Join the realtors who stopped juggling tools and started closing.
            </motion.p>
            <motion.div
              {...fadeUp(0.16)}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Get early access <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View features
              </Link>
            </motion.div>
          </div>
        </section>


        {/* ──────────────── 7. FOOTER ──────────────── */}
        <footer className="section-dark border-t border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-12">
            <div className="py-12 md:py-16 flex flex-col md:flex-row justify-between gap-8">
              <div>
                <BrandLogo className="h-8" alt="Chippi" />
                <p className="mt-3 text-sm text-muted-foreground max-w-xs">
                  Leasing workflow clarity for modern realtors.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {[
                  { href: '/features', label: 'Features' },
                  { href: '/pricing', label: 'Pricing' },
                  { href: '/faq', label: 'FAQ' },
                  { href: '/sign-up', label: 'Get started' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                    <ArrowUpRight className="size-3" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-border py-5 flex flex-col sm:flex-row justify-between gap-3">
              <p className="text-xs text-muted-foreground/50">
                &copy; {new Date().getFullYear()} Chippi. All rights reserved.
              </p>
              <div className="flex gap-5">
                {[
                  { href: '/legal/terms', label: 'Terms' },
                  { href: '/legal/privacy', label: 'Privacy' },
                  { href: '/legal/cookies', label: 'Cookies' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
