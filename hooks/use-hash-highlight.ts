'use client';

import { useEffect, useState } from 'react';

/**
 * Deep-link target highlighting. When the page is navigated to with a URL hash
 * (e.g. `#workflow-abc` from the activity feed), the element whose anchor id
 * matches is scrolled into view and briefly flashed so the realtor SEES which
 * row the link meant — a jump that lands silently in a long list is a jump that
 * feels broken.
 *
 * Returns the currently-highlighted anchor id (or null). A row renders its
 * highlight ring when `highlightedId === myAnchorId`. The flash auto-clears
 * after `durationMs` and re-arms whenever the hash changes (so clicking two
 * different feed items in a row both flash).
 *
 * Robust by contract: SSR-safe (no window access during render), no-ops without
 * a hash, and only scrolls once the matching element actually exists in the DOM
 * (handles a list that mounts after the hash is already set).
 */
export function useHashHighlight(durationMs = 2200): string | null {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    let rafHandle: number | undefined;
    // Token bumped on each activation; the in-flight rAF retry loop checks it so
    // a previous loop can't scroll to its (now stale) target after a newer hash
    // was requested — rapid successive deep-links would otherwise fight over
    // scrollIntoView and yank the viewport back to the old row.
    let activeToken = 0;

    function activateFromHash() {
      const raw = window.location.hash.replace(/^#/, '');
      if (!raw) return;
      const token = ++activeToken;
      setHighlightedId(raw);

      // Scroll the target into view once it exists. The list may still be
      // loading when the hash is already present, so retry a few frames — but
      // bail the moment a newer activation supersedes this one.
      let attempts = 0;
      const tryScroll = () => {
        if (token !== activeToken) return;
        const el = document.getElementById(raw);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (attempts++ < 20) rafHandle = requestAnimationFrame(tryScroll);
      };
      rafHandle = requestAnimationFrame(tryScroll);

      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setHighlightedId(null), durationMs);
    }

    activateFromHash();
    window.addEventListener('hashchange', activateFromHash);
    return () => {
      window.removeEventListener('hashchange', activateFromHash);
      if (clearTimer) clearTimeout(clearTimer);
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
    };
  }, [durationMs]);

  return highlightedId;
}
