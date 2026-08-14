import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { FormAnalytics } from '@/components/analytics/form-analytics';
import type { Metadata } from 'next';
import {
  SupportingActionLink,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

export const metadata: Metadata = {
  title: 'Form Analytics',
};

export default async function FormAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <SupportingPage family="intelligence" width="wide">
      <SupportingOrientation
        family="intelligence"
        eyebrow="Acquisition / Form intelligence"
        title="Turn more visits into conversations"
        summary="Measure the full intake journey without losing sight of the people behind the funnel."
        nextAction="Find the question with the steepest drop-off, simplify it, and watch the next seven days."
        action={<SupportingActionLink href={`/s/${slug}/intake/customize`}>Edit intake</SupportingActionLink>}
      />
      <SupportingWorkArea>
        <FormAnalytics slug={slug} showRecentLeads />
      </SupportingWorkArea>
    </SupportingPage>
  );
}
