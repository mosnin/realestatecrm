'use client';

import { useEffect, useState } from 'react';
// Imported from 'framer-motion' (not 'motion/react') to share the same
// PresenceContext instance as the AnimatePresence that now wraps this panel in
// chippi-workspace — a cross-package context mismatch would silently drop the
// exit animation.
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';
import { RightPanelTabs } from './right-panel-tabs';

interface RightPanelProps {
  slug: string;
  activeTab: 'people' | 'deals' | 'properties';
  onTabChange: (tab: 'people' | 'deals' | 'properties') => void;
  className?: string;
  /** True while the divider is being dragged — the iframe is made
   *  pointer-events:none so it stops swallowing the drag's mousemove events. */
  isResizing?: boolean;
}

// `?embed=1` flips the dashboard layout into chrome-stripped mode so the
// iframe shows ONLY the page content (the People list, Deals kanban,
// Properties grid) — no nested sidebar, no nested header, no nested chat
// bar. The outer Chippi already owns all of those. See `EmbedDetector`
// in app/s/[slug]/layout.tsx and the `[data-chippi-embed='true']` rules
// in app/globals.css.
const TAB_PATHS: Record<RightPanelProps['activeTab'], (slug: string) => string> = {
  people: (slug) => `/s/${slug}/contacts?embed=1`,
  deals: (slug) => `/s/${slug}/deals?embed=1`,
  properties: (slug) => `/s/${slug}/properties?embed=1`,
};

const TAB_LABELS: Record<RightPanelProps['activeTab'], string> = {
  people: 'People dashboard panel',
  deals: 'Deals dashboard panel',
  properties: 'Properties dashboard panel',
};

export function RightPanel({ slug, activeTab, onTabChange, className, isResizing }: RightPanelProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
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

      <div className="flex-1 relative">
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
          src={TAB_PATHS[activeTab](slug)}
          className={cn('w-full h-full border-0', isResizing && 'pointer-events-none')}
          title={TAB_LABELS[activeTab]}
          aria-label={TAB_LABELS[activeTab]}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </motion.div>
  );
}
