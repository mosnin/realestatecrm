'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar collapse — desktop-only icon-rail mode for the realtor sidebar.
//
// State lives in localStorage under `chippi.sidebar.collapsed`. To avoid an
// SSR/CSR width flash on first paint, the provider starts as expanded on the
// server and switches to the persisted value on mount with `transitions`
// suppressed for that single sync (so the user only sees animations on
// genuine toggles, not on hydration).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'chippi.sidebar.collapsed';

interface SidebarCollapseContextValue {
  collapsed: boolean;
  /** True only during the user-driven toggle animation; false during hydration sync. */
  animating: boolean;
  toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const hydrated = useRef(false);

  // Read persisted value on mount. Skip the transition for this initial sync
  // so users don't see a width animation on page load.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === '1') setCollapsed(true);
    } catch {
      // Private mode / disabled storage — fall back to expanded default.
    }
    hydrated.current = true;
  }, []);

  const toggle = useCallback(() => {
    setAnimating(true);
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore — state still updates in memory for this session.
      }
      return next;
    });
    // Match the 200ms width transition; clear the animating flag after.
    window.setTimeout(() => setAnimating(false), 220);
  }, []);

  // ⌘B / Ctrl+B toggles the rail — the shadcn/shark sidebar convention, and
  // the one capability this sidebar lacked vs. the shark reference. Skipped
  // while an input/textarea/contenteditable has focus so a form shortcut
  // never yanks the layout mid-typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'b' || (!e.metaKey && !e.ctrlKey) || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return (
    <TooltipProvider delayDuration={120}>
      <SidebarCollapseContext.Provider value={{ collapsed, animating, toggle }}>
        {children}
      </SidebarCollapseContext.Provider>
    </TooltipProvider>
  );
}

export function useSidebarCollapsed() {
  const ctx = useContext(SidebarCollapseContext);
  // When the sidebar isn't wrapped (e.g. broker sidebar), behave as expanded.
  if (!ctx) return { collapsed: false, animating: false, toggle: () => {} };
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle button — pinned just above the user-footer divider in the realtor
// sidebar. Single tiny button, ChevronLeft when expanded, ChevronRight when
// collapsed. Tooltip explains the action.
// ─────────────────────────────────────────────────────────────────────────────

export function SidebarCollapseToggle() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const Icon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <div
      className={cn(
        'px-2 pb-2',
        collapsed && 'flex justify-center',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-label={label}
            className={cn(
              'flex items-center justify-center h-7 rounded-md text-foreground/55 transition-colors duration-150',
              'hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.045]',
              collapsed ? 'w-7' : 'w-7 ml-auto',
            )}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
          <kbd className="ml-1.5 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘B
          </kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip helper — wraps `children` in a right-side tooltip only when the
// sidebar is collapsed. Keeps the expanded sidebar free of unnecessary
// tooltip mounts.
// ─────────────────────────────────────────────────────────────────────────────

export function CollapsedTooltip({
  label,
  enabled,
  children,
}: {
  label: React.ReactNode;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
