import {
  Users,
  UserCircle,
  Briefcase,
  MessageCircle,
  Inbox,
  Settings,
  Calendar,
  ClipboardList,
  Building2,
  FolderOpen,
  Aperture,
  Sun,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NavChild {
  href: string;
  label: string;
  exact?: boolean;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Sub-items that expand inline */
  children?: NavChild[];
  /** Show as AI assistant item with chip avatar */
  isAI?: boolean;
  /** Badge key for dynamic counts (e.g. 'leads', 'followUps') */
  badgeKey?: string;
  /**
   * Path prefixes this item must NOT claim even though they sit under its
   * href. Lets a sub-route be promoted to its own top-level nav item (Today
   * lives at /chippi/brief but belongs to the Today row, not Chippi) without
   * both rows lighting up.
   */
  excludePaths?: string[];
}

// ── Realtor sidebar nav ──────────────────────────────────────────────────────
//
// Chippi is the home — the chat surface IS the OS. The Chippi entry expands
// into the agent's sub-surfaces (Full day, Drafts, Activity, Memory,
// Integrations), so the chat root stays a clean chat-first hero and the
// realtor reaches the dashboards via the dropdown rather than scrolling
// past them every time they want to talk to Chippi.
//
// Everything else in the sidebar is the realtor-facing substrate they still
// expect from a CRM: People, Deals, Calendar, Properties, Intake.

export const realtorNavItems: NavItem[] = [
  {
    href: '/chippi',
    label: 'Chippi',
    icon: MessageCircle,
    isAI: true,
    badgeKey: 'pendingDrafts',
    // /chippi/brief is the Today row's home (promoted to its own top-level
    // item below) — excluded here so the two rows never light up together.
    excludePaths: ['/chippi/brief'],
    children: [
      { href: '/chippi/inbox', label: 'Inbox' },
      // Activity = the ONE unified, filterable timeline (/chippi/activity) that
      // merges Chippi's own actions with the cross-app events it noticed —
      // replacing the old split between /chippi/history (actions) and
      // /chippi/triggers (events). Per-app trigger management still lives on
      // /chippi/triggers (linked from the Activity page header), so the live
      // feed is subsumed without losing the listen on/off toggles.
      // Integrations = the connect/disconnect management surface.
      { href: '/chippi/activity', label: 'Activity' },
      // Sessions = background work-session history: past reports, re-run,
      // and the recurring-run controls.
      { href: '/chippi/sessions', label: 'Sessions' },
      { href: '/chippi/integrations', label: 'Plugins' },
    ],
  },
  // Today — the prepared day, and the workspace's default landing (the root
  // /s/[slug] redirect points here). One glance: today's book, what Chippi
  // did, what needs a human. Owns /chippi/brief exclusively (see the
  // excludePaths on the Chippi item above).
  {
    href: '/chippi/brief',
    label: 'Today',
    icon: Sun,
    exact: true,
  },
  {
    href: '/automations',
    label: 'Automations',
    icon: Zap,
    badgeKey: 'activeWorkflows',
    // Workflows + Routines are two SECTIONS of the single Automations hub, not
    // separate pages — the hub renders both. These children scroll to the
    // matching section anchor so we never show two near-identical pages (the
    // hub and a workflows-only page rendering the same manager).
    children: [
      { href: '/automations#workflows', label: 'Workflows' },
      { href: '/automations?new=1', label: 'New workflow' },
      { href: '/automations#routines', label: 'Routines' },
      { href: '/automations/settings', label: 'Configuration' },
    ],
  },
  {
    href: '/contacts',
    label: 'People',
    icon: Users,
    badgeKey: 'leads',
    children: [
      { href: '/sync', label: 'Smart sync' },
    ],
  },
  {
    href: '/deals',
    label: 'Deals',
    icon: Briefcase,
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: Calendar,
  },
  {
    href: '/communication',
    label: 'Mailbox',
    icon: Inbox,
  },
  {
    href: '/properties',
    label: 'Properties',
    icon: Building2,
    badgeKey: 'properties',
    children: [
      { href: '/properties/new', label: 'Add property' },
      { href: '/properties/commissions', label: 'Commissions' },
      { href: '/cma', label: 'CMA' },
    ],
  },
  {
    href: '/studio',
    label: 'Studio',
    icon: Aperture,
    children: [
      { href: '/studio/create', label: 'Create' },
      { href: '/studio/edit', label: 'Edit' },
      { href: '/studio/compose', label: 'Compose' },
      { href: '/studio/schedule', label: 'Schedule' },
      { href: '/studio/library', label: 'Library' },
      { href: '/studio/brand', label: 'Brand' },
    ],
  },
  {
    href: '/files',
    label: 'Files',
    icon: FolderOpen,
    children: [
      { href: '/documents', label: 'Documents' },
    ],
  },
  {
    href: '/profile-page',
    label: 'Profile',
    icon: UserCircle,
  },
  {
    href: '/intake',
    label: 'Intake form',
    icon: ClipboardList,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

/**
 * Secondary "More" section — intentionally empty. The sidebar checks
 * `realtorMoreNavItems.length > 0` and hides the section when it is.
 *
 * Routes that used to live here are reachable two ways:
 *   - Settings → Integrations (was: /integrations)
 *   - Settings → Chippi → Build your own agents (was: /agents)
 *   - Per-surface stats tabs (was: /analytics)
 * Anything else is reachable by direct URL but doesn't earn nav weight.
 */
export const realtorMoreNavItems: NavItem[] = [];

// ── Header right-side menu ───────────────────────────────────────────────────
//
// Intentionally empty. Settings already lives in `realtorNavItems` as a
// primary nav row; surfacing it again in a separate "Account" section in
// the mobile drawer was a duplicate. Kept as an extension point — add
// Billing, Profile, or other account-level routes here when they earn it.
export const secondaryNavItems: { href: string; label: string; icon: LucideIcon }[] = [];

/** Primary items with shorter labels for the mobile bottom bar. Mirrors the
 *  sidebar's core five: Today replaces Calendar (Calendar lives in More /
 *  behind Chippi — the prepared day already surfaces what's coming). */
export const mobileNavItems = [
  { href: '/chippi', label: 'Chippi', icon: MessageCircle },
  { href: '/chippi/brief', label: 'Today', icon: Sun },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
