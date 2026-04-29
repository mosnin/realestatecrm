import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { MemoryFeed } from '@/components/chippi/memory-feed';

export const metadata = { title: 'What I remember — Chippi' };

export default async function ChippiMemoryPage({
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
          What I remember
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything I&apos;ve learned about you, your contacts, and your deals. Delete
          anything I got wrong — I&apos;ll re-learn it if it comes up again.
        </p>
      </header>

      <MemoryFeed slug={slug} />
    </div>
  );
}
