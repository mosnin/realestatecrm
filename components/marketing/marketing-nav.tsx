'use client';

/**
 * Marketing nav — the sticky top bar + mega menu orchestrator.
 *
 * Apple-flat by design: hairline bottom border, backdrop-blurred background,
 * a row of plain-text nav items, primary + ghost pills on the right. On
 * hover of "Features" or "Teams" a full-width panel slides down with the
 * `EASE_APPLE` curve.
 *
 * The hover state machine:
 *   - Hovering a panel-bearing top-level item OPENS its panel.
 *   - Hovering a DIFFERENT panel-bearing item swaps the panel content
 *     without a close/open flicker (animate by key swap).
 *   - Hovering a plain link CLOSES any open panel.
 *   - Mouse-leave on EITHER the nav row or the panel queues a 150ms close —
 *     re-entering either area cancels the timer.
 *   - Clicking a panel link closes the panel immediately.
 *   - `Esc` closes the panel.
 *
 * The 150ms grace timer is what lets the mouse cross the empty space
 * between the nav row and the panel without the panel snapping shut
 * underneath them — the single most common "vibe-coded" tell on hover
 * megamenus. We do not ship that.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';
import { PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';
import { MarketingNavPanel } from './marketing-nav-panel';
import { MarketingNavMobile } from './marketing-nav-mobile';
import { TOP_LEVEL_NAV } from './marketing-nav-links';

type PanelKey = 'features' | 'teams';

/** Grace period (ms) between mouse-leave and panel close. Tuned so the
 *  mouse can comfortably traverse the empty space below the nav row
 *  without the panel collapsing on traversal. 150ms is the band where
 *  the panel still feels responsive (sub-perceptible) but forgiving. */
const CLOSE_GRACE_MS = 150;

export function MarketingNav() {
  const [active, setActive] = useState<PanelKey | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setActive(null);
      closeTimerRef.current = null;
    }, CLOSE_GRACE_MS);
  }, [cancelClose]);

  const openPanel = useCallback(
    (key: PanelKey) => {
      cancelClose();
      setActive(key);
    },
    [cancelClose],
  );

  const closeNow = useCallback(() => {
    cancelClose();
    setActive(null);
  }, [cancelClose]);

  // Clear the pending close on unmount so we don't fire setState after
  // the component is gone.
  useEffect(() => () => cancelClose(), [cancelClose]);

  // Esc closes the panel. Only bind when a panel is open so we don't
  // attach a global key handler that does nothing 99% of the time.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, closeNow]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        'bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        'border-b border-border/60',
      )}
    >
      {/* Outer relative wrapper so the absolute-positioned panel anchors
          to the full-width header (not the inner max-w container) and
          spans the viewport edge-to-edge. */}
      <div className="relative">
        <nav
          className="mx-auto max-w-7xl px-6 md:px-8 h-16 flex items-center justify-between"
          onMouseLeave={scheduleClose}
        >
          {/* Brand mark — clears any open panel on hover so the eye can
              settle on the logo without the panel hanging open behind it. */}
          <Link
            href="/"
            aria-label="Chippi home"
            className="flex items-center"
            onMouseEnter={scheduleClose}
          >
            <BrandLogo className="h-5" alt="Chippi" />
          </Link>

          {/* Desktop nav row */}
          <ul className="hidden md:flex items-center gap-1">
            {TOP_LEVEL_NAV.map((item) => {
              if (item.kind === 'link') {
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onMouseEnter={scheduleClose}
                      className={cn(
                        'inline-flex items-center h-9 px-3 rounded-md text-sm font-medium',
                        'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-150',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              }
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-expanded={isActive}
                    aria-haspopup="menu"
                    onMouseEnter={() => openPanel(item.key)}
                    onFocus={() => openPanel(item.key)}
                    onClick={() =>
                      setActive((prev) => (prev === item.key ? null : item.key))
                    }
                    className={cn(
                      'inline-flex items-center gap-1 h-9 px-3 rounded-md text-sm font-medium',
                      'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]',
                      'transition-colors duration-150',
                      isActive && 'text-foreground bg-foreground/[0.04]',
                    )}
                  >
                    {item.label}
                    <ChevronDown
                      size={13}
                      strokeWidth={1.75}
                      className={cn(
                        'text-foreground/55 transition-colors duration-150',
                        isActive && 'text-foreground/80',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right cluster — desktop pills + mobile menu trigger */}
          <div className="flex items-center gap-2">
            <Link
              href="/login/realtor"
              onMouseEnter={scheduleClose}
              className={cn(GHOST_PILL, 'hidden sm:inline-flex')}
            >
              Log in
            </Link>
            <Link
              href="/login/realtor?intent=signup"
              onMouseEnter={scheduleClose}
              className={cn(PRIMARY_PILL, 'hidden md:inline-flex')}
            >
              Start free trial
            </Link>
            {/* Mobile menu trigger drives its own Sheet */}
            <MarketingNavMobile />
          </div>
        </nav>

        {/* The panel. AnimatePresence handles enter/exit; the inner panel
            owns the variant + key so a swap from features→teams animates
            as a content change, not a close + reopen.

            Hover handlers on the motion node itself (not a wrapper div)
            so AnimatePresence sees its motion child directly and can
            run the exit variant cleanly. The mouse-enter cancels the
            close timer; mouse-leave re-arms it — the grace bridge
            between nav row and panel. */}
        <AnimatePresence>
          {active && (
            <MarketingNavPanel
              key={active}
              variant={active}
              onNavigate={closeNow}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            />
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
