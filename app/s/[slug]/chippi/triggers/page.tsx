/**
 * /chippi/triggers — the Activity feed.
 *
 * The whole point of the triggers feature: a realtor sees everything that's
 * happened across their connected apps in one place, live, without chatting.
 * New email, RSVP changed, deal moved, payment landed — every Composio
 * trigger Chippi noticed, in chronological order, with a live overlay.
 *
 * Server component: auth + space resolution, then a single initial load of
 * (a) the space's connections — to tailor the filter chips + manage section,
 * (b) the most recent events — for first paint, and (c) each connection's
 * trigger rows — to render the per-app on/off toggles. Everything live (new
 * events, pagination) is the client component's job.
 *
 * The nav child `/chippi/triggers` (label "Activity") resolves here via the
 * sidebar's `/s/${slug}` base prefix. `/chippi/activity` is a separate legacy
 * redirect (→ /chippi/history), so this feature owns the `triggers` slug.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { listConnections } from '@/lib/integrations/connections';
import { listEvents } from '@/lib/integrations/events';
import { listTriggersForConnection } from '@/lib/integrations/triggers';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import {
  ActivityFeed,
  type ActivityConnection,
  type ActivityTrigger,
} from '@/components/triggers/activity-feed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity — Chippi' };

const INITIAL_LIMIT = 50;

export default async function ChippiTriggersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Ownership gate — mirror the other /chippi/* sub-pages: the signed-in
  // Clerk user must be this space's owner. (Realtor/space-scoped; broker
  // parity is a follow-up.)
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Connections drive the filter chips + the manage section. Drop revoked
  // rows (audit-only, never realtor-facing) — same rule as /api/integrations.
  const allConnections = await listConnections(space.id);
  const visibleConnections = allConnections.filter((c) => c.status !== 'revoked');

  // Initial events for first paint. The client takes over for live updates
  // (Ably) and "load more" (keyset pagination).
  const initialEvents = await listEvents({ spaceId: space.id, limit: INITIAL_LIMIT });

  // Per-connection trigger rows for the manage toggles. One query per
  // connection, but the connection count is tiny (a realtor connects a
  // handful of apps) so this is cheap and keeps the page server-rendered.
  const triggersByConnection = await Promise.all(
    visibleConnections.map(async (c) => ({
      connectionId: c.id,
      rows: await listTriggersForConnection(c.id),
    })),
  );

  const connections: ActivityConnection[] = visibleConnections.map((c) => ({
    id: c.id,
    toolkit: c.toolkit,
    status: c.status,
    label: c.label,
  }));

  const triggers: ActivityTrigger[] = triggersByConnection.flatMap(({ connectionId, rows }) =>
    rows.map((r) => ({
      id: r.id,
      connectionId,
      triggerSlug: r.triggerSlug,
      status: r.status,
      lastFiredAt: r.lastFiredAt,
    })),
  );

  return (
    <ChippiPageShell
      greeting="Activity."
      title="What Chippi noticed."
      subtitle="Everything across your connected apps, live."
    >
      <ActivityFeed
        spaceId={space.id}
        initialEvents={initialEvents}
        connections={connections}
        triggers={triggers}
      />
    </ChippiPageShell>
  );
}
