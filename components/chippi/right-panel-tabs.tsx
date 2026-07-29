'use client';

import { useEffect, useRef } from 'react';
import { Sparkles, Users, Briefcase, Building2, FileText, Globe, Table2, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { isTabAvailable, type RightPanelVariant } from './right-panel-embeds';

/**
 * Canonical union of RightPanel tabs. hooks/use-split-panel.ts re-exports this
 * so the persisted split-panel state and the workspace stay in sync with the
 * tab bar — add tabs here (and in TABS below) and everything widens together.
 *
 * 'activity' is the DEFAULT: the panel opens to Chippi's live work (what it's
 * doing right now — the pages, documents and tools it's touching), not a
 * static CRM navigation view. People/Deals/Properties are still available as
 * tabs but no longer the landing surface.
 */
export type RightPanelTab =
  | 'activity'
  | 'people'
  | 'deals'
  | 'properties'
  | 'documents'
  | 'browser'
  | 'workbench'
  | 'research';

interface RightPanelTabsProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  className?: string;
  /** `broker` omits the Documents tab — there is no brokerage-scoped
   *  Documents surface to embed. Defaults to the realtor tab set. */
  variant?: RightPanelVariant;
  /** The Workbench is intentionally dark until the feature flag is enabled.
   *  Keeping the gate at the tab source prevents a stale local preference
   *  from advertising an unfinished surface. */
  workbenchEnabled?: boolean;
  /** The Research Workspace stays unavailable until a deployment opts in. */
  researchEnabled?: boolean;
}

const TABS: ReadonlyArray<{ id: RightPanelTab; label: string; icon: typeof Users }> = [
  { id: 'activity', label: 'Activity', icon: Sparkles },
  { id: 'people', label: 'People', icon: Users },
  { id: 'deals', label: 'Deals', icon: Briefcase },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'workbench', label: 'Workbench', icon: Table2 },
  { id: 'research', label: 'Research', icon: Search },
];

/** Pure visibility policy, exported so the feature-off contract stays tested. */
export function visibleRightPanelTabs(
  variant: RightPanelVariant,
  workbenchEnabled: boolean,
  researchEnabled = false,
): ReadonlyArray<{ id: RightPanelTab; label: string; icon: typeof Users }> {
  return TABS.filter(
    (tab) =>
      isTabAvailable(variant, tab.id) &&
      (tab.id !== 'workbench' || workbenchEnabled) &&
      (tab.id !== 'research' || researchEnabled),
  );
}

export function RightPanelTabs({
  activeTab,
  onTabChange,
  className,
  variant = 'realtor',
  workbenchEnabled = false,
  researchEnabled = false,
}: RightPanelTabsProps) {
  // Broker has no Documents surface — drop tabs the variant omits so they
  // can't be selected (single source of truth in right-panel-embeds).
  const tabs = visibleRightPanelTabs(variant, workbenchEnabled, researchEnabled);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  // Keep the active tab in view whenever it changes — e.g. a parent-driven
  // tab switch (stale persisted tab falling back to 'activity', a mention
  // deep-link) shouldn't leave the newly-active tab scrolled off clipped by
  // the fade mask below.
  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTab]);

  return (
    // Outer wrapper is NOT the scroll container — it hosts the right-edge
    // fade mask (below) so the mask can sit fixed to the panel's edge while
    // the tab row scrolls independently underneath it.
    <div className={cn('relative border-b border-border/60', className)}>
      <div
        className={cn(
          // Five tabs can outgrow a narrow split panel — allow a quiet
          // horizontal scroll rather than wrapping or clipping the underline.
          // pr-8 leaves room for the fade mask (and, on the mobile overlay,
          // RightPanel's close button) to sit over the strip without a tab's
          // hit target ending up underneath it. The old pr-14 was sized for
          // the floating control cluster that used to float over this panel —
          // that cluster now lives inside the chat pane and can't overlap
          // here by construction, so the padding only needs to clear the
          // fade/close-button now.
          'flex items-center gap-0.5 pl-3 pr-8 py-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              ref={isActive ? activeBtnRef : undefined}
              type="button"
              onClick={() => onTabChange(id)}
              aria-label={`Switch to ${label} tab`}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025]',
              )}
            >
              <Icon size={12} />
              {label}
              {isActive && (
                <motion.span
                  layoutId="right-panel-tab-underline"
                  className="absolute bottom-[-9px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                  transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                />
              )}
            </button>
          );
        })}
      </div>
      {/* Right-edge fade — reads tabs clipped by the scroll container as
          "there's more, scroll for it" instead of an abrupt hard clip.
          Decorative only: pointer-events disabled so it never steals a tap
          from the tab (or close button) underneath/above it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
      />
    </div>
  );
}
