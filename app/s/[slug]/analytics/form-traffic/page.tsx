import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { FormAnalytics } from '@/components/analytics/form-analytics';
import { Reveal } from '@/components/motion';
import { SupportingActionLink, SupportingOrientation, SupportingWorkArea } from '../../_components/supporting-page';

export default async function FormTrafficAnalyticsPage({
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
    <Reveal variant="fade">
      <div>
        <SupportingOrientation
          family="intelligence"
          eyebrow="Analytics / Intake traffic"
          title="Where applicants lose momentum"
          summary="See starts, completions, time by question, and the exact step where people leave."
          nextAction="Fix the highest-drop-off question, then compare completion over the next seven days."
          action={<SupportingActionLink href={`/s/${slug}/intake/customize`}>Improve the form</SupportingActionLink>}
        />
        <SupportingWorkArea><FormAnalytics slug={slug} showRecentLeads /></SupportingWorkArea>
      </div>
    </Reveal>
  );
}
