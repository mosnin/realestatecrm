import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { SECTION_LABEL, CAPTION } from '@/lib/typography';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automation Configuration — Chippi' };

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

  return (
    <ChippiPageShell
      greeting="Configuration."
      title="Configuration"
      subtitle="Webhooks, triggers, and automation settings."
    >
      <div className="space-y-8 max-w-2xl">
        <section className="space-y-3">
          <h2 className={SECTION_LABEL}>Composio webhook endpoint</h2>
          <p className={CAPTION}>
            Paste this URL into Composio as the webhook destination for trigger-based automations.
            Chippi listens here for incoming events and routes them to the matching workflow.
          </p>
          <code className="block text-sm font-mono bg-muted/30 rounded px-3 py-2 text-foreground">
            /api/workflows/trigger
          </code>
        </section>

        <section className="space-y-3">
          <h2 className={SECTION_LABEL}>Cron endpoints</h2>
          <p className={CAPTION}>
            These endpoints are called by the cron scheduler to run scheduled automations.
            Register them with your scheduler (e.g. Vercel Cron, GitHub Actions) to keep
            routines running on time.
          </p>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={CAPTION}>Workflow runs</p>
              <code className="block text-sm font-mono bg-muted/30 rounded px-3 py-2 text-foreground">
                /api/cron/workflows
              </code>
            </div>
            <div className="space-y-1">
              <p className={CAPTION}>Scheduled messages</p>
              <code className="block text-sm font-mono bg-muted/30 rounded px-3 py-2 text-foreground">
                /api/cron/scheduled-messages
              </code>
            </div>
          </div>
        </section>
      </div>
    </ChippiPageShell>
  );
}
