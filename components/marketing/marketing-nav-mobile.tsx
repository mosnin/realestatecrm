'use client';

/**
 * Marketing nav — mobile full-screen drawer.
 *
 * Opens as a left-side Sheet that covers the full viewport. Inside, the
 * primary nav rows stack vertically; "Features" and "Teams" expand
 * inline to reveal the SAME leaf links as the desktop panel (single
 * source of truth from `marketing-nav-links.ts`).
 *
 * The drawer's top edge carries the same warm wash gradient as the
 * dashboard mobile drawer (`components/dashboard/header.tsx`). It's the
 * one sanctioned brand-orange surface on marketing — the realtor opening
 * the nav from a phone touches the same vocabulary they'd touch inside
 * the product. Sanctioned in STYLESHEET.md §Color §The brand orange rule
 * via the LOGO context (onboarding/brand-wash surface family).
 *
 * Only one expandable row may be open at a time — opening one closes the
 * other. That keeps the surface from competing with itself for the eye.
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { BrandLogo } from '@/components/brand-logo';
import { EASE_APPLE } from '@/lib/motion';
import { PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';
import { cn } from '@/lib/utils';
import {
  SURFACE_LINKS,
  TEAM_LINKS,
  type MarketingLeafLink,
} from './marketing-nav-links';

type ExpandedKey = 'features' | 'teams' | null;

/** Plain top-level row — a straight link, no expansion. The h-14 height
 *  matches the brief's tall-row mobile spec and gives a generous tap
 *  target without needing aria padding tricks. */
function MobileTopRow({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center h-14 px-5 text-base font-medium text-foreground',
        'hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
        'transition-colors duration-150',
      )}
    >
      {label}
    </Link>
  );
}

/** Expandable top-level row — chevron rotates 180°, leaf list slides in
 *  beneath. Only one of these is open at a time across the drawer. */
function MobileExpandableRow({
  label,
  isExpanded,
  onToggle,
  leafLinks,
  onNavigate,
}: {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  leafLinks: MarketingLeafLink[];
  onNavigate: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          'flex items-center justify-between w-full h-14 px-5',
          'text-base font-medium text-foreground',
          'hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
          'transition-colors duration-150',
        )}
      >
        <span>{label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn(
            'text-muted-foreground transition-transform duration-200 ease-out',
            isExpanded && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: EASE_APPLE }}
            className="overflow-hidden"
          >
            <div className="py-1 pl-5 pr-3 space-y-0">
              {leafLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-start gap-3 rounded-md px-3 py-2.5',
                      'hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
                      'transition-colors duration-150',
                    )}
                  >
                    <Icon
                      size={14}
                      strokeWidth={1.75}
                      className="text-foreground/70 flex-shrink-0 mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {link.label}
                      </span>
                      <span className="text-xs text-muted-foreground leading-snug">
                        {link.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MarketingNavMobile() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedKey>(null);

  const toggle = (key: 'features' | 'teams') =>
    setExpanded((prev) => (prev === key ? null : key));

  const close = () => {
    setOpen(false);
    // Reset expansion state on close so the next open starts collapsed —
    // matches the Apple-mobile pattern of a clean drawer per session.
    setExpanded(null);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className={cn(
            'md:hidden inline-flex items-center justify-center w-11 h-11 -mr-2',
            'rounded-md text-foreground/70 hover:text-foreground',
            'hover:bg-foreground/[0.04] transition-colors duration-150',
            'active:scale-[0.98]',
          )}
        >
          <MenuToggleIcon open={open} className="size-5" duration={400} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className={cn(
          'w-screen max-w-none sm:max-w-none',
          'p-0 border-0 bg-background flex flex-col overflow-hidden',
        )}
      >
        {/* Brand wash — same recipe as the dashboard mobile drawer. The
            one sanctioned warm tint on marketing because this surface
            shares vocabulary with the app sidebar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 z-0 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent"
        />
        <div className="relative z-10 flex flex-col h-full">
          {/* Header row: brand mark left, close right */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-border/60">
            <SheetTitle asChild>
              <Link
                href="/"
                onClick={close}
                aria-label="Chippi home"
                className="flex items-center"
              >
                <BrandLogo className="h-5" alt="Chippi" />
              </Link>
            </SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close menu"
                className={cn(
                  'inline-flex items-center justify-center w-11 h-11 -mr-2',
                  'rounded-md text-foreground/70 hover:text-foreground',
                  'hover:bg-foreground/[0.04] transition-colors duration-150',
                  'active:scale-[0.98]',
                )}
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </SheetClose>
          </div>

          {/* Primary nav — vertical stack of tall rows */}
          <nav className="flex-1 overflow-y-auto py-2">
            <MobileTopRow href="/realtors" label="Realtors" onNavigate={close} />
            <MobileExpandableRow
              label="Teams"
              isExpanded={expanded === 'teams'}
              onToggle={() => toggle('teams')}
              leafLinks={TEAM_LINKS}
              onNavigate={close}
            />
            <MobileExpandableRow
              label="Features"
              isExpanded={expanded === 'features'}
              onToggle={() => toggle('features')}
              leafLinks={SURFACE_LINKS}
              onNavigate={close}
            />
            <MobileTopRow href="/pricing" label="Pricing" onNavigate={close} />
            <MobileTopRow href="/about" label="About" onNavigate={close} />
          </nav>

          {/* Bottom CTAs — full-width pair separated by a hairline */}
          <div className="border-t border-border/60 px-5 py-4 space-y-2.5">
            <Link
              href="/login/realtor"
              onClick={close}
              className={cn(
                GHOST_PILL,
                'w-full justify-center h-11',
                // Override the GHOST_PILL muted foreground at this size —
                // a bottom-pinned CTA pair reads cleanest when both pills
                // are full-width and the labels feel equal-weight even
                // though the primary is the loud note.
                'text-foreground border border-border/70',
              )}
            >
              Log in
            </Link>
            <Link
              href="/login/realtor?intent=signup"
              onClick={close}
              className={cn(PRIMARY_PILL, 'w-full justify-center h-11')}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
