import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ALL_PLAYS, getPlay } from '@/lib/plays/definitions';
import { PlaysView, type ActiveEnrollment, type PlayCard } from '@/components/plays/plays-view';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Plays — ${slug}` };
}

type GoalRow = {
  id: string;
  contactId: string | null;
  metadata: { playKind?: string; step?: number } | null;
  nextActionAt: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
};

export default async function PlaysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Active enrollments = active AgentGoals carrying a playKind in metadata.
  const { data: goalData } = await supabase
    .from('AgentGoal')
    .select('id, contactId, metadata, nextActionAt, createdAt, Contact:contactId(id,name)')
    .eq('spaceId', space.id)
    .eq('status', 'active')
    .not('metadata->>playKind', 'is', null)
    .order('nextActionAt', { ascending: true });

  const enrollments: ActiveEnrollment[] = ((goalData ?? []) as unknown as GoalRow[])
    .map((g): ActiveEnrollment | null => {
      const playKind = g.metadata?.playKind;
      const play = playKind ? getPlay(playKind) : null;
      if (!play) return null;
      const step = typeof g.metadata?.step === 'number' ? g.metadata.step : 0;
      return {
        id: g.id,
        contactId: g.Contact?.id ?? g.contactId,
        contactName: g.Contact?.name ?? 'Unknown contact',
        playKind: play.kind,
        playName: play.name,
        step,
        totalSteps: play.steps.length,
        nextActionAt: g.nextActionAt,
      };
    })
    .filter((e): e is ActiveEnrollment => e !== null);

  const plays: PlayCard[] = ALL_PLAYS.map((p) => ({
    kind: p.kind,
    name: p.name,
    description: p.description,
    steps: p.steps.map((s) => ({ actionType: s.actionType, delayDays: s.delayDays })),
  }));

  return <PlaysView slug={slug} enrollments={enrollments} plays={plays} />;
}
