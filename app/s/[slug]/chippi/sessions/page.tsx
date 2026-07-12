/**
 * /chippi/sessions — work-session history.
 *
 * The strip above the composer shows what's in flight right now; this page is
 * the record. Every background run newest-first: read any past report inline,
 * re-run one on today's data, and see/stop the recurring ones. Owner-gated
 * exactly like the inbox — sessions act as the space owner.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import { WorkSessionsHistory } from '@/components/chippi/work-sessions-history';

export const dynamic = 'force-dynamic';

export default async function ChippiSessionsPage({
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
      greeting="Sessions."
      title="Background work."
      subtitle="Everything Chippi has worked on while you were doing something else."
    >
      <WorkSessionsHistory slug={slug} />
    </ChippiPageShell>
  );
}
