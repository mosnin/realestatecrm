import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { SECTION_LABEL, CAPTION } from '@/lib/typography';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { RealtorEmptyState, RealtorPanel, RealtorRowList } from '../../_components/realtor-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automation Settings — Chippi' };

export default async function AutomationSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Fetch active integrations so we can show what's powering automations.
  const { data: connections } = await supabase
    .from('IntegrationConnection')
    .select('id, toolkit, label, status, lastUsedAt')
    .eq('spaceId', space.id)
    .eq('status', 'active')
    .order('createdAt', { ascending: false });

  const activeConnections = connections ?? [];

  return (
    <ChippiPageShell
      greeting="Configuration."
      title="Automation settings"
      subtitle="Control what apps your automations can act on."
      layout="dashboard"
    >
      <RealtorPanel className="max-w-2xl space-y-8" as="div">
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className={SECTION_LABEL}>Connected apps</h2>
            <p className={CAPTION}>
              These are the apps Chippi can trigger automations from and take actions in.
            </p>
          </div>

          {activeConnections.length === 0 ? (
            <RealtorEmptyState
              className="chippi-dashboard-panel-muted py-10 shadow-none"
              title="No apps connected yet."
              description="Connect Gmail, Slack, your CRM, and more to unlock event-based automations."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href={`/s/${slug}/chippi/integrations`}>
                    Connect an app
                    <ArrowRight size={13} className="ml-1" />
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              <RealtorRowList className="bg-transparent px-0 shadow-none">
              {activeConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between gap-4 px-1 py-3.5"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium capitalize">
                      {conn.label ?? conn.toolkit}
                    </p>
                    {conn.lastUsedAt && (
                      <p className={CAPTION}>
                        Last used{' '}
                        {new Date(conn.lastUsedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Connected
                  </span>
                </div>
              ))}
              </RealtorRowList>
              <div className="pt-1">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/s/${slug}/chippi/integrations`}>
                    Manage integrations
                    <ArrowRight size={13} className="ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </section>
      </RealtorPanel>
    </ChippiPageShell>
  );
}
