'use client';
import { useCallback, useEffect, useRef } from 'react';

/** Keep form edits on rejected navigation; full reload uses the native prompt. */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const confirmLeave = useCallback(() => !dirtyRef.current || window.confirm('Leave this page with unsaved changes?'), []);
  const markSaved = useCallback(() => { dirtyRef.current = false; }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!confirmLeave()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [confirmLeave]);
  return { confirmLeave, markSaved };
}
