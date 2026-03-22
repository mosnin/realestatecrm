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
} from 'lucide-react';

export const primaryNavItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/ai', label: 'Chip', icon: Sparkles },
] as const;

export const secondaryNavItems = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/configure', label: 'Configure', icon: SlidersHorizontal },
  { href: '/billing', label: 'Billing', icon: CreditCard },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/tours', label: 'Tours', icon: CalendarDays },
  { href: '/ai', label: 'Chip', icon: Sparkles },
] as const;
