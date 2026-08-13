'use client';

import { useCallback, useEffect, useState } from 'react';
import { DURATION_DROP, EASE_IN_OUT } from '@/lib/motion';

export type ChippiSidebarView = 'menu' | 'history';

export const CHIPPI_SIDEBAR_VIEW_EVENT = 'chippi:sidebar-view';
export const CHIPPI_SIDEBAR_REVEAL_EVENT = 'chippi:sidebar-reveal';

export const CHIPPI_SIDEBAR_TRANSITION = {
  duration: DURATION_DROP,
  ease: EASE_IN_OUT,
} as const;

export function defaultChippiSidebarView(
  pathname: string,
  chatRoot: string,
): ChippiSidebarView {
  return pathname === chatRoot ? 'history' : 'menu';
}

function isChippiSidebarView(value: unknown): value is ChippiSidebarView {
  return value === 'menu' || value === 'history';
}

/**
 * Switches the single dashboard navigation surface. `reveal` is used by the
 * chat's History action: desktop already has the sidebar on screen, while the
 * mobile header responds by opening its existing Sheet on the history view.
 */
export function requestChippiSidebarView(
  view: ChippiSidebarView,
  options: { reveal?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CHIPPI_SIDEBAR_VIEW_EVENT, { detail: { view } }),
  );
  if (options.reveal) {
    window.dispatchEvent(new CustomEvent(CHIPPI_SIDEBAR_REVEAL_EVENT));
  }
}

/**
 * Shared state for the desktop rail and the mobile Sheet. Route entry is the
 * reset boundary: the exact chat root opens on History; every other route
 * opens on the product menu. Query-string changes stay in the selected view so
 * choosing another conversation does not bounce the navigation.
 */
export function useChippiSidebarView(
  pathname: string,
  chatRoot: string,
): readonly [ChippiSidebarView, (view: ChippiSidebarView) => void] {
  const routeDefault = defaultChippiSidebarView(pathname, chatRoot);
  const [view, setView] = useState<ChippiSidebarView>(routeDefault);

  useEffect(() => {
    setView(routeDefault);
  }, [chatRoot, routeDefault]);

  useEffect(() => {
    if (pathname !== chatRoot) return;

    const onView = (event: Event) => {
      const next = (event as CustomEvent<{ view?: unknown }>).detail?.view;
      if (isChippiSidebarView(next)) setView(next);
    };
    window.addEventListener(CHIPPI_SIDEBAR_VIEW_EVENT, onView);
    return () => window.removeEventListener(CHIPPI_SIDEBAR_VIEW_EVENT, onView);
  }, [chatRoot, pathname]);

  const selectView = useCallback((next: ChippiSidebarView) => {
    setView(next);
    requestChippiSidebarView(next);
  }, []);

  return [view, selectView] as const;
}

export function chippiSidebarPanelMotion(
  view: ChippiSidebarView,
  reducedMotion: boolean,
) {
  const x = reducedMotion ? 0 : view === 'history' ? 10 : -10;
  return {
    initial: { opacity: 0, x },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x },
    transition: CHIPPI_SIDEBAR_TRANSITION,
  } as const;
}
