import type { NavChild, NavItem } from '@/lib/nav-items';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar active-state resolution — ONE source of truth for "which nav row is
// selected", shared by the desktop sidebar, the compact rail, and the mobile
// drawer.
//
// The bug this replaces: every row decided its own active state with a bare
// `pathname.startsWith(href)`. Any route reachable from more than one row lit
// up ALL of them. On /broker/brief that meant three simultaneous selections —
// the Chippi parent (its "Today" child points at /broker/brief), that child,
// and the top-level Today row that actually owns the route.
//
// The model here is winner-take-one: every nav target (top-level row or child)
// is a CANDIDATE, the most specific matching candidate wins, and exactly that
// one renders as selected.
//
// Specificity, in order:
//   1. Longer matched path wins (/broker/settings/profile beats /broker/settings).
//   2. A candidate that also matches declared query params beats one that
//      doesn't (/automations?new=1 beats /automations).
//   3. A "native" target — one that lives under its own parent's href — beats a
//      cross-link (Chippi's "Today" child pointing at /broker/brief loses to the
//      top-level Today row, which owns that subtree).
//   4. The parent row beats its own child when both resolve to the same route
//      (broker Chippi and its "History" child are both /broker/chippi).
//   5. Declaration order — first one declared wins.
//
// Cross-links still highlight when nothing else claims the route: People →
// "Smart sync" (/sync) has no top-level row of its own, so it stays selectable.
// ─────────────────────────────────────────────────────────────────────────────

/** The single winning nav target for the current route. */
export interface NavActiveMatch {
  /** `href` of the winning top-level item, as declared (not base-prefixed). */
  itemHref: string | null;
  /** `href` of the winning child, or null when the top-level row itself won. */
  childHref: string | null;
}

export const NO_NAV_MATCH: NavActiveMatch = { itemHref: null, childHref: null };

/** Split a declared nav href into path / query / hash. */
function splitHref(href: string): { path: string; query: string | null; hasHash: boolean } {
  const [beforeHash, hash] = href.split('#');
  const [path, query] = beforeHash.split('?');
  return { path, query: query || null, hasHash: hash !== undefined };
}

/**
 * Segment-boundary prefix match. `/deals` must not claim `/deals-archive`;
 * only `/deals` itself and `/deals/...` belong to it.
 */
function pathMatches(pathname: string, target: string, exact?: boolean): boolean {
  if (pathname === target) return true;
  if (exact) return false;
  return pathname.startsWith(`${target}/`);
}

/** True when every param declared on the child href is present in the URL. */
function queryMatches(query: string, searchParams?: string): boolean {
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(searchParams ?? '');
  for (const [key, value] of want.entries()) {
    if (have.get(key) !== value) return false;
  }
  return true;
}

type Candidate = {
  itemHref: string;
  childHref: string | null;
  /** Length of the matched path — the primary specificity signal. */
  pathScore: number;
  /** 1 when the candidate also matched declared query params. */
  queryScore: number;
  /** False for a child that points outside its own parent's subtree. */
  native: boolean;
  order: number;
};

/** Returns true when `a` is a more specific match than `b`. */
function beats(a: Candidate, b: Candidate): boolean {
  if (a.pathScore !== b.pathScore) return a.pathScore > b.pathScore;
  if (a.queryScore !== b.queryScore) return a.queryScore > b.queryScore;
  if (a.native !== b.native) return a.native;
  const aIsParent = a.childHref === null;
  const bIsParent = b.childHref === null;
  if (aIsParent !== bIsParent) return aIsParent;
  return a.order < b.order;
}

/**
 * Resolve the one selected nav target for the current route.
 *
 * @param items  every top-level row the surface actually renders (role-gated
 *               rows already filtered out — a hidden row must not win a route
 *               away from a visible one).
 */
export function resolveNavActive(
  items: NavItem[],
  pathname: string,
  base: string,
  searchParams?: string,
): NavActiveMatch {
  const candidates: Candidate[] = [];
  let order = 0;

  for (const item of items) {
    const itemPath = item.href === '' ? base : `${base}${item.href}`;

    // A sub-route promoted to its own row (Today at /chippi/brief) is
    // disclaimed by the parent that would otherwise prefix-match it.
    const disclaimed = item.excludePaths?.some((p) => pathMatches(pathname, `${base}${p}`));

    if (!disclaimed && pathMatches(pathname, itemPath, item.exact)) {
      candidates.push({
        itemHref: item.href,
        childHref: null,
        pathScore: itemPath.length,
        queryScore: 0,
        native: true,
        order: order++,
      });
    }

    for (const child of item.children ?? []) {
      const { path, query, hasHash } = splitHref(child.href);
      // Anchor children scroll to a section of the page they already share
      // with their parent (/automations#workflows). The pathname can't tell
      // which section is in view, so they never claim the selection — the
      // parent row does.
      if (hasHash) continue;

      const childPath = `${base}${path}`;
      if (!pathMatches(pathname, childPath, child.exact)) continue;
      if (query && !queryMatches(query, searchParams)) continue;

      candidates.push({
        itemHref: item.href,
        childHref: child.href,
        pathScore: childPath.length,
        queryScore: query ? 1 : 0,
        native: childPath === itemPath || childPath.startsWith(`${itemPath}/`),
        order: order++,
      });
    }
  }

  let winner: Candidate | undefined;
  for (const candidate of candidates) {
    if (!winner || beats(candidate, winner)) winner = candidate;
  }
  if (!winner) return NO_NAV_MATCH;
  return { itemHref: winner.itemHref, childHref: winner.childHref };
}

/**
 * Does this row own the current route — itself or through one of its children?
 * Drives accordion auto-expansion and the "More" section auto-open, NOT the
 * highlight (see `isNavItemActive`).
 */
export function navItemOwnsMatch(item: NavItem, match: NavActiveMatch): boolean {
  return match.itemHref !== null && match.itemHref === item.href;
}

/**
 * Should this top-level row render as selected?
 *
 * The row lights up when it owns the route itself. When a CHILD owns it, the
 * highlight belongs to the child — unless the children aren't on screen
 * (collapsed accordion, or the icon-only rail), in which case the parent
 * carries the selection so the route is never invisible.
 */
export function isNavItemActive(
  item: NavItem,
  match: NavActiveMatch,
  options?: { childrenVisible?: boolean },
): boolean {
  if (!navItemOwnsMatch(item, match)) return false;
  if (match.childHref === null) return true;
  return !options?.childrenVisible;
}

/** Should this child row render as selected? */
export function isNavChildActive(
  item: NavItem,
  child: NavChild,
  match: NavActiveMatch,
): boolean {
  return navItemOwnsMatch(item, match) && match.childHref === child.href;
}
