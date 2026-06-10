'use client';

/**
 * SiteNav — the logged-out pill nav.
 *
 * A floating, frosted pill centered at the top: brand left, mega-menu groups
 * center, theme + auth right. Desktop groups open rich mega panels (icon tile +
 * label + description) with a calm fade-rise. Mobile is a full-screen pullout
 * that takes over the page with a staggered reveal. Honest CTAs only — a
 * 7-day trial, never "free, no card".
 *
 * Built on framer-motion + the product's EASE_OUT so motion stays premium and
 * consistent, not decorative. Closes on outside-click, Escape, and route
 * intent (any link tap).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, ChevronDown, ArrowRight,
  PenLine, Target, CalendarCheck, KanbanSquare,
  GitBranch, BarChart3, MessagesSquare, Users,
  Plug, Building2, Activity, PlayCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { FortitudoThemeToggle } from '@/components/marketing/fortitudo/theme-toggle';
import { EASE_OUT } from '@/lib/motion';

interface MegaItem {
  icon: React.ElementType;
  label: string;
  desc: string;
  href: string;
}
interface NavGroup {
  label: string;
  href: string;
  items: MegaItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: 'For realtors',
    href: '/realtors',
    items: [
      { icon: PenLine, label: 'Drafts in your voice', desc: 'Replies written before you open the thread', href: '/realtors' },
      { icon: Target, label: 'Know who to call first', desc: 'Every lead scored against your live deals', href: '/realtors' },
      { icon: CalendarCheck, label: 'Book the tour', desc: 'Reply with a time — Chippi books and logs it', href: '/realtors' },
      { icon: KanbanSquare, label: 'An honest pipeline', desc: 'One workspace, not six open tabs', href: '/realtors' },
    ],
  },
  {
    label: 'For brokerages',
    href: '/brokerages',
    items: [
      { icon: GitBranch, label: 'Lead routing', desc: 'The right lead to the right agent, logged', href: '/brokerages' },
      { icon: BarChart3, label: 'See the whole floor', desc: 'Performance and bottlenecks at a glance', href: '/brokerages' },
      { icon: MessagesSquare, label: 'Team chat', desc: 'Per-deal channels with @chippi in line', href: '/brokerages' },
      { icon: Users, label: 'Members & roles', desc: 'Owner, admin, member — no permissions maze', href: '/brokerages' },
    ],
  },
  {
    label: 'Resources',
    href: '/company',
    items: [
      { icon: Plug, label: 'Integrations', desc: 'Connect the tools you already use', href: '/integrations' },
      { icon: Building2, label: 'Company', desc: 'Why we built Chippi', href: '/company' },
      { icon: PlayCircle, label: 'Book a demo', desc: 'See it run on your own floor', href: '/demo' },
      { icon: Activity, label: 'Status', desc: 'Live system status', href: '/status' },
    ],
  },
];

const SIGNUP = '/login/realtor?intent=signup';

export function SiteNav() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close the mega menu on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock body scroll while the mobile takeover is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const closeAll = useCallback(() => { setOpen(null); setMobileOpen(false); }, []);

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  };

  return (
    <>
      <header ref={navRef} className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-4">
        <div className="mx-auto max-w-5xl">
          <div className="relative rounded-full border border-border/60 bg-background/70 shadow-lg shadow-black/[0.04] ring-1 ring-inset ring-white/10 backdrop-blur-xl">
            <div className="flex h-14 items-center justify-between pl-5 pr-3">
              {/* Brand */}
              <Link href="/" aria-label="Chippi home" className="flex items-center gap-2" onClick={closeAll}>
                <BrandLogo className="h-5" alt="Chippi" />
              </Link>

              {/* Desktop groups */}
              <nav className="hidden items-center gap-0.5 lg:flex">
                {GROUPS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    aria-expanded={open === g.label}
                    onClick={() => setOpen((cur) => (cur === g.label ? null : g.label))}
                    onMouseEnter={() => setOpen(g.label)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-2 text-sm transition-colors',
                      open === g.label ? 'bg-foreground/[0.06] text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {g.label}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open === g.label && 'rotate-180')} />
                  </button>
                ))}
                <Link
                  href="/pricing"
                  className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={closeAll}
                >
                  Pricing
                </Link>
              </nav>

              {/* Right */}
              <div className="flex items-center gap-1.5">
                <div className="hidden items-center gap-1.5 lg:flex">
                  <FortitudoThemeToggle />
                  <Link href="/login/realtor" className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Log in
                  </Link>
                  <Link
                    href={SIGNUP}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
                  >
                    Start free trial
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <FortitudoThemeToggle className="lg:hidden" />
                <button
                  type="button"
                  aria-label="Open menu"
                  onClick={() => setMobileOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/[0.06] lg:hidden"
                >
                  <Menu size={20} />
                </button>
              </div>
            </div>

            {/* Desktop mega panel */}
            <AnimatePresence>
              {open && (
                <motion.div
                  key={open}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="absolute left-1/2 top-[calc(100%+10px)] hidden w-[560px] -translate-x-1/2 lg:block"
                  onMouseLeave={() => setOpen(null)}
                >
                  <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/95 p-3 shadow-2xl shadow-black/10 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
                    <div className="grid grid-cols-2 gap-1">
                      {GROUPS.find((g) => g.label === open)?.items.map((it) => {
                        const Icon = it.icon;
                        return (
                          <Link
                            key={it.label}
                            href={it.href}
                            onClick={closeAll}
                            className="group flex items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-foreground/[0.05]"
                          >
                            <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border/60 bg-brand-subtle text-brand transition-transform duration-150 group-hover:scale-105">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">{it.label}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{it.desc}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Mobile full-page takeover */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[100] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <div className="absolute inset-0 bg-background" />
            <motion.div
              className="relative flex h-full flex-col"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <div className="flex h-16 items-center justify-between px-5">
                <Link href="/" className="flex items-center gap-2" onClick={closeAll}>
                  <BrandLogo className="h-5" alt="Chippi" />
                </Link>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-foreground/[0.06]"
                >
                  <X size={20} />
                </button>
              </div>

              <motion.nav
                className="flex-1 space-y-8 overflow-y-auto px-5 py-6"
                variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}
                initial="hidden"
                animate="show"
              >
                {GROUPS.map((g) => (
                  <div key={g.label}>
                    <motion.p variants={itemVariants} className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      {g.label}
                    </motion.p>
                    <div className="mt-3 space-y-1">
                      {g.items.map((it) => {
                        const Icon = it.icon;
                        return (
                          <motion.div key={it.label} variants={itemVariants}>
                            <Link
                              href={it.href}
                              onClick={closeAll}
                              className="flex items-center gap-3 rounded-2xl py-2.5 text-foreground transition-colors hover:bg-foreground/[0.04]"
                            >
                              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border/60 bg-brand-subtle text-brand">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="text-[15px]">{it.label}</span>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <motion.div variants={itemVariants}>
                  <Link href="/pricing" onClick={closeAll} className="block text-2xl tracking-tight text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
                    Pricing
                  </Link>
                </motion.div>
              </motion.nav>

              <div className="space-y-3 border-t border-border/60 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
                <Link href={SIGNUP} onClick={closeAll} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-medium text-background">
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login/realtor" onClick={closeAll} className="flex h-12 w-full items-center justify-center rounded-full border border-border/60 text-sm font-medium text-foreground">
                  Log in
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
