import {
  Users,
  Briefcase,
  Sparkles,
  Settings,
  Calendar,
  ClipboardList,
  BarChart2,
  Plug,
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
// Realtor mental model: properties first, then deals. A realtor has an
// inventory of listings/rentals they're working; leads come in; a lead gets
// attached to a property as a deal. Putting Properties above Deals reflects
// that order. Commissions is a money-view of the same property inventory
// (revenue per closing), so it sits as a child under Properties.
//
// Settings stays as the only true configuration destination. Sub-pages live
// behind an in-page tab strip in app/s/[slug]/settings/layout.tsx.

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
    href: '/properties',
    label: 'Properties',
    icon: Building2,
    children: [
      { href: '/properties/commissions', label: 'Commissions' },
    ],
  },
  {
    href: '/deals',
    label: 'Deals',
    icon: Briefcase,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

/**
 * Secondary realtor nav — visually subordinate "More" section. Calendar
 * absorbs Tours (a tour is just a calendar event with a property + contact
 * attached). Intake collapses to a single destination: the overview is the
 * home of the form (link + recent submissions) and the only other surface
 * that earns its place is /customize, reachable inline from the overview.
 * Sub-pages for Share / Tracking / Submissions were configuration disguised
 * as features and have been cut.
 *
 * Properties + Commissions used to live here; promoted up to the primary
 * nav so the realtor's inventory is one click away (matches their workflow:
 * properties first, then leads against properties as deals).
 */
export const realtorMoreNavItems: NavItem[] = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/integrations', label: 'Integrations', icon: Plug },
  { href: '/intake', label: 'Intake form', icon: ClipboardList },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
];

// ── Header right-side menu ───────────────────────────────────────────────────

export const secondaryNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '/chippi', label: 'Chippi', icon: Sparkles },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
