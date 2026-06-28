import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { WorkflowsManager } from '@/components/workflows/workflows-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workflows — Chippi' };

/**
 * /workflows — the realtor's standing automations: a When → If → Then composer
 * that turns an event into a draft. Read/write through /api/workflows; the
 * engine fires the live triggers. A test-run proves a workflow works (watch the
 * draft get created) before it goes live, and autonomy stays 'draft' by default
 * so nothing goes out without the realtor's tap.
 */
export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Ownership gate — mirror the other /chippi/* sub-pages: the signed-in
  // Clerk user must own this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Workflows."
      title="Automations that run themselves."
      subtitle="Pick a trigger, set the conditions, and let me draft the next step. Test one to watch the draft appear — then turn it on."
    >
      <WorkflowsManager />
    </ChippiPageShell>
  );
}
