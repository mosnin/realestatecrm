import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ActivityFeed } from '@/components/chippi/activity-feed';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_RHYTHM } from '@/lib/typography';

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
    <div className="h-full overflow-y-auto">
      <div className={`w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24 ${SECTION_RHYTHM}`}>
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>Activity.</p>
          <h1 className={H1} style={TITLE_FONT}>
            What Chippi did
          </h1>
          <p className={BODY_MUTED}>
            Every action Chippi has taken — with reasoning. Undo anything reversible.
          </p>
        </header>

        <ActivityFeed slug={slug} />
      </div>
    </div>
  );
}
