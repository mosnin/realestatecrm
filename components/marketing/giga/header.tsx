'use client';

/**
 * SiteHeader, the dark, cinematic sticky header (reference-matched).
 *
 * Layout: FULL-BLEED. Brand + nav hug the left edge, actions hug the right edge.
 *
 * Background: fully TRANSPARENT at the top; on scroll each cluster animates in a
 * translucent near-black blurred background + hairline border + soft shadow.
 *
 * Nav: two dropdowns, Product (Chippi, Agents, Brokerages, Integrations) and
 * Company (Our story, Research, Careers), each opening a frosted blurred
 * mega-menu, plus a plain Pricing link. Right cluster: Sign in + white
 * "See a demo" pill. Mobile: a full-screen blurred takeover.
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
  Aperture,
  UserRound,
  Building2,
  Blocks,
  Compass,
  Microscope,
  Sprout,
  LifeBuoy,
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

type MenuKey = 'product' | 'company';

interface MenuConfig {
  label: string;
  featured: { eyebrow: string; title: string; body: string; cta: string; href: string };
  items: MegaItem[];
}

/** The two nav dropdowns, reference-styled frosted panels. */
const MENUS: Record<MenuKey, MenuConfig> = {
  product: {
    label: 'Product',
    featured: {
      eyebrow: 'MEET CHIPPI',
      title: 'One teammate for the whole deal.',
      body: 'It reads every lead, drafts in your voice, books the tour, and keeps the deal current.',
      cta: 'Meet Chippi',
      href: '/chippi',
    },
    items: [
      { icon: Aperture, label: 'Chippi', desc: 'The AI teammate that works your whole book', href: '/chippi' },
      { icon: UserRound, label: 'For agents', desc: 'Your inbox, pipeline, and tours, handled', href: '/agents' },
      { icon: Building2, label: 'For brokerages', desc: 'One agent behind every desk on the floor', href: '/brokerages' },
      { icon: Blocks, label: 'Integrations', desc: 'Connect the tools you already pay for', href: '/integrations' },
    ],
  },
  company: {
    label: 'Company',
    featured: {
      eyebrow: 'OUR STORY',
      title: 'Real estate, caught up to the world.',
      body: 'Why we are building the operating system the industry has been missing.',
      cta: 'Read our story',
      href: '/company',
    },
    items: [
      { icon: Compass, label: 'Our story', desc: 'The gap we set out to close, and the people closing it', href: '/company' },
      { icon: LifeBuoy, label: 'Help Center', desc: 'Guides for every part of the workspace', href: '/help' },
      { icon: Microscope, label: 'Research', desc: 'The work that shaped every feature', href: '/research' },
      { icon: Sprout, label: 'Careers', desc: 'Help build the future of real estate', href: '/careers' },
    ],
  },
};

const MENU_ORDER: MenuKey[] = ['product', 'company'];

