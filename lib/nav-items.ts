import {
  Users,
  Briefcase,
  Sparkles,
  Settings,
  Calendar,
  ClipboardList,
  Building2,
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
}

// ── Realtor sidebar nav ──────────────────────────────────────────────────────
//
// Chippi is the home — the chat surface IS the OS. Everything else in the
// sidebar is the realtor-facing substrate they still expect from a CRM:
// People, Deals, Calendar, Properties, Intake. Settings catches the rest.
//
// Agent primitives (Approvals, Tasks, Activity, Memory, Log) don't earn
// sidebar slots — they surface inline on the Chippi page (approvals pill,
// morning replay) or live in Settings (memory, log).
//
// Cut from primary nav: Agents, Swarm, Analytics, Reviews, Follow-ups,
// Commissions, Integrations. Routes still resolve; they're not advertised.

export const realtorNavItems: NavItem[] = [
  {
    href: '/chippi',
    label: 'Chippi',
    icon: Sparkles,
    isAI: true,
    badgeKey: 'pendingDrafts',
  },
  {
    href: '/contacts',
    label: 'People',
    icon: Users,
    badgeKey: 'leads',
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
    href: '/properties',
    label: 'Properties',
    icon: Building2,
    badgeKey: 'properties',
    children: [
      { href: '/deals/new', label: 'Add property' },
      { href: '/properties/commissions', label: 'Commissions' },
    ],
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

export const secondaryNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '/chippi', label: 'Chippi', icon: Sparkles },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
