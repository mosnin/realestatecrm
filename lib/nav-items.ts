import {
  LayoutDashboard,
  Users,
  Briefcase,
  PhoneIncoming,
  Sparkles,
  Settings,
  BarChart2,
  BarChart3,
  CalendarDays,
  Calendar,
  Clock,
  FileText,
  TrendingUp,
  UserCheck,
  MapPin,
  GitBranch,
  FormInput,
  ClipboardList,
  Pencil,
  Share2,
  Home,
  Bell,
  Puzzle,
  Palette,
  Shield,
  Flame,
  Bot,
  Flag,
  Inbox,
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
// Organized around jobs-to-be-done, not feature modules:
//   Today       → what needs my attention right now
//   People      → everyone in my pipeline (new leads → active → past clients)
//   Deals       → active deal board
//   Tours       → showings
//   Calendar    → schedule overview
//   Notes       → my notes
//   Intake form → lead capture form + customization + analytics
//   Analytics   → performance overview + sub-reports
//   Assistant   → AI chat + drafts + automation activity
//   Settings    → account configuration

export const realtorNavItems: NavItem[] = [
  {
    href: '',
    label: 'Today',
    icon: Home,
    exact: true,
  },
  {
    href: '/agent',
    label: 'Inbox',
    icon: Inbox,
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
    href: '/tours',
    label: 'Tours',
    icon: CalendarDays,
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: Calendar,
  },
  {
    href: '/notes',
    label: 'Notes',
    icon: FileText,
  },
  {
    href: '/reviews',
    label: 'My reviews',
    icon: Flag,
  },
  {
    href: '/intake',
    label: 'Intake form',
    icon: ClipboardList,
    children: [
      { href: '/intake', label: 'Overview', exact: true },
      { href: '/intake/customize', label: 'Customize' },
      { href: '/settings/appearance', label: 'Appearance' },
      { href: '/settings/content', label: 'Content' },
      { href: '/intake/tracking', label: 'Tracking' },
      { href: '/intake/analytics', label: 'Form analytics' },
      { href: '/intake/share', label: 'Share' },
    ],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart2,
    children: [
      { href: '/analytics', label: 'Overview', exact: true },
      { href: '/analytics/leads', label: 'Leads' },
      { href: '/analytics/clients', label: 'Clients' },
      { href: '/analytics/tours', label: 'Tours' },
      { href: '/analytics/pipeline', label: 'Pipeline' },
      { href: '/analytics/form-traffic', label: 'Form traffic' },
    ],
  },
  {
    href: '/ai',
    label: 'Assistant',
    icon: Sparkles,
    isAI: true,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    children: [
      { href: '/settings', label: 'Account', exact: true },
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/notifications', label: 'Notifications' },
      { href: '/settings/templates', label: 'Message templates' },
      { href: '/settings/integrations', label: 'Integrations' },
      { href: '/billing', label: 'Billing' },
      { href: '/settings/legal', label: 'Legal' },
    ],
  },
];

// ── Legacy exports for backward compatibility ────────────────────────────────

export const primaryNavItems = [
  { href: '', label: 'Today', icon: LayoutDashboard },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/notes', label: 'Notes', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/ai', label: 'Assistant', icon: Sparkles },
] as const;

export const intakeSubItems = [
  { href: '/intake', label: 'Overview', icon: ClipboardList, exact: true },
  { href: '/intake/customize', label: 'Customize', icon: Pencil },
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
  { href: '/settings/content', label: 'Content', icon: FileText },
  { href: '/intake/tracking', label: 'Tracking', icon: BarChart3 },
  { href: '/intake/analytics', label: 'Form Analytics', icon: FormInput },
  { href: '/intake/share', label: 'Share', icon: Share2 },
] as const;

export const analyticsSubItems = [
  { href: '/analytics', label: 'Overview', icon: BarChart2, exact: true },
  { href: '/analytics/leads', label: 'Leads', icon: TrendingUp },
  { href: '/analytics/clients', label: 'Clients', icon: UserCheck },
  { href: '/analytics/tours', label: 'Tours', icon: MapPin },
  { href: '/analytics/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/analytics/form-traffic', label: 'Form Traffic', icon: FormInput },
] as const;

export const secondaryNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '', label: 'Today', icon: LayoutDashboard },
  { href: '/contacts', label: 'People', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'Assistant', icon: Sparkles },
] as const;
