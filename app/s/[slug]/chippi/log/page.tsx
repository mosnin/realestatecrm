/**
 * /s/[slug]/chippi/log — the post-tour recorder.
 *
 * The realtor finishes a tour, walks to the car, hits record, dictates a
 * 30-second debrief. Chippi transcribes, proposes 2-5 actions, the realtor
 * approves the batch in one tap. That's the moment.
 *
 * Server component: auth + space resolution. The actual recording UX
 * lives in <PostTourRecorder/>.
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { PostTourRecorder } from '@/components/chippi/post-tour-recorder';

export const metadata = { title: 'Log a tour — Chippi' };

export default async function PostTourPage({
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
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <PostTourRecorder slug={slug} />
    </div>
  );
}
