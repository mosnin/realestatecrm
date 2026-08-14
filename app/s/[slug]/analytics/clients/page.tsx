import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { fetchRawAnalyticsData, buildClientsAnalyticsData } from '@/lib/analytics-data';
import { ClientsView } from '@/components/analytics/clients-view';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';
import { Reveal } from '@/components/motion';
import { SupportingActionLink, SupportingOrientation, SupportingWorkArea } from '../../_components/supporting-page';

export default async function ClientsAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  try {
    const raw = await fetchRawAnalyticsData(space.id);
    const data = buildClientsAnalyticsData(raw);
    return (
      <Reveal variant="fade">
        <div>
          <SupportingOrientation
            family="intelligence"
            eyebrow="Analytics / Relationships"
            title="How your book is maturing"
            summary={`${data.totalContacts} people are in your book. ${data.leadToClientRate}% of leads have become clients.`}
            nextAction={data.totalLeads > 0 ? 'Review the people still between first contact and active client.' : 'Add people to establish a relationship conversion baseline.'}
            action={<SupportingActionLink href={`/s/${slug}/contacts`}>Review people</SupportingActionLink>}
          />
          <SupportingWorkArea><ClientsView data={data} /></SupportingWorkArea>
        </div>
      </Reveal>
    );
  } catch (err) {
    console.error('[analytics/clients] DB queries failed', err);
    return (
      <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3">
        <h2 className={H1} style={TITLE_FONT}>
          Something went wrong
        </h2>
        <p className={BODY_MUTED}>
          We couldn&apos;t load your data. This is usually temporary.
        </p>
        <a href={`/s/${slug}/analytics/clients`} className={PRIMARY_PILL}>
          Try again
        </a>
      </div>
    );
  }
}
