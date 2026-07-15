'use client';

import { Sparkles, Users, Briefcase, Building2, FileText, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

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
  | 'browser';

interface RightPanelTabsProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  className?: string;
}

const TABS: ReadonlyArray<{ id: RightPanelTab; label: string; icon: typeof Users }> = [
  { id: 'activity', label: 'Activity', icon: Sparkles },
  { id: 'people', label: 'People', icon: Users },
  { id: 'deals', label: 'Deals', icon: Briefcase },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'browser', label: 'Browser', icon: Globe },
];

export function RightPanelTabs({ activeTab, onTabChange, className }: RightPanelTabsProps) {
  return (
    <div
      className={cn(
        // Five tabs can outgrow a narrow split panel — allow a quiet horizontal
        // scroll rather than wrapping or clipping the underline.
        'flex items-center gap-0.5 px-3 py-2 border-b border-border/60 overflow-x-auto',
        className,
      )}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
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
  );
}