export function SiteHeader() {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Scroll-driven blur: flip `scrolled` once the page leaves the very top.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 24);
  });

  // Close the open dropdown on outside-click + Escape.
  useEffect(() => {
    if (!openMenu) return;
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Lock body scroll while the mobile takeover is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const closeAll = useCallback(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, []);

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  };

  // Each nav cluster is TRANSPARENT at the top and gains a blurred translucent
  // background only once scrolled, animated, so it fades in/out.
  const clusterAnimate = {
    backgroundColor: scrolled ? 'rgba(12,12,12,0.72)' : 'rgba(12,12,12,0)',
    borderColor: scrolled ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0)',
    boxShadow: scrolled ? '0 10px 30px -12px rgba(0,0,0,0.55)' : '0 0px 0px 0px rgba(0,0,0,0)',
  };
  const clusterStyle = {
    backdropFilter: scrolled ? 'blur(16px)' : 'blur(0px)',
    WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'blur(0px)',
  } as React.CSSProperties;
  const clusterTransition = { duration: reduce ? 0 : 0.35, ease: EASE_OUT };

  const NavTrigger = ({ menu }: { menu: MenuKey }) => (
    <button
      type="button"
      aria-expanded={openMenu === menu}
      onClick={() => setOpenMenu((m) => (m === menu ? null : menu))}
      onMouseEnter={() => setOpenMenu(menu)}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-2 text-sm transition-colors',
        openMenu === menu ? 'text-white' : 'text-white/70 hover:text-white',
      )}
    >
      {MENUS[menu].label}
      <ChevronDown
        className={cn('h-3.5 w-3.5 transition-transform duration-200', openMenu === menu && 'rotate-180')}
      />
    </button>
  );

  const active = openMenu ? MENUS[openMenu] : null;

  return (
    <>
      <header ref={navRef} className="fixed inset-x-0 top-0 z-50">
        {/* Full-bleed: brand hugs the left, actions hug the right. */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4 lg:px-10">
          {/* LEFT cluster, relative anchor for the mega-menu */}
          <div className="relative">
            <motion.div
              initial={false}
              animate={clusterAnimate}
              transition={clusterTransition}
              style={clusterStyle}
              className="flex items-center gap-0.5 rounded-full border px-1.5"
            >
              <Link href="/" aria-label="Chippi home" className="flex items-center px-3 py-2.5" onClick={closeAll}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="h-5 w-auto" />
              </Link>
              <nav className="hidden items-center gap-0.5 lg:flex">
                <NavTrigger menu="product" />
                <NavTrigger menu="company" />
                <Link
                  href="/pricing"
                  onClick={closeAll}
                  className="rounded-full px-3.5 py-2 text-sm text-white/70 transition-colors hover:text-white"
                >
                  Pricing
                </Link>
              </nav>
            </motion.div>

            {/* Dropdown mega-menu (Product / Company), frosted blurred panel */}
            <AnimatePresence>
              {active && (
                <motion.div
                  key={openMenu}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                  className="absolute left-0 top-full hidden w-[720px] max-w-[calc(100vw-2.5rem)] pt-2.5 lg:block"
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]/65 shadow-2xl shadow-black/60 backdrop-blur-2xl">
                    <div className="grid grid-cols-[280px_1fr]">
                      {/* Featured story */}
                      <Link
                        href={active.featured.href}
                        onClick={closeAll}
                        className="group/feat relative flex flex-col justify-between overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#ff7a45]/12 via-[#0d0d0d]/40 to-[#0d0d0d]/40 p-6"
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
                            {active.featured.eyebrow}
                          </p>
                          <p
                            style={{ fontFamily: 'var(--font-serif-display)' }}
                            className="mt-3 text-[22px] leading-snug text-white"
                          >
                            {active.featured.title}
                          </p>
                          <p className="mt-2.5 text-xs leading-relaxed text-white/55">{active.featured.body}</p>
                        </div>
                        <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white">
                          {active.featured.cta}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/feat:translate-x-0.5" />
                        </span>
                      </Link>

                      {/* Link grid */}
                      <div className="grid grid-cols-2 gap-0.5 p-4">
                        {active.items.map((it) => {
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
          </div>

          {/* RIGHT cluster, actions */}
          <motion.div
            initial={false}
            animate={clusterAnimate}
            transition={clusterTransition}
            style={clusterStyle}
            className="flex items-center gap-1 rounded-full border p-1.5"
          >
            <Link
              href={SIGNIN}
              className="hidden rounded-full px-3.5 py-1.5 text-sm text-white/70 transition-colors hover:text-white lg:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href={DEMO}
              className="hidden h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98] lg:inline-flex"
            >
              See a demo
            </Link>
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08] lg:hidden"
            >
              <Menu size={20} />
            </button>
          </motion.div>
        </div>
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
              <div className="flex h-16 items-center justify-between px-5 pt-3">
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
                className="flex-1 space-y-7 overflow-y-auto px-5 py-8"
                variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } } }}
                initial="hidden"
                animate="show"
              >
                {MENU_ORDER.map((key) => (
                  <div key={key}>
                    <motion.p
                      variants={itemVariants}
                      style={{ fontFamily: 'var(--font-mono-display)' }}
                      className="px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/35"
                    >
                      {MENUS[key].label}
                    </motion.p>
                    <div className="mt-2 space-y-0.5">
                      {MENUS[key].items.map((it) => {
                        const Icon = it.icon;
                        return (
                          <motion.div key={it.label} variants={itemVariants}>
                            <Link
                              href={it.href}
                              onClick={closeAll}
                              className="flex items-center gap-3 rounded-2xl px-1 py-2.5 text-white"
                            >
                              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="text-[19px]">{it.label}</span>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <motion.div variants={itemVariants}>
                  <Link
                    href="/pricing"
                    onClick={closeAll}
                    style={{ fontFamily: 'var(--font-serif-display)' }}
                    className="block px-1 py-2 text-2xl text-white"
                  >
                    Pricing
                  </Link>
                </motion.div>
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
