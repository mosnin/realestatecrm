import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { LeadsDashboard } from '@/components/leads/LeadsDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Qualified Leads — Real Estate CRM'
};

export default async function LeadsPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Qualified Leads</h2>
        <p className="text-muted-foreground">
          AI-qualified leads from your Retell agent — updates every 5 seconds.
        </p>
      </div>
      <LeadsDashboard subdomain={subdomain} />
    </div>
  );
}
