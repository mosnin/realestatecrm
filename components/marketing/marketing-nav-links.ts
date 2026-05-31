/**
 * Marketing nav — link data + descriptions.
 *
 * Single source of truth for the mega menu. The desktop hover panel and the
 * mobile full-screen drawer both consume the same arrays so a copy change in
 * one place updates both surfaces. Add a route here once, surface it twice.
 *
 * The icon + description pattern is deliberate: each leaf link carries a
 * one-line "what this is" so the panel reads like a contents page, not a
 * link dump. Lowercase verbs, period at end — same product voice.
 */

import type { LucideIcon } from 'lucide-react';
import {
  MessageCircle,
  Users,
  Briefcase,
  Calendar,
  Mail,
  Building2,
  Film,
  FolderOpen,
  LayoutDashboard,
  ArrowRightLeft,
  UserCog,
  BarChart3,
  FileText,
  MessagesSquare,
} from 'lucide-react';

export interface MarketingLeafLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface MarketingPlainLink {
  href: string;
  label: string;
}

/* ─── Surfaces (Chippi product features) ─────────────────────────────── */

export const SURFACE_LINKS: MarketingLeafLink[] = [
  {
    href: '/features/chippi',
    label: 'Chippi',
    description: 'the agent that runs the room.',
    icon: MessageCircle,
  },
  {
    href: '/features/people',
    label: 'People',
    description: 'every contact, every detail, in one place.',
    icon: Users,
  },
  {
    href: '/features/deals',
    label: 'Deals',
    description: 'pipeline that updates itself.',
    icon: Briefcase,
  },
  {
    href: '/features/calendar',
    label: 'Calendar',
    description: 'tours, showings, and follow-ups in one view.',
    icon: Calendar,
  },
  {
    href: '/features/communication',
    label: 'Communication',
    description: 'your inbox, in here.',
    icon: Mail,
  },
  {
    href: '/features/properties',
    label: 'Properties',
    description: 'listings as records, not links.',
    icon: Building2,
  },
  {
    href: '/features/studio',
    label: 'Studio',
    description: 'make the content. schedule the post.',
    icon: Film,
  },
  {
    href: '/features/files',
    label: 'Files',
    description: 'a file room for the deal.',
    icon: FolderOpen,
  },
];

/* ─── Teams ──────────────────────────────────────────────────────────── */

export const TEAM_LINKS: MarketingLeafLink[] = [
  {
    href: '/teams',
    label: 'Overview',
    description: 'why brokerages use Chippi.',
    icon: LayoutDashboard,
  },
  {
    href: '/teams/leads',
    label: 'Lead distribution',
    description: 'every lead, the right realtor.',
    icon: ArrowRightLeft,
  },
  {
    href: '/teams/members',
    label: 'Members',
    description: 'manage who belongs.',
    icon: UserCog,
  },
  {
    href: '/teams/analytics',
    label: 'Analytics',
    description: 'see what the floor is closing.',
    icon: BarChart3,
  },
  {
    href: '/teams/templates',
    label: 'Templates',
    description: 'write the reply once.',
    icon: FileText,
  },
  {
    href: '/teams/chat',
    label: 'Team chat',
    description: 'talk shop, on the same page.',
    icon: MessagesSquare,
  },
];

/* ─── "Also" — the small set that points at top-level pages ──────────── */

export const FEATURES_ALSO_LINKS: MarketingPlainLink[] = [
  { href: '/features', label: 'All features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
];

export const TEAMS_ALSO_LINKS: MarketingPlainLink[] = [
  { href: '/realtors', label: 'For realtors' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
];

/* ─── Top-level nav items ────────────────────────────────────────────── */

export type TopLevelNavItem =
  | { kind: 'link'; href: string; label: string }
  | { kind: 'panel'; key: 'features' | 'teams'; label: string };

export const TOP_LEVEL_NAV: TopLevelNavItem[] = [
  { kind: 'link', href: '/realtors', label: 'Realtors' },
  { kind: 'panel', key: 'teams', label: 'Teams' },
  { kind: 'panel', key: 'features', label: 'Features' },
  { kind: 'link', href: '/pricing', label: 'Pricing' },
  { kind: 'link', href: '/about', label: 'About' },
];
