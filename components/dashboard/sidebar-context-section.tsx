'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PAGE_VARIANTS } from '@/lib/motion';
import { SidebarConversations } from './sidebar-conversations';

// ─────────────────────────────────────────────────────────────────────────────
// SidebarContextSection — context-aware swap between conversation list (Chats)
// and the static "More" nav (Pages). Lives where the More section used to in
// the realtor sidebar's expanded layout. The two-tab pill at the top lets the
// user override the default that the route would otherwise pick.
//
// Default mode is route-driven: on `/chippi/*` we open in Chats; everywhere
// else we open in Pages. The user-driven override resets when the route
// changes so navigating elsewhere restores the right default.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'chats' | 'pages';

interface SidebarContextSectionProps {
  slug: string;
  pathname: string;
  /** Render the Pages mode contents (typically the existing realtorMoreNavItems). */
  renderPages: () => React.ReactNode;
}

function defaultModeFor(pathname: string, slug: string): Mode {
  return pathname.startsWith(`/s/${slug}/chippi`) ? 'chats' : 'pages';
}

export function SidebarContextSection({
  slug,
  pathname,
  renderPages,
}: SidebarContextSectionProps) {
  const routeDefault = defaultModeFor(pathname, slug);
  const [mode, setMode] = useState<Mode>(routeDefault);

  // Reset the user override when the route changes — a fresh route means the
  // user's previous mode choice doesn't apply anymore.
  useEffect(() => {
    setMode(defaultModeFor(pathname, slug));
  }, [pathname, slug]);

  return (
    <div className="space-y-2">
      <div className="px-3">
        <div
          role="tablist"
          aria-label="Sidebar context"
          className="inline-flex items-center gap-1 bg-foreground/[0.025] rounded-full p-0.5"
        >
          <TabButton active={mode === 'chats'} onClick={() => setMode('chats')}>
            Chats
          </TabButton>
          <TabButton active={mode === 'pages'} onClick={() => setMode('pages')}>
            Pages
          </TabButton>
        </div>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {mode === 'chats' ? (
              <SidebarConversations slug={slug} />
            ) : (
              <div className="space-y-0.5">{renderPages()}</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors duration-150',
        active
          ? 'bg-foreground/[0.06] text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
      )}
    >
      {children}
    </button>
  );
}
