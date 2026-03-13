import {
  LayoutDashboard,
  Users,
  Briefcase,
  PhoneIncoming,
  Bot,
  User,
  Settings,
  SlidersHorizontal,
  BarChart2,
} from 'lucide-react';

export const primaryNavItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
] as const;

export const secondaryNavItems = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/configure', label: 'Configure', icon: SlidersHorizontal },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Primary items with shorter labels for the mobile bottom bar. */
export const mobileNavItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
] as const;
