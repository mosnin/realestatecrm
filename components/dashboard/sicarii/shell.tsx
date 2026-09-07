// Adapted directly from mosnin/Sicarii @ 7922be8b22e6f7cd3e6041ddecfeceac8f0a4414.
"use client";

/** Source Sicarii dock, floating sidebar, mobile navigation and Apps layout.
 * Chippi supplies destinations and existing workspace/account controls.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  createContext,
  useContext,
  type ComponentType,
} from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { usePathname } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
  LayoutGroup,
} from "motion/react";
import { cn } from "@/lib/utils";

import { AsciiField } from "./ascii-field";
import {
  Home,
  Radar,
  Telescope,
  Users,
  Crosshair,
  BookOpen,
  LayoutGrid,
  X,
  ArrowUpRight,
  PanelLeft,
  PanelLeftClose,
  ChevronDown,
  Settings,
  Gauge,
} from "lucide-react";

// ── MobileNavContext ──────────────────────────────────────────────────────────

type MobileNavContextValue = { navOpen: boolean };
const MobileNavContext = createContext<MobileNavContextValue>({
  navOpen: false,
});

/** Consume in any dashboard child to react to the mobile nav panel state. */
export function useMobileNav() {
  return useContext(MobileNavContext);
}

// ── Shared nav data ──────────────────────────────────────────────────────────

// Icons may be lucide icons or our own brand mark; both accept className.
type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  excludePaths?: string[];
  label: string;
  href: string;
  icon: NavIcon;
  accent?: boolean;
};

// Adaptation boundary: Chippi supplies its existing feature routes and account controls.
export type SicariiNavItem = NavItem & {
  description?: string;
  exact?: boolean;
  subItems?: SicariiNavItem[];
  excludePaths?: string[];
};
export interface SidebarGroup {
  label: string;
  items: SicariiNavItem[];
}
interface ShellNavigation {
  sidebarGroups?: SidebarGroup[];
  items: SicariiNavItem[];
  allItems: SicariiNavItem[];
  home: string;
  utilities: React.ReactNode;
}
const ShellNavigationContext = createContext<ShellNavigation>({
  items: [],
  allItems: [],
  home: "/",
  utilities: null,
});
const useShellNavigation = () => useContext(ShellNavigationContext);

// ── Helpers ──────────────────────────────────────────────────────────────────

function isActivePath(pathname: string, href: string) {
  if (href.includes("?") || href.includes("#")) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

type NavMode = "dock" | "sidebar";

const SIDEBAR_WIDTH = 256; // px - the sidebar panel's own width
// When sidebar is floating (left-3 = 12px margin), content must shift by:
//   sidebar width + left margin + gutter between sidebar edge and content
const SIDEBAR_INSET = SIDEBAR_WIDTH + 12 + 16; // 284 px total
const STORAGE_KEY = "chippi-sicarii-nav-mode";

// ── Dock magnification constants ─────────────────────────────────────────────
const BASE = 46;
const MAX = 78;
const MAX_TOUCH = 52; // gentler max on coarse-pointer (touch) devices
const ICON_BASE = 20;
const ICON_MAX = 34;
const ICON_MAX_TOUCH = 24;
const RADIUS = 130;

// Spring used for the morph animations
const MORPH_SPRING = { type: "spring" as const, stiffness: 260, damping: 30 };
// Slightly snappier spring for content inset
const INSET_SPRING = { type: "spring" as const, stiffness: 260, damping: 32 };
// Gentler spring for touch devices
const TOUCH_SPRING = { mass: 0.15, stiffness: 120, damping: 20 };

// ── DockNavButton ────────────────────────────────────────────────────────────

function DockNavButton({
  item,
  mouseX,
  active,
  isTouch,
}: {
  item: NavItem;
  mouseX: MotionValue<number>;
  active: boolean;
  isTouch: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = item.icon;

  const sizeMax = isTouch ? MAX_TOUCH : MAX;
  const iconMax = isTouch ? ICON_MAX_TOUCH : ICON_MAX;
  const spring = isTouch
    ? TOUCH_SPRING
    : { mass: 0.1, stiffness: 170, damping: 14 };

  const distance = useTransform(mouseX, (val) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: BASE };
    return val - b.x - b.width / 2;
  });

  const size = useSpring(
    useTransform(distance, [-RADIUS, 0, RADIUS], [BASE, sizeMax, BASE]),
    spring,
  );
  const iconSize = useSpring(
    useTransform(
      distance,
      [-RADIUS, 0, RADIUS],
      [ICON_BASE, iconMax, ICON_BASE],
    ),
    spring,
  );

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        className="group relative flex items-center justify-center"
      >
        {/* Tooltip */}
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-sicarii-charcoal/90">
          {item.label}
        </span>

        <motion.span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full transition-colors",
            item.accent
              ? "bg-sicarii-orange text-white shadow-lg shadow-sicarii-orange/30"
              : active
                ? "bg-sicarii-orange/15 text-sicarii-orange ring-1 ring-inset ring-sicarii-orange/30"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          )}
          transition={MORPH_SPRING}
        >
          <motion.span
            style={{ width: item.label === "Chippi" ? 36 : iconSize, height: iconSize }}
            className="flex"
          >
            {item.label === 'Chippi' ? <BrandLogo className="h-3 self-center" /> : <Icon
              className="h-full w-full"
              strokeWidth={item.accent ? 2.4 : 2}
            />}
          </motion.span>
        </motion.span>

        {/* Running-app dot */}
        {active && !item.accent && (
          <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sicarii-orange" />
        )}
      </motion.div>
    </Link>
  );
}

