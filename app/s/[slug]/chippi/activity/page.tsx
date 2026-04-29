import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ActivityFeed } from '@/components/chippi/activity-feed';

export const metadata = { title: 'What I did — Chippi' };

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
    <div className="max-w-3xl mx-auto space-y-8 py-2">
      <header className="space-y-1.5">
        <Link
          href={`/s/${slug}/chippi`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} />
          Back to Chippi
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          What I did
        </h1>
        <p className="text-sm text-muted-foreground">
          Every action Chippi has taken — with reasoning. Undo anything reversible.
        </p>
      </header>

      <ActivityFeed slug={slug} />
    </div>
  );
}
