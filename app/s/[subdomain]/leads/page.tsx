import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { LeadsDashboard } from './leads-dashboard';

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  const initialLeads = await db.lead.findMany({
    where: { spaceId: space.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Qualified Leads</h1>
        <p className="text-muted-foreground mt-1">
          Inbound leads qualified by your AI agent in realtime.
        </p>
      </div>

      <LeadsDashboard
        subdomain={subdomain}
        initialLeads={JSON.parse(JSON.stringify(initialLeads))}
      />
    </div>
  );
}
