import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';

/**
 * /chippi/history — legacy URL. Chippi's own action log was merged into the
 * unified, filterable timeline at /chippi/activity (which now shows BOTH
 * Chippi's actions and the cross-app events it noticed). Kept as a redirect
 * for bookmark safety.
 *
 * Owner-scoped before redirecting — mirrors the other /chippi/* sub-pages so a
 * non-owner gets a 404 here rather than being bounced to the destination to be
 * gated there. (The destination re-checks too; this keeps the invariant local.)
 */
export default async function ChippiHistoryRedirect({
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

  redirect(`/s/${slug}/chippi/activity`);
}
