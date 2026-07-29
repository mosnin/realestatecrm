'use client';

import { useEffect, useState } from 'react';
// Imported from 'framer-motion' (not 'motion/react') to share the same
// PresenceContext instance as the AnimatePresence that now wraps this panel in
// chippi-workspace — a cross-package context mismatch would silently drop the
// exit animation.
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';
import { RightPanelTabs, type RightPanelTab } from './right-panel-tabs';
import { BrowserView } from './browser-view';
import { embedSrcFor, type EmbedTab, type RightPanelVariant } from './right-panel-embeds';
import { LiveWorkbench } from './live-workbench';
import { BrowserControlPanel, type BrowserActionLogEntry } from './browser-control-panel';
import { WorkspaceRunPanel } from './workspace-run-panel';
import type { ResearchSourceLink } from '@/lib/chippi/research-workspace';

interface RightPanelProps {
  slug: string;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  className?: string;
  /** True while the divider is being dragged — the iframes are made
   *  pointer-events:none so they stop swallowing the drag's mousemove events. */
  isResizing?: boolean;
  /**
   * Which Chippi surface owns this panel. `realtor` (default) embeds the
   * space-scoped `/s/<slug>/…` dashboard routes; `broker` embeds the
   * brokerage-scoped `/broker/…` routes instead. The `activity` (live work)
   * and `browser` tabs are universal. Broker has no Documents surface, so that
   * tab is omitted for the broker variant (see RightPanelTabs).
   */
  variant?: RightPanelVariant;
  /**
   * When provided, renders an X button pinned to the top-right corner of the
   * tab strip that calls this on click. Used by the mobile full-screen panel
   * overlay (chippi-workspace) to dismiss back to chat — the desktop split
   * has its own dismissal (SplitPanelToggle) and passes nothing here.
   */
  onClose?: () => void;
  workbenchArtifactId?: string | null;
  workbenchRefreshVersion?: number | null;
  /** Bounded in-conversation activity, supplemented by the server history. */
  researchActions?: BrowserActionLogEntry[];
  researchSources?: ResearchSourceLink[];
  /** Server-computed per-space entitlement; never inferred client-side. */
  researchEnabled?: boolean;
  workspaceRunsEnabled?: boolean;
  workspaceRunId?: string | null;
  onContinueWorkspace?: () => void;
}

const TAB_LABELS: Record<EmbedTab, string> = {
  activity: "Chippi's live activity panel",
  people: 'People dashboard panel',
  deals: 'Deals dashboard panel',
  properties: 'Properties dashboard panel',
  documents: 'Documents dashboard panel',
};

export function RightPanel({
  slug,
  activeTab,
  onTabChange,
  className,
  isResizing,
  variant = 'realtor',
  onClose,
  workbenchArtifactId,
  workbenchRefreshVersion,
  researchActions,
  researchSources,
  researchEnabled = false,
  workspaceRunsEnabled = false,
  workspaceRunId = null,
  onContinueWorkspace,
}: RightPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  // The browser tab mounts lazily on first visit, then STAYS mounted (hidden
  // via CSS) so the visited page, its scroll position, and back/forward
  // history survive hopping between tabs. Embed tabs keep their original
  // remount-per-switch behavior.
  const [browserMounted, setBrowserMounted] = useState(false);
  const [researchMounted, setResearchMounted] = useState(false);
  const isBrowser = activeTab === 'browser';
  // Slice A is off unless a deployment explicitly provides this public flag.
  // The panel is therefore safe to merge without exposing a partial local-only
  // artifact workflow to paying customers.
  const workbenchEnabled = process.env.NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED === 'true';
  const isWorkbench = activeTab === 'workbench' && workbenchEnabled;
  // Research is an oversight workspace for the existing browser-control
  // runtime. It is independently gated so it never advertises a partial
  // surface in a deployment that has not opted in.
  const isResearch = activeTab === 'research' && researchEnabled;
  const isWorkspace = activeTab === 'workspace' && workspaceRunsEnabled;
  const isUnavailableSpecialTab =
    (activeTab === 'workbench' && !workbenchEnabled) ||
    (activeTab === 'research' && !researchEnabled) ||
    (activeTab === 'workspace' && !workspaceRunsEnabled);
  const isEmbedded = !isBrowser && !isWorkbench && !isResearch && !isWorkspace && !isUnavailableSpecialTab;
  // Broker has no surface for some realtor tabs (Documents). If a stale
  // persisted tab (the split-panel state is shared across variants) lands on
  // one, self-correct to the always-present live-work activity feed rather
  // than render a broken iframe.
  const embedTab: EmbedTab = isEmbedded ? (activeTab as EmbedTab) : 'activity';
  const embedSrc = isEmbedded ? embedSrcFor(variant, embedTab, slug) : null;

  useEffect(() => {
    setIsLoading(true);
    if (activeTab === 'browser') setBrowserMounted(true);
    if (activeTab === 'research') setResearchMounted(true);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'workbench' && !workbenchEnabled) {
      onTabChange('activity');
    } else if (activeTab === 'research' && !researchEnabled) {
      onTabChange('activity');
    } else if (activeTab === 'workspace' && !workspaceRunsEnabled) {
      onTabChange('activity');
    } else if (variant === 'broker' && isEmbedded && embedSrc === null) {
      onTabChange('activity');
    }
  }, [activeTab, embedSrc, isEmbedded, onTabChange, researchEnabled, variant, workbenchEnabled, workspaceRunsEnabled]);

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
      <div className="relative">
        <RightPanelTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          variant={variant}
          workbenchEnabled={workbenchEnabled}
          researchEnabled={researchEnabled}
          workspaceRunsEnabled={workspaceRunsEnabled}
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="absolute right-1.5 top-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-background text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors ring-1 ring-border/40"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex-1 relative min-h-0">
        {isEmbedded && (
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
              // Re-key on the resolved src so a variant fallback (broker +
              // documents → activity) actually remounts the frame.
              key={embedSrc ?? embedTab}
              src={embedSrc ?? embedSrcFor(variant, 'activity', slug) ?? ''}
              className={cn('w-full h-full border-0', isResizing && 'pointer-events-none')}
              title={TAB_LABELS[embedTab]}
              aria-label={TAB_LABELS[embedTab]}
              onLoad={() => setIsLoading(false)}
            />
          </>
        )}
        {browserMounted && (
          <div className={cn('absolute inset-0', !isBrowser && 'hidden')}>
            <BrowserView slug={slug} isResizing={isResizing} />
          </div>
        )}
        {isWorkbench && <LiveWorkbench artifactId={workbenchArtifactId} refreshVersionNumber={workbenchRefreshVersion} />}
        {researchMounted && (
          <div className={cn('absolute inset-0 overflow-y-auto p-3', !isResearch && 'hidden')}>
            <BrowserControlPanel actions={researchActions} sources={researchSources} />
          </div>
        )}
        {isWorkspace && <WorkspaceRunPanel runId={workspaceRunId} slug={slug} onContinue={onContinueWorkspace} />}
      </div>
    </motion.div>
  );
}
