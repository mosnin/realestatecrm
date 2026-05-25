import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ActivityFeed } from '@/components/chippi/activity-feed';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';

export const metadata = { title: 'Activity — Chippi' };

export default async function ChippiActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify ownership before rendering
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <ChippiPageShell
      greeting="Activity."
      title="What Chippi did"
      subtitle="Every action Chippi has taken — with reasoning. Undo anything reversible."
    >
      <ActivityFeed slug={slug} />
    </ChippiPageShell>
  );
}
