'use client';

import { useEffect, useState } from 'react';
// Imported from 'framer-motion' (not 'motion/react') to share the same
// PresenceContext instance as the AnimatePresence that now wraps this panel in
// chippi-workspace — a cross-package context mismatch would silently drop the
// exit animation.
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';
import { RightPanelTabs, type RightPanelTab } from './right-panel-tabs';
import { BrowserView } from './browser-view';

interface RightPanelProps {
  slug: string;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  className?: string;
  /** True while the divider is being dragged — the iframes are made
   *  pointer-events:none so they stop swallowing the drag's mousemove events. */
  isResizing?: boolean;
}

// Every tab except 'browser' embeds an internal dashboard page.
type EmbedTab = Exclude<RightPanelTab, 'browser'>;

// `?embed=1` flips the dashboard layout into chrome-stripped mode so the
// iframe shows ONLY the page content (the People list, Deals kanban,
// Properties grid, Documents editor) — no nested sidebar, no nested header,
// no nested chat bar. The outer Chippi already owns all of those. See
// `EmbedDetector` in app/s/[slug]/layout.tsx and the
// `[data-chippi-embed='true']` rules in app/globals.css.
const TAB_PATHS: Record<EmbedTab, (slug: string) => string> = {
  // The default: Chippi's live work — the realtime activity feed of what it's
  // doing, drafting, and touching right now (not static CRM navigation).
  activity: (slug) => `/s/${slug}/chippi/activity?embed=1`,
  people: (slug) => `/s/${slug}/contacts?embed=1`,
  deals: (slug) => `/s/${slug}/deals?embed=1`,
  properties: (slug) => `/s/${slug}/properties?embed=1`,
  documents: (slug) => `/s/${slug}/documents?embed=1`,
};

const TAB_LABELS: Record<EmbedTab, string> = {
  activity: "Chippi's live activity panel",
  people: 'People dashboard panel',
  deals: 'Deals dashboard panel',
  properties: 'Properties dashboard panel',
  documents: 'Documents dashboard panel',
};

export function RightPanel({ slug, activeTab, onTabChange, className, isResizing }: RightPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  // The browser tab mounts lazily on first visit, then STAYS mounted (hidden
  // via CSS) so the visited page, its scroll position, and back/forward
  // history survive hopping between tabs. Embed tabs keep their original
  // remount-per-switch behavior.
  const [browserMounted, setBrowserMounted] = useState(false);
  const isBrowser = activeTab === 'browser';

  useEffect(() => {
    setIsLoading(true);
    if (activeTab === 'browser') setBrowserMounted(true);
  }, [activeTab]);

  return (
    <motion.div
      className={cn(
        'flex flex-col h-full border-l border-border/70 bg-background overflow-hidden',
        className,
      )}
      // A subtle offset + fade rather than a full-width `x: 100%` translate: the
      // panel shares a flex row whose widths change on open/close/drag, and a
      // full-width transform fought that layout and read as a glitch. A small
      // slide keeps the "comes in from the right" feel without the conflict.
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT }}
    >
      <RightPanelTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex-1 relative min-h-0">
        {!isBrowser && (
          <>
            {isLoading && (
              <div className="absolute inset-0 bg-background">
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-12 rounded-lg bg-foreground/[0.04] animate-pulse"
                      style={{ width: `${85 - i * 8}%` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <iframe
              key={activeTab}
              src={TAB_PATHS[activeTab as EmbedTab](slug)}
              className={cn('w-full h-full border-0', isResizing && 'pointer-events-none')}
              title={TAB_LABELS[activeTab as EmbedTab]}
              aria-label={TAB_LABELS[activeTab as EmbedTab]}
              onLoad={() => setIsLoading(false)}
            />
          </>
        )}
        {browserMounted && (
          <div className={cn('absolute inset-0', !isBrowser && 'hidden')}>
            <BrowserView slug={slug} isResizing={isResizing} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
