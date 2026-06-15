'use client';

/**
 * SiteHeader — the dark, cinematic sticky header (reference-matched).
 *
 * Behaviour:
 *  - At the very top, the header is transparent and full-bleed over the hero.
 *  - On scroll it collapses into a glassy ROUNDED floating pill: it pulls in
 *    from the edges, gains a backdrop-blur + semi-transparent near-black fill +
 *    a hairline border + soft shadow, and rounds to a pill. Driven by
 *    framer-motion `useScroll` + `useMotionValueEvent` (a threshold flips a
 *    `scrolled` flag; the bar animates between the two states).
 *
 * Nav:
 *  - Left: the Chippi logo (white treatment, always-dark site).
 *  - Center/left: Agents (opens a blurred mega-menu of Chippi capabilities),
 *    Brokerages, Pricing.
 *  - Right: "Sign in" (text) + "See a demo" (white rounded-full pill).
 *  - Mobile: a full-screen blurred takeover.
 *
 * Copy is Chippi/real-estate; only the visual aesthetic matches the reference.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
  useReducedMotion,
} from 'framer-motion';
import {
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  MessagesSquare,
  Target,
  Mic,
  KanbanSquare,
  Inbox,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

const SIGNIN = '/login/realtor';
const DEMO = '/demo';

interface MegaItem {
  icon: React.ElementType;
  label: string;
  desc: string;
  href: string;
}

/** The "Agents" mega-menu — Chippi capabilities, reference-styled panel. */
const AGENT_MENU: MegaItem[] = [
  { icon: MessagesSquare, label: 'Natural conversations', desc: 'Replies drafted in your voice, ready before you open the thread', href: '/agents' },
  { icon: Target, label: 'Smart insights', desc: 'Every lead scored against your live pipeline', href: '/agents' },
  { icon: Mic, label: 'Natural voice', desc: 'Talk to your CRM between showings, hands free', href: '/agents' },
  { icon: KanbanSquare, label: 'Pipeline automation', desc: 'Tours booked, deals advanced, the log kept current', href: '/agents' },
  { icon: Inbox, label: 'Omnichannel inbox', desc: 'Email, text, and calls in one worked queue', href: '/agents' },
  { icon: PenLine, label: 'Content studio', desc: 'Listings and posts written on the go', href: '/agents' },
];

const FEATURED = {
  eyebrow: 'MEET CHIPPI',
  title: 'The AI cowork for your floor.',
  body: 'It reads, scores, drafts, books, and follows up — so the busywork runs itself.',
  cta: 'See a demo',
  href: DEMO,
};

const NAV_LINKS = [
  { label: 'Brokerages', href: '/brokerages' },
  { label: 'Pricing', href: '/pricing' },
];

