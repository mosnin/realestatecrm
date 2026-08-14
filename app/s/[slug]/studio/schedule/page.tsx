import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { SchedulePanel } from './schedule-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion';
import { RealtorPanel } from '../../_components/realtor-page';
import { SupportingActionLink, SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

export const dynamic = 'force-dynamic';

export default async function StudioSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fileId?: string }>;
}) {
  const { slug } = await params;
  const { fileId } = await searchParams;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <SupportingPage family="studio" width="wide">
      <SupportingOrientation
        family="studio"
        eyebrow="Studio / Schedule"
        title="Put the campaign on the calendar"
        summary="Choose a saved asset, select a connected channel, and decide exactly when the post should go live."
        nextAction={fileId ? 'Confirm the selected asset, destination, and publish time.' : 'Pick the campaign asset you want to ship next.'}
        action={<SupportingActionLink href={`/s/${slug}/studio/library`} quiet>Browse library</SupportingActionLink>}
      />
      <SupportingWorkArea className="mx-auto max-w-5xl">
      <RealtorPanel className="p-7 sm:p-10">
        <SchedulePanel
          slug={slug}
          initialFileId={typeof fileId === 'string' ? fileId : null}
        />
      </RealtorPanel>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
