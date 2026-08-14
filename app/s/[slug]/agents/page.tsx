import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';
import { AgentsGrid } from '@/components/agents/agents-grid';
import type { CustomAgent } from '@/lib/swarm-types';
import {
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  const { data, error } = await supabase
    .from('CustomAgent')
    .select('*')
    .eq('spaceId', space.id)
    .eq('isActive', true)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('[agents/page] query error:', error);
  }

  const agents = (data ?? []) as CustomAgent[];
  const newestAgent = agents[0]?.name ?? '—';
  const capabilityCount = agents.reduce((total, agent) => total + agent.capabilities.length, 0);
  const modelCount = new Set(agents.map((agent) => agent.model).filter(Boolean)).size;

  return (
    <SupportingPage family="coordination" width="wide">
      <SupportingOrientation
        family="coordination"
        eyebrow="Workforce / Specialists"
        title="Build a team around repeatable outcomes"
        summary={`${agents.length} active ${agents.length === 1 ? 'specialist is' : 'specialists are'} available for coordinated work.`}
        nextAction={agents.length === 0 ? 'Create one specialist with a narrow responsibility and a clear definition of done.' : 'Review the newest specialist and make sure its tools match the work you expect it to own.'}
        action={
        <Link
          href={`/s/${slug}/agents/new`}
          className={cn(PRIMARY_PILL, 'shrink-0')}
        >
          <Plus className="size-4" />
          New specialist
        </Link>
        }
      />
      <SupportingMetricBand>
        <SupportingMetric label="Active specialists" value={agents.length} detail="available to coordinate" accent />
        <SupportingMetric label="Newest" value={newestAgent} detail="most recently created" />
        <SupportingMetric label="Capabilities" value={capabilityCount} detail="assigned across active specialists" />
        <SupportingMetric label="Models" value={modelCount} detail="used by active specialists" />
      </SupportingMetricBand>

      {/* Grid or empty state */}
      <SupportingWorkArea>
      <AgentsGrid
        initialAgents={agents}
        slug={slug}
        spaceId={space.id}
      />
      </SupportingWorkArea>
    </SupportingPage>
  );
}
