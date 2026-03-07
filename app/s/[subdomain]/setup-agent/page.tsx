import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { AgentSetupForm } from './agent-setup-form';
import { AgentStatusCard } from './agent-status-card';

export default async function SetupAgentPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  const existingAgent = await db.retellAgent.findUnique({
    where: { spaceId: space.id },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          AI Lead Qualification Agent
        </h1>
        <p className="text-muted-foreground mt-1">
          Set up your personal AI agent to qualify inbound leads via phone and
          SMS automatically.
        </p>
      </div>

      {existingAgent ? (
        <AgentStatusCard agent={existingAgent} subdomain={subdomain} />
      ) : (
        <AgentSetupForm />
      )}
    </div>
  );
}
