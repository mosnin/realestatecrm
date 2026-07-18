'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RightPanelTab } from '@/components/chippi/right-panel-tabs';

// Canonical tab union lives next to the tab bar (right-panel-tabs.tsx);
// re-exported here so existing importers keep working.
export type { RightPanelTab };

interface SplitPanelState {
  isSplit: boolean;
  rightTab: RightPanelTab;
  leftWidthPercent: number; // 0-100, default 58
}

// v2: the default tab changed from the 'people' CRM iframe to 'activity'
// (Chippi's live work). Bumping the key drops stale persisted state so
// existing users land on the new default once instead of keeping 'people'.
const STORAGE_KEY = 'chippi-split-panel-v2';
const DEFAULTS: SplitPanelState = {
  isSplit: false,
  rightTab: 'activity',
  leftWidthPercent: 58,
};

const MIN_WIDTH = 30;
const MAX_WIDTH = 75;

// Tailwind's `md` breakpoint — the same width the two-pane desktop split
// requires to have room for both panes, and the width below which the
// mobile full-screen overlay takes over instead.
const MOBILE_BREAKPOINT = 768;

function clampWidth(pct: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, pct));
}

function loadFromStorage(): SplitPanelState {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function persistState(next: SplitPanelState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private browsing quota, etc.) — fail silently
  }
}

// ── Pure state-transition logic ─────────────────────────────────────────
//
// Exported (and unit-tested) independently of the hook below so the
// mobile/desktop decision — the part a previous fix got wrong — can be
// verified without a DOM/React harness. Neither function reads `window` or
// localStorage; both take the viewport width and current state as plain
// arguments and return plain data.

/** True when the viewport is too narrow for the two-pane desktop split, and
 *  the mobile full-screen overlay should be used for the panel instead. */
export function shouldUseMobileOverlay(viewportWidth: number): boolean {
  return viewportWidth < MOBILE_BREAKPOINT;
}

export interface PanelPresentationState {
  /** Persisted desktop split-view flag (localStorage). */
  isSplit: boolean;
  /** Transient, never-persisted full-screen panel overlay for narrow
   *  screens. */
  isMobileOverlay: boolean;
}

/**
 * Resolves the presentation state after the viewport crosses the mobile
 * breakpoint (driven by a `resize` listener).
 *
 * - Below the breakpoint: the desktop split can't fit two panes, so it force-
 *   closes (pre-existing behavior) — the mobile overlay, if already open, is
 *   left alone; it's what narrow screens use instead of the split.
 * - At/above the breakpoint: the mobile overlay is a transient presentation
 *   of the panel, not a real preference, so it always closes once the
 *   desktop split becomes available again. `isSplit` (the realtor's actual
 *   persisted preference) is left untouched.
 *
 * Returns the SAME object (by reference) when nothing needs to change, so
 * callers can skip a state write/render with a simple `!==` check.
 */
export function nextResizeState(
  viewportWidth: number,
  current: PanelPresentationState,
): PanelPresentationState {
  if (shouldUseMobileOverlay(viewportWidth)) {
    if (!current.isSplit) return current;
    return { isSplit: false, isMobileOverlay: current.isMobileOverlay };
  }
  if (!current.isMobileOverlay) return current;
  return { isSplit: current.isSplit, isMobileOverlay: false };
}

/**
 * Manages Chippi split-panel layout state, persisted in localStorage.
 *
 * - `isSplit` — whether the desktop two-pane split view is open
 * - `toggle` — opens/closes the panel: on desktop (>= 768px) this flips the
 *   persisted `isSplit` split view; on narrow screens it flips the transient
 *   `isMobileOverlay` full-screen overlay instead. Callers don't need to
 *   branch on viewport width themselves.
 * - `rightTab` — active tab in the right panel (see `RightPanelTab`)
 * - `setRightTab` — sets the active right tab
 * - `leftWidthPercent` — left panel width as a percentage (clamped 30–75, default 58)
 * - `setLeftWidthPercent` — sets the left panel width (auto-clamped)
 * - `isMobileOverlay` — whether the mobile full-screen panel overlay is open.
 *   Never persisted — always starts closed on mount/remount.
 * - `closeMobileOverlay` — explicitly closes the mobile overlay (the
 *   in-overlay X button).
 *
 * @example
 * const { isSplit, toggle, rightTab, setRightTab, leftWidthPercent, setLeftWidthPercent, isMobileOverlay, closeMobileOverlay } = useSplitPanel();
 */
export function useSplitPanel() {
  const [state, setState] = useState<SplitPanelState>(DEFAULTS);
  // Transient mobile-only presentation — deliberately NOT part of
  // `SplitPanelState` / localStorage. It always starts closed; the realtor's
  // real preference is `isSplit` above.
  const [isMobileOverlay, setIsMobileOverlay] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  const updateState = useCallback((updates: Partial<SplitPanelState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      persistState(next);
      return next;
    });
  }, []);

  // Keep the presentation state correct as the viewport crosses the mobile
  // breakpoint — see nextResizeState for the decision logic.
  useEffect(() => {
    const check = () => {
      const current: PanelPresentationState = { isSplit: state.isSplit, isMobileOverlay };
      const next = nextResizeState(window.innerWidth, current);
      if (next === current) return;
      if (next.isSplit !== current.isSplit) updateState({ isSplit: next.isSplit });
      if (next.isMobileOverlay !== current.isMobileOverlay) setIsMobileOverlay(next.isMobileOverlay);
    };
    check(); // run on mount
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [state.isSplit, isMobileOverlay, updateState]);

  // Use functional setState to avoid stale closure on rapid toggles. Which
  // piece of state flips depends only on the CURRENT viewport width (read
  // fresh at click time, not from a stale render), so a resize between
  // renders can't leave the toggle acting on the wrong presentation.
  const toggle = useCallback(() => {
    if (typeof window !== 'undefined' && shouldUseMobileOverlay(window.innerWidth)) {
      setIsMobileOverlay((prev) => !prev);
      return;
    }
    setState(prev => {
      const next = { ...prev, isSplit: !prev.isSplit };
      persistState(next);
      return next;
    });
  }, []);

  const closeMobileOverlay = useCallback(() => setIsMobileOverlay(false), []);

  const setRightTab = useCallback(
    (tab: RightPanelTab) => {
      updateState({ rightTab: tab });
    },
    [updateState],
  );

  const setLeftWidthPercent = useCallback(
    (pct: number) => {
      updateState({ leftWidthPercent: clampWidth(pct) });
    },
    [updateState],
  );

  return {
    isSplit: state.isSplit,
    toggle,
    rightTab: state.rightTab,
    setRightTab,
    leftWidthPercent: clampWidth(state.leftWidthPercent),
    setLeftWidthPercent,
    isMobileOverlay,
    closeMobileOverlay,
  };
}
