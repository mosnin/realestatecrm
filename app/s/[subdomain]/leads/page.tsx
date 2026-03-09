import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  const leads = await db.contact.findMany({
    where: { spaceId: space.id, tags: { has: 'application-link' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incoming Leads</h1>
        <p className="text-muted-foreground mt-1">
          Leads submitted through your public application link.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{leads.length} lead{leads.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads yet. Share your application link to start receiving submissions.</p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {lead.phone}{lead.email ? ` • ${lead.email}` : ''}
                  </p>
                  {lead.preferences ? <p className="text-sm mt-2">Areas: {lead.preferences}</p> : null}
                  {lead.notes ? <p className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">{lead.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
