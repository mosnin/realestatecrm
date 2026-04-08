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
