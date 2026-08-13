import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import { PluginsSkillsManager } from '@/components/chippi/plugins-skills-manager';
import { DASHBOARD_SURFACE } from '@/components/ui/surface-card';
import { SECTION_LABEL } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plugins — Chippi' };

/**
 * /chippi/integrations — connect/disconnect the third-party apps Chippi acts
 * through (Gmail, Slack, Calendar, CRM, …). This is the MANAGEMENT surface
 * (the connect buttons + health), distinct from /chippi/triggers, which is
 * the live ACTIVITY feed of what those connections fired. Previously the nav
 * conflated the two — "Integrations" pointed at the activity feed. This page
 * gives integrations their own home.
 *
 * Mirrors the realtor Settings → Connections mount: `ConnectedAppsSection`
 * with just `slug` resolves to the realtor `/api/integrations` endpoints.
 */
export default async function ChippiIntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    integration?: string;
    reason?: string;
    toolkit?: string;
  }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Ownership gate — mirror the other /chippi/* sub-pages.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  const sp = await searchParams;
  const callbackResult =
    sp.integration === 'connected' || sp.integration === 'failed'
      ? {
          ok: sp.integration === 'connected',
          reason: sp.reason ?? null,
          toolkit: sp.toolkit ?? null,
        }
      : null;

  return (
    <ChippiPageShell
      greeting="Plugins."
      title="The tools I act through."
      subtitle="Connect apps, add your own plugins, and save skills. I use them to complete the actions you request."
      layout="dashboard"
    >
      <div className="mx-auto w-full max-w-6xl space-y-5" data-chippi-secondary-page="integrations">
        <section className={cn(DASHBOARD_SURFACE, 'p-6 sm:p-8')}>
          <div className="mb-7 space-y-1.5">
            <p className={SECTION_LABEL}>Connected apps</p>
            <p className="text-sm text-muted-foreground">
              Choose the services Chippi can use when you ask it to act.
            </p>
          </div>
          <ConnectedAppsSection slug={slug} callbackResult={callbackResult} />
        </section>

        <section className={cn(DASHBOARD_SURFACE, 'p-6 sm:p-8')}>
          <PluginsSkillsManager slug={slug} />
        </section>
      </div>
    </ChippiPageShell>
  );
}
