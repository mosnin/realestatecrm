import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ApplicationsDashboard } from './applications-dashboard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  return {
    title: `Applications — ${space?.name ?? subdomain}`,
  };
}

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) redirect('/');

  const applications = await db.rentalApplication.findMany({
    where: { spaceId: space.id },
    include: {
      applicants: {
        where: { isPrimary: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Rental applications submitted through your intake link.
        </p>
      </div>

      <ApplicationsDashboard
        applications={JSON.parse(JSON.stringify(applications))}
        subdomain={subdomain}
      />
    </div>
  );
}
