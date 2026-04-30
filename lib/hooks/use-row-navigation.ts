'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keyboard row navigation primitive.
 *
 * Wires J/K (vim-style) and ↑/↓ to move between list rows, and Enter/Space to
 * open the focused one. Designed to coexist with inputs: if the user is
 * typing in a text field or the command palette is open (body is scroll-
 * locked), the hook stays out of the way.
 *
 * Usage:
 *   const { focusedId, containerRef } = useRowNavigation(ids, (id) => router.push(...));
 *   <div ref={containerRef}>
 *     {rows.map((r) => <Row key={r.id} highlighted={focusedId === r.id} ... />)}
 *   </div>
 */
export function useRowNavigation<T extends string>(
  ids: T[],
  onOpen: (id: T) => void,
): { focusedId: T | null; containerRef: React.RefObject<HTMLDivElement | null>; focus: (id: T) => void } {
  const [focusedId, setFocusedId] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset focus if the ids list shrinks out from under us or the current
  // focused row is no longer present.
  useEffect(() => {
    if (focusedId && !ids.includes(focusedId)) {
      setFocusedId(ids[0] ?? null);
    }
  }, [ids, focusedId]);

  const focus = useCallback((id: T) => setFocusedId(id), []);

  useEffect(() => {
    function isTyping(el: Element | null): boolean {
      if (!el) return false;
      if (el instanceof HTMLInputElement) return el.type !== 'checkbox' && el.type !== 'radio';
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(document.activeElement)) return;
      if (ids.length === 0) return;

      const currentIndex = focusedId ? ids.indexOf(focusedId) : -1;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, ids.length - 1);
        setFocusedId(ids[next]);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
        setFocusedId(ids[next]);
      } else if ((e.key === 'Enter' || e.key === ' ') && focusedId) {
        e.preventDefault();
        onOpen(focusedId);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, focusedId, onOpen]);

  // Scroll the focused row into view when focus moves.
  useEffect(() => {
    if (!focusedId || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(`[data-row-id="${focusedId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedId]);

  return { focusedId, containerRef, focus };
}
