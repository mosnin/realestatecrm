import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { AgentSettingsPanel } from '@/components/agent/agent-settings-panel';

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

  return (
    <ChippiPageShell
      greeting="Automation settings"
      title="Sending policies"
      subtitle="See what runs on its own and what needs your review."
      layout="dashboard"
    >
      <AgentSettingsPanel slug={slug} />
    </ChippiPageShell>
  );
}