// ── Dock (desktop only - hidden on mobile via lg: prefix) ────────────────────

function Dock({
  isStaff,
  onOpenSidebar,
  onOpenLaunchpad,
  launchpadOpen,
}: {
  isStaff: boolean;
  onOpenSidebar: () => void;
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  void isStaff;
  const pathname = usePathname() ?? "";
  const { items: NAV_ITEMS, allItems, home, utilities } = useShellNavigation();
  const mouseX = useMotionValue(Infinity);

  // Detect coarse-pointer (touch) devices - disable aggressive magnification.
  // Initialised lazily (runs only on client) to avoid SSR mismatch.
  const [isTouch] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(pointer: coarse)").matches
      : false,
  );

  const sizeMax = isTouch ? MAX_TOUCH : MAX;
  const iconMax = isTouch ? ICON_MAX_TOUCH : ICON_MAX;
  const appsSpring = isTouch
    ? TOUCH_SPRING
    : { mass: 0.1, stiffness: 170, damping: 14 };

  // Apps launcher magnify
  const appsRef = useRef<HTMLDivElement>(null);
  const appsDistance = useTransform(mouseX, (val) => {
    const b = appsRef.current?.getBoundingClientRect() ?? { x: 0, width: BASE };
    return val - b.x - b.width / 2;
  });
  const appsSize = useSpring(
    useTransform(appsDistance, [-RADIUS, 0, RADIUS], [BASE, sizeMax, BASE]),
    appsSpring,
  );
  const appsIcon = useSpring(
    useTransform(
      appsDistance,
      [-RADIUS, 0, RADIUS],
      [ICON_BASE, iconMax, ICON_BASE],
    ),
    appsSpring,
  );

  // Sidebar toggle magnify
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarDistance = useTransform(mouseX, (val) => {
    const b = sidebarRef.current?.getBoundingClientRect() ?? {
      x: 0,
      width: BASE,
    };
    return val - b.x - b.width / 2;
  });
  const sidebarSize = useSpring(
    useTransform(sidebarDistance, [-RADIUS, 0, RADIUS], [BASE, sizeMax, BASE]),
    appsSpring,
  );
  const sidebarIcon = useSpring(
    useTransform(
      sidebarDistance,
      [-RADIUS, 0, RADIUS],
      [ICON_BASE, iconMax, ICON_BASE],
    ),
    appsSpring,
  );

  return (
    /* Hidden on mobile - MobileLauncher handles small screens instead */
    <motion.nav
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-3 hidden lg:block"
      aria-label="Primary"
      style={{ borderRadius: 9999 }}
    >
      <div
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex items-end gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-2 shadow-xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-sicarii-charcoal/80 dark:shadow-black/50 dark:ring-1 dark:ring-inset dark:ring-white/5"
      >
        {NAV_ITEMS.map((item) => (
          <DockNavButton
            key={item.href}
            item={item}
            mouseX={mouseX}
            active={
              isActivePath(pathname, item.href) &&
              !item.excludePaths?.some((p) => pathname.startsWith(p))
            }
            isTouch={isTouch}
          />
        ))}

        <span
          className="mx-0.5 mb-3 h-7 w-px self-center bg-border/60 dark:bg-white/10"
          aria-hidden="true"
        />

        {/* Apps launcher */}
        <button
          type="button"
          onClick={onOpenLaunchpad}
          aria-label="Open apps menu"
          aria-haspopup="dialog"
          aria-expanded={launchpadOpen}
        >
          <motion.div
            ref={appsRef}
            style={{ width: appsSize, height: appsSize }}
            className="group relative flex items-center justify-center"
          >
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-sicarii-charcoal/90">
              Apps
            </span>
            <span
              className={cn(
                "flex h-full w-full items-center justify-center rounded-full transition-colors",
                launchpadOpen
                  ? "bg-sicarii-orange/15 text-sicarii-orange ring-1 ring-inset ring-sicarii-orange/30"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <motion.span
                style={{ width: appsIcon, height: appsIcon }}
                className="flex"
              >
                <LayoutGrid className="h-full w-full" />
              </motion.span>
            </span>
          </motion.div>
        </button>

        {/* Sidebar toggle - desktop only */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Switch to sidebar navigation"
        >
          <motion.div
            ref={sidebarRef}
            style={{ width: sidebarSize, height: sidebarSize }}
            className="group relative flex items-center justify-center"
          >
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-xs font-medium opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-sicarii-charcoal/90">
              Sidebar
            </span>
            <span className="flex h-full w-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
              <motion.span
                style={{ width: sidebarIcon, height: sidebarIcon }}
                className="flex"
              >
                <PanelLeft className="h-full w-full" />
              </motion.span>
            </span>
          </motion.div>
        </button>
      </div>
    </motion.nav>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarItem({
  item,
  pathname,
}: {
  item: SicariiNavItem;
  pathname: string;
}) {
  const childActive = item.subItems?.some((child) =>
    isActivePath(pathname, child.href),
  );
  const [expanded, setExpanded] = useState(Boolean(childActive));
  useEffect(() => {
    if (childActive) setExpanded(true);
  }, [childActive]);
  const active =
    !childActive &&
    (item.exact ? pathname === item.href : isActivePath(pathname, item.href)) &&
    !item.excludePaths?.some((path) => pathname.startsWith(path));
  const Icon = item.icon;
  const groupId = `nav-${item.href.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-lg transition-colors",
          active
            ? "bg-primary/12 text-accent-foreground"
            : childActive
              ? "text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        )}
      >
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.label !== 'Chippi' && <Icon
            className="h-[18px] w-[18px] shrink-0"
            strokeWidth={active ? 2.2 : 1.8}
          />}
          <span className="truncate">{item.label === "Chippi" ? <BrandLogo className="h-5" /> : item.label}</span>
          {active && (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </Link>
        {!!item.subItems?.length && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
            aria-expanded={expanded}
            aria-controls={groupId}
            className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {!!item.subItems?.length && expanded && (
        <div
          id={groupId}
          className="ml-[21px] my-1 space-y-0.5 border-l border-border pl-3"
        >
          {item.subItems.map((child) => {
            const selected = child.exact
              ? pathname === child.href
              : isActivePath(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary/12 font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  isStaff,
  onCloseSidebar,
  onOpenLaunchpad,
  launchpadOpen,
}: {
  isStaff: boolean;
  onCloseSidebar: () => void;
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  void isStaff;
  const pathname = usePathname() ?? "";
  const { allItems, sidebarGroups, home, utilities } = useShellNavigation();

  return (
    <motion.nav
      key="sidebar"
      initial={{ x: -(SIDEBAR_WIDTH + 24), opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -(SIDEBAR_WIDTH + 24), opacity: 0 }}
      transition={MORPH_SPRING}
      className="fixed inset-y-3 left-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-sicarii-charcoal/95"
      style={{ width: SIDEBAR_WIDTH }}
      aria-label="Primary sidebar"
    >
      {/* Keep navigation quiet; the dashboard hero owns the animated field. */}

      {/* All nav content sits on top of the ASCII field */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* ── Logo / wordmark ── */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/40 px-4 dark:border-white/[0.06]">
          <Link href={home} className="flex items-center gap-2.5">
            <BrandLogo className="h-7" alt="Chippi" />
          </Link>
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label="Switch to dock navigation"
            title="Switch to dock"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* ── Nav items ── */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-4 px-2">
          {(sidebarGroups ?? [{ label: "Workspace", items: allItems }]).map(
            (group) => (
              <section
                key={group.label}
                aria-label={group.label}
                className="mb-4 last:mb-0"
              >
                <h2 className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </div>

        {/* ── Bottom actions ── */}
        <div className="shrink-0 border-t border-border/40 px-2 py-3 dark:border-white/[0.06] flex flex-col gap-2">
          {/* Apps launcher */}
          <button
            type="button"
            onClick={onOpenLaunchpad}
            aria-label="Open apps menu"
            aria-haspopup="dialog"
            aria-expanded={launchpadOpen}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full",
              launchpadOpen
                ? "bg-sicarii-orange/10 text-sicarii-orange"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5 shrink-0" />
            <span>Apps</span>
          </button>

          {/* User + workspace + theme */}
          <div className="sicarii-sidebar-utilities flex flex-wrap items-center gap-1 px-1 py-2">
            {utilities}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}

// ── MobileBottomNav - persistent bottom tab bar (mobile only) ─────────────────
// No sidebar on mobile; the sidebar toggle lives only in the desktop dock.

function MobileBottomNav({
  onOpenLaunchpad,
  launchpadOpen,
}: {
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  const pathname = usePathname() ?? "";
  const { items: NAV_ITEMS, allItems, home, utilities } = useShellNavigation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-0.5 rounded-2xl border border-border/60 bg-background/90 px-1.5 py-1.5 shadow-xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-sicarii-charcoal/85 dark:shadow-black/40">
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active =
            isActivePath(pathname, item.href) &&
            !item.excludePaths?.some((p) => pathname.startsWith(p));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  item.accent
                    ? "bg-sicarii-orange text-white shadow-md shadow-sicarii-orange/30"
                    : active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground",
                )}
              >
                {item.label === 'Chippi' ? <BrandLogo className="h-3" /> : <Icon className="h-5 w-5" strokeWidth={item.accent ? 2.4 : 2} />}
              </span>
              <span className={item.label === 'Chippi' ? 'sr-only' : 'text-[10px] font-medium text-muted-foreground'}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Apps launcher */}
        <button
          type="button"
          onClick={onOpenLaunchpad}
          aria-label="Open apps menu"
          aria-haspopup="dialog"
          aria-expanded={launchpadOpen}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5"
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              launchpadOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            Apps
          </span>
        </button>
      </div>
    </nav>
  );
}

// ── Launchpad ────────────────────────────────────────────────────────────────

function Launchpad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? "";
  const { items: NAV_ITEMS, allItems, home, utilities } = useShellNavigation();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[aria-label="Apps menu"] a[href], [aria-label="Apps menu"] button',
        ),
      );
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (
        !nodes.includes(document.activeElement as HTMLElement) ||
        (!e.shiftKey && document.activeElement === last)
      ) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Apps menu"
          className="fixed inset-0 z-[100] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <button
            type="button"
            aria-label="Close apps menu"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-background/95 backdrop-blur-xl"
          />
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.15] dark:opacity-40" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(255,150,79,0.12),transparent_60%)]" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none relative flex h-full flex-col overflow-hidden"
          >
            <div className="pointer-events-auto flex shrink-0 items-center justify-between px-5 pt-7 sm:px-10">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-primary/80">
                  Chippi // Workspace
                </p>
                <h2 className="font-brand mt-1 text-3xl text-foreground sm:text-4xl">
                  Everything
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/60 text-foreground transition-colors hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="pointer-events-auto flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-10">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {allItems.map((tile, i) => {
                    const active =
                      isActivePath(pathname, tile.href) &&
                      !tile.excludePaths?.some((p) => pathname.startsWith(p));
                    return (
                      <Link
                        key={tile.href}
                        href={tile.href}
                        aria-current={active ? "page" : undefined}
                        onClick={onClose}
                        className={cn(
                          "group relative flex flex-col justify-between gap-8 overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1",
                          tile.accent
                            ? "border-primary/40 bg-primary/[0.07] hover:bg-primary/[0.12]"
                            : "border-border bg-card/60 hover:border-border/80 hover:bg-card",
                          active && "ring-1 ring-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={cn(
                              "font-brand text-sm tabular-nums",
                              tile.accent
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <ArrowUpRight
                            className={cn(
                              "h-5 w-5 -translate-y-0.5 translate-x-0.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100",
                              tile.accent ? "text-primary" : "text-foreground",
                            )}
                          />
                        </div>
                        <div>
                          <h3 className="font-brand text-2xl text-foreground">
                            {tile.label === 'Chippi' ? <BrandLogo className="h-7" /> : tile.label}
                          </h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {tile.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── DashboardShell (main export) ─────────────────────────────────────────────

export function SicariiShell({
  sidebarGroups,
  items,
  allItems,
  home,
  utilities,
  children,
}: ShellNavigation & { children: React.ReactNode }) {
  return (
    <ShellNavigationContext.Provider
      value={{ items, allItems, home, utilities, sidebarGroups }}
    >
      <DashboardShell isStaff={false}>{children}</DashboardShell>
    </ShellNavigationContext.Provider>
  );
}
function DashboardShell({
  isStaff,
  children,
}: {
  isStaff: boolean;
  children: React.ReactNode;
}) {
  const { home, utilities } = useShellNavigation();
  const pathname = usePathname() ?? "";
  const isChat = pathname.endsWith("/chippi");
  const prefersReduced = useReducedMotion();

  // ── Nav mode - persisted, forced to dock on mobile ──────────────────────
  const [mode, setMode] = useState<NavMode>("sidebar");
  const [hydrated, setHydrated] = useState(false);
  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Hydration + localStorage read. Canonical next-themes pattern - set state
  // in effect on mount to read browser APIs after SSR.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as NavMode | null;
    const desktop = window.innerWidth >= 1024;
    setIsDesktop(desktop);
    if (stored === "sidebar" && desktop) {
      setMode("sidebar");
    }
    setHydrated(true);
  }, []);

  // Resize listener - force dock on <lg; close mobile nav if resized to desktop
  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (!desktop) setMode("dock");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setNavMode = useCallback((next: NavMode) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const openSidebar = useCallback(() => setNavMode("sidebar"), [setNavMode]);
  const closeSidebar = useCallback(() => setNavMode("dock"), [setNavMode]);
  const openLaunchpad = useCallback(() => setLaunchpadOpen(true), []);
  const closeLaunchpad = useCallback(() => setLaunchpadOpen(false), []);

  const isSidebar = mode === "sidebar" && isDesktop && hydrated;

  // Content inset - slides right to make room for the floating sidebar.
  // SIDEBAR_INSET = sidebar width (256) + left margin (12) + gutter (16) = 284px
  const contentPaddingLeft = isSidebar ? SIDEBAR_INSET : 0;
  const contentTransition = prefersReduced ? { duration: 0 } : INSET_SPRING;

  return (
    <MobileNavContext.Provider value={{ navOpen: false }}>
      <LayoutGroup>
        <div
          className="sicarii-shell min-h-screen bg-background dark:bg-sicarii-charcoal-dark"
          data-chat={isChat}
        >
          {/* ── Floating top header ── */}
          {/* In sidebar mode: collapsed to zero height (out of flow) so it
              leaves no dead gap at the top of the main content area.
              In dock mode: rendered normally as a sticky header. */}
          <motion.div
            className="sticky top-0 z-40 overflow-hidden"
            animate={{
              height: isSidebar ? 0 : "auto",
              opacity: isSidebar ? 0 : 1,
              pointerEvents: isSidebar ? "none" : "auto",
            }}
            transition={contentTransition}
            aria-hidden={isSidebar}
          >
            <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
              <div className="flex h-12 items-center justify-between gap-2">
                <Link href={home} className="flex items-center gap-2">
                  <BrandLogo className="h-6" alt="Chippi" />
                </Link>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Personal vs team context: switching orgs re-scopes every
                      page to the shared workspace CRM. */}
                  {!isSidebar && utilities}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Main content - animated inset; inner column stays max-w-7xl so it
              keeps its size (just re-centers) when the sidebar opens ── */}
          <motion.div
            animate={{ paddingLeft: contentPaddingLeft }}
            transition={contentTransition}
            className="sicarii-content pb-24 pt-6 lg:pb-36"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </motion.div>

          {/* ── Nav - dock (desktop) or sidebar (desktop) or mobile panel ── */}
          <AnimatePresence mode="wait">
            {isSidebar ? (
              <Sidebar
                key="sidebar"
                isStaff={isStaff}
                onCloseSidebar={closeSidebar}
                onOpenLaunchpad={openLaunchpad}
                launchpadOpen={launchpadOpen}
              />
            ) : (
              <Dock
                key="dock"
                isStaff={isStaff}
                onOpenSidebar={openSidebar}
                onOpenLaunchpad={openLaunchpad}
                launchpadOpen={launchpadOpen}
              />
            )}
          </AnimatePresence>

          {/* ── Mobile bottom nav - mobile only ── */}
          <MobileBottomNav
            onOpenLaunchpad={openLaunchpad}
            launchpadOpen={launchpadOpen}
          />

          {/* ── Launchpad overlay ── */}
          <Launchpad open={launchpadOpen} onClose={closeLaunchpad} />
        </div>
      </LayoutGroup>
    </MobileNavContext.Provider>
  );
}
