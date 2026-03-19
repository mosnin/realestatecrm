import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getBrokerContext } from '@/lib/permissions';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { DashboardFooter } from '@/components/dashboard/footer';
import { supabase } from '@/lib/supabase';

export const metadata = { title: 'Broker Dashboard — Chippi' };

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const ctx = await getBrokerContext();

  // Not a broker — redirect to the setup page
  if (!ctx) {
    redirect('/setup');
  }

  // Look up their realtor workspace for the unified sidebar
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name, emoji')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  if (!spaceRow) {
    redirect('/setup');
  }

  const slug = spaceRow.slug as string;

  let unreadLeadCount = 0;
  try {
    const { count, error: countError } = await supabase
      .from('Contact')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', spaceRow.id)
      .contains('tags', ['new-lead']);
    if (countError) throw countError;
    unreadLeadCount = count ?? 0;
  } catch {
    unreadLeadCount = 0;
  }

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        slug={slug}
        spaceName={spaceRow.name as string}
        spaceEmoji={(spaceRow.emoji as string) || '\u{1F3E0}'}
        unreadLeadCount={unreadLeadCount}
        isBroker={true}
        brokerageName={ctx.brokerage.name}
        brokerageRole={ctx.membership.role}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header slug={slug} spaceName={spaceRow.name as string} title={spaceRow.name as string} isBroker={true} brokerageName={ctx.brokerage.name} />
        <main className="flex-1 overflow-y-auto flex flex-col px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7">
          {children}
          <DashboardFooter />
        </main>
      </div>
      <MobileNav slug={slug} isBroker={true} />
    </div>
  );
}
