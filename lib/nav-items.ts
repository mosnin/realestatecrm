import {
  LayoutDashboard,
  Users,
  Briefcase,
  PhoneIncoming,
  Sparkles,
  User,
  Settings,
  SlidersHorizontal,
  BarChart2,
  CreditCard,
  CalendarDays,
  Calendar,
  Clock,
  FileText,
} from 'lucide-react';

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

export const secondaryNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  { href: '/follow-ups', label: 'Tasks', icon: Clock },
  { href: '/ai', label: 'Chip', icon: Sparkles },
] as const;