export function SiteHeader() {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Scroll-driven blur: flip `scrolled` once the page leaves the very top.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 24);
  });

  // Close the mega menu on outside-click + Escape.
  useEffect(() => {
    if (!agentsOpen) return;
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setAgentsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAgentsOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [agentsOpen]);

  // Lock body scroll while the mobile takeover is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const closeAll = useCallback(() => {
    setAgentsOpen(false);
    setMobileOpen(false);
  }, []);

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  };

  return (
    <>
      {/* The header is fixed; on scroll the INNER shell pulls in + rounds into
          a floating glass pill (the outer wrapper just sets the gutters). */}
      <header ref={navRef} className="fixed inset-x-0 top-0 z-50">
        <motion.div
          initial={false}
          animate={{
            marginTop: scrolled ? 12 : 0,
            paddingLeft: scrolled ? 16 : 0,
            paddingRight: scrolled ? 16 : 0,
          }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
          className="mx-auto w-full max-w-7xl px-3 sm:px-5"
        >
          <motion.div
            initial={false}
            animate={{
              backgroundColor: scrolled ? 'rgba(12,12,12,0.72)' : 'rgba(10,10,10,0)',
              borderColor: scrolled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0)',
              borderRadius: scrolled ? 9999 : 0,
              boxShadow: scrolled
                ? '0 12px 40px -16px rgba(0,0,0,0.7)'
                : '0 0px 0px 0px rgba(0,0,0,0)',
            }}
            // Safari: framer doesn't type -webkit-backdrop-filter, so set both
            // statically; they re-apply when `scrolled` changes the className.
            style={{
              backdropFilter: scrolled ? 'blur(16px)' : 'blur(0px)',
              WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'blur(0px)',
            }}
            transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
            className="relative border"
          >
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              {/* Brand (white logo, always-dark site) */}
              <Link href="/" aria-label="Chippi home" className="flex items-center" onClick={closeAll}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="h-5 w-auto" />
              </Link>

              {/* Desktop nav */}
              <nav className="hidden items-center gap-1 lg:flex">
                <button
                  type="button"
                  aria-expanded={agentsOpen}
                  onClick={() => setAgentsOpen((v) => !v)}
                  onMouseEnter={() => setAgentsOpen(true)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1 rounded-full px-4 py-2 text-sm transition-colors',
                    agentsOpen ? 'text-white' : 'text-white/70 hover:text-white',
                  )}
                >
                  Agents
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform duration-200', agentsOpen && 'rotate-180')}
                  />
                </button>
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={closeAll}
                    className="rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>

              {/* Right */}
              <div className="flex items-center gap-2">
                <Link
                  href={SIGNIN}
                  className="hidden rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:text-white lg:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href={DEMO}
                  className="hidden h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98] lg:inline-flex"
                >
                  See a demo
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  aria-label="Open menu"
                  onClick={() => setMobileOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08] lg:hidden"
                >
                  <Menu size={20} />
                </button>
              </div>
            </div>

            {/* Agents mega-menu — blurred panel, featured story + link grid */}
            <AnimatePresence>
              {agentsOpen && (
                <motion.div
                  key="agents-mega"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                  className="absolute left-1/2 top-[calc(100%+10px)] hidden w-[760px] max-w-[calc(100vw-2rem)] -translate-x-1/2 lg:block"
                  onMouseLeave={() => setAgentsOpen(false)}
                >
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]/90 shadow-2xl shadow-black/60 backdrop-blur-2xl">
                    <div className="grid grid-cols-[280px_1fr]">
                      {/* Featured story */}
                      <Link
                        href={FEATURED.href}
                        onClick={closeAll}
                        className="group/feat relative flex flex-col justify-between overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#ff7a45]/12 via-[#0d0d0d] to-[#0d0d0d] p-6"
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,122,69,0.22),transparent_70%)]"
                        />
                        <div>
                          <p
                            style={{ fontFamily: 'var(--font-mono-display)' }}
                            className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#ff9a6e]"
                          >
                            {FEATURED.eyebrow}
                          </p>
                          <p
                            style={{
                              fontFamily: 'var(--font-serif-display)',
                              fontVariationSettings: '"opsz" 144',
                            }}
                            className="mt-3 text-[22px] font-light leading-snug text-white"
                          >
                            {FEATURED.title}
                          </p>
                          <p className="mt-2.5 text-xs leading-relaxed text-white/55">{FEATURED.body}</p>
                        </div>
                        <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white">
                          {FEATURED.cta}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/feat:translate-x-0.5" />
                        </span>
                      </Link>

                      {/* Link grid */}
                      <div className="grid grid-cols-2 gap-0.5 p-4">
                        {AGENT_MENU.map((it) => {
                          const Icon = it.icon;
                          return (
                            <Link
                              key={it.label}
                              href={it.href}
                              onClick={closeAll}
                              className="group flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                            >
                              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 transition-colors group-hover:border-[#ff7a45]/40 group-hover:text-[#ff9a6e]">
                                <Icon className="h-[15px] w-[15px]" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-white">{it.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                                  {it.desc}
                                </span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </header>

      {/* Mobile full-screen takeover */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[100] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
          >
            <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-xl" />
            <motion.div
              className="relative flex h-full flex-col"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
            >
              <div className="flex h-16 items-center justify-between px-5">
                <Link href="/" className="flex items-center" onClick={closeAll}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="h-5 w-auto" />
                </Link>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/[0.08]"
                >
                  <X size={20} />
                </button>
              </div>

              <motion.nav
                className="flex-1 space-y-2 overflow-y-auto px-5 py-8"
                variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}
                initial="hidden"
                animate="show"
              >
                {[{ label: 'Agents', href: '/agents' }, ...NAV_LINKS].map((l) => (
                  <motion.div key={l.label} variants={itemVariants}>
                    <Link
                      href={l.href}
                      onClick={closeAll}
                      style={{
                        fontFamily: 'var(--font-serif-display)',
                        fontVariationSettings: '"opsz" 144',
                      }}
                      className="block py-2 text-3xl font-light text-white"
                    >
                      {l.label}
                    </Link>
                  </motion.div>
                ))}
              </motion.nav>

              <div className="space-y-3 border-t border-white/10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
                <Link
                  href={DEMO}
                  onClick={closeAll}
                  className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-white text-sm font-medium text-black"
                >
                  See a demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={SIGNIN}
                  onClick={closeAll}
                  className="flex h-12 w-full items-center justify-center rounded-full border border-white/15 text-sm font-medium text-white"
                >
                  Sign in
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
