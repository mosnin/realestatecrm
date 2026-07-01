import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { WorkflowsManager } from '@/components/workflows/workflows-manager';
import { BODY_MUTED, H1, TITLE_FONT } from '@/lib/typography';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workflows — Chippi' };

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

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Header shares People's centered max-w-5xl column; the manager caps its own
  // browse chrome to match and lets the builder/canvas span the full frame.
  return (
    <div className="space-y-8 pb-12">
      <header className="mx-auto w-full max-w-5xl space-y-1.5">
        <p className={BODY_MUTED}>Workflows.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Workflows
        </h1>
        <p className={BODY_MUTED}>When something happens — react to an event.</p>
      </header>
      <Suspense fallback={null}>
        <WorkflowsManager />
      </Suspense>
    </div>
  );
}
