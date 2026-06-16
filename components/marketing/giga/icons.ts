/**
 * Feature-icon registry for the marketing redesign.
 *
 * WHY THIS EXISTS: the home / agents / brokerages pages are Server Components
 * (they `auth()` or export `metadata`), but the feature components that consume
 * their data (FeatureSection, SubPageFeatures) are Client Components. React
 * Server Components cannot pass functions, and a lucide icon is a forwardRef
 * function/object, as props across the server→client boundary. Doing so throws
 * "Functions cannot be passed directly to Client Components" at render time.
 *
 * So the pages reference icons by NAME (a plain string, which serializes fine)
 * and the client components resolve the name to the component via this map.
 * Adding an icon name to a page that isn't in this map is a typecheck error.
 */

import {
  Mic,
  Waves,
  Languages,
  Target,
  TrendingUp,
  BarChart3,
  CalendarCheck,
  Workflow,
  Bell,
  Mail,
  Phone,
  Inbox,
  MessagesSquare,
  KanbanSquare,
  ArrowRightLeft,
  Users,
  ShieldCheck,
  Home,
  LayoutGrid,
  Building2,
} from 'lucide-react';

export const FEATURE_ICONS = {
  Mic,
  Waves,
  Languages,
  Target,
  TrendingUp,
  BarChart3,
  CalendarCheck,
  Workflow,
  Bell,
  Mail,
  Phone,
  Inbox,
  MessagesSquare,
  KanbanSquare,
  ArrowRightLeft,
  Users,
  ShieldCheck,
  Home,
  LayoutGrid,
  Building2,
} as const;

export type FeatureIconName = keyof typeof FEATURE_ICONS;
