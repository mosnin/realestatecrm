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

export const realtorNavItems: NavItem[] = [
  {
    href: '',
    label: 'Home',
    icon: Home,
    exact: true,
  },
  {
    href: '/leads',
    label: 'Leads',
    icon: PhoneIncoming,
    badgeKey: 'leads',
    children: [
      { href: '/leads', label: 'All Leads', exact: true },
      { href: '/leads?sort=newest', label: 'Most Recent' },
      { href: '/leads?type=rental', label: 'Rental Leads' },
      { href: '/leads?type=buyer', label: 'Buyer Leads' },
      { href: '/leads?tier=hot', label: 'Hot Leads' },
    ],
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: Users,
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
    href: '/intake',
    label: 'Intake Form',
    icon: ClipboardList,
    children: [
      { href: '/intake', label: 'Overview', exact: true },
      { href: '/intake/customize', label: 'Customize' },
      { href: '/settings/appearance', label: 'Appearance' },
      { href: '/settings/content', label: 'Content' },
      { href: '/intake/tracking', label: 'Tracking' },
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
      { href: '/analytics/form-traffic', label: 'Form Traffic' },
    ],
  },
  {
    href: '/notes',
    label: 'Notes',
    icon: FileText,
  },
  {
    href: '/ai',
    label: 'AI Assistant',
    icon: Sparkles,
    isAI: true,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    children: [
      { href: '/settings', label: 'Account', exact: true },
      { href: '/billing', label: 'Billing' },
      { href: '/settings/notifications', label: 'Notifications' },
      { href: '/settings/integrations', label: 'API & MCP' },
      { href: '/settings/legal', label: 'Legal' },
    ],
  },
];

// ── Legacy exports for backward compatibility ────────────────────────────────

export const primaryNavItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/follow-ups', label: 'Follow-ups', icon: Clock },
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/notes', label: 'Notes', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/ai', label: 'Chip', icon: Sparkles },
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
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
] as const;
