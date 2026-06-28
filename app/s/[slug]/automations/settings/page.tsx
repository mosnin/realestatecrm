import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { SECTION_LABEL, CAPTION } from '@/lib/typography';
import { Button } from '@/components/ui/button';
import { Plug, ArrowRight } from 'lucide-react';

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
    >
      <div className="space-y-8 max-w-2xl">
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className={SECTION_LABEL}>Connected apps</h2>
            <p className={CAPTION}>
              These are the apps Chippi can trigger automations from and take actions in.
            </p>
          </div>

          {activeConnections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center space-y-3">
              <Plug size={20} className="mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No apps connected yet.</p>
              <p className={CAPTION}>
                Connect Gmail, Slack, your CRM, and more to unlock event-based automations.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={`/s/${slug}/chippi/integrations`}>
                  Connect an app
                  <ArrowRight size={13} className="ml-1" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3"
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
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                </div>
              ))}
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
      </div>
    </ChippiPageShell>
  );
}
