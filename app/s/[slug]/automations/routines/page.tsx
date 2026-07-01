import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { BODY_MUTED, H1, TITLE_FONT } from '@/lib/typography';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Routines — Chippi' };

export default async function RoutinesPage({
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

  // No wide working surface on this page — everything reads at People's
  // centered max-w-5xl column (the manager caps itself to match).
  return (
    <div className="space-y-8 pb-12">
      <header className="mx-auto w-full max-w-5xl space-y-1.5">
        <p className={BODY_MUTED}>Routines.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Routines
        </h1>
        <p className={BODY_MUTED}>On a schedule — a recurring beat.</p>
      </header>
      <RoutinesManager apiBase="/api/routines" />
    </div>
  );
}
