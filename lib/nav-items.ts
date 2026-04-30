import {
  Users,
  Briefcase,
  Sparkles,
  Settings,
  CalendarDays,
  Calendar,
  FileText,
  ClipboardList,
  BarChart2,
  Home,
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
// Four items. Chippi is the home — "Today" isn't a separate destination, it's
// the morning view of the agent surface. Tours/Calendar/Notes/Reviews/
// Analytics/Intake are reachable by URL but don't earn a nav slot; they'll be
// absorbed into the agent surface in Phase 5 as inline tools the agent calls.
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
    href: '/deals',
    label: 'Pipeline',
    icon: Briefcase,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

/**
 * Secondary realtor nav — visually subordinate "More" section. These are
 * destinations that have users but don't need daily prominence. Intake form
 * and Tours expand inline so their sub-pages (Customize, Share, Booking,
 * Availability) are reachable in one click instead of buried inside an
 * overview page. Routes are unchanged.
 */
export const realtorMoreNavItems: NavItem[] = [
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  {
    href: '/properties',
    label: 'Properties',
    icon: Home,
    children: [
      { href: '/properties', label: 'All', exact: true },
      { href: '/properties/commissions', label: 'Commissions' },
    ],
  },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  {
    href: '/intake',
    label: 'Intake form',
    icon: ClipboardList,
    children: [
      { href: '/intake', label: 'Overview', exact: true },
      { href: '/intake/customize', label: 'Customize' },
      { href: '/intake/share', label: 'Share' },
      { href: '/intake/tracking', label: 'Tracking' },
      { href: '/intake/analytics', label: 'Submissions' },
    ],
  },
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
  { href: '/deals', label: 'Pipeline', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
