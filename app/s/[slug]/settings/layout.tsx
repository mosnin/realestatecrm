import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { SettingsTabs } from './settings-tabs';

type Tab = { href: string; label: string; matchPath: string };

const BASE_TABS: Tab[] = [
  { href: '/settings', label: 'General', matchPath: '/settings' },
  { href: '/settings/profile', label: 'Profile', matchPath: '/settings/profile' },
  { href: '/settings/notifications', label: 'Notifications', matchPath: '/settings/notifications' },
  { href: '/settings/integrations', label: 'Integrations', matchPath: '/settings/integrations' },
  { href: '/settings/templates', label: 'Templates', matchPath: '/settings/templates' },
  { href: '/settings/legal', label: 'Legal', matchPath: '/settings/legal' },
];

const BROKERAGE_TAB: Tab = {
  href: '/settings/brokerage',
  label: 'Brokerage',
  matchPath: '/settings/brokerage',
};

/**
 * Settings layout — server-side computes which tabs are visible (Brokerage
 * is conditional on membership), client-side `<SettingsTabs>` renders the
 * underline strip and resolves the active tab from `usePathname()`.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Brokerage tab visibility — show if the user has a pending invite or an
  // active brokerage row. Failures fall back to hiding the tab; the page
  // itself still works via direct URL.
  let showBrokerage = false;
  try {
    const { userId } = await auth();
    if (userId) {
      const { data: user } = await supabase
        .from('User')
        .select('email, brokerageId')
        .eq('clerkId', userId)
        .maybeSingle();
      const email = user?.email?.toLowerCase() ?? null;
      if (user?.brokerageId) {
        showBrokerage = true;
      } else if (email) {
        const { data: inv } = await supabase
          .from('Invitation')
          .select('id')
          .ilike('email', email)
          .eq('status', 'pending')
          .limit(1);
        showBrokerage = (inv?.length ?? 0) > 0;
      }
    }
  } catch {
    showBrokerage = false;
  }

  const tabs: Tab[] = showBrokerage ? [...BASE_TABS, BROKERAGE_TAB] : BASE_TABS;

  return (
    <div className="space-y-8">
      <h1
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        Settings
      </h1>

      <SettingsTabs slug={slug} tabs={tabs} />

      <div>{children}</div>
    </div>
  );
}
