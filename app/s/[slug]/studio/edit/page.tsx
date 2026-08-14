import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { EditPanel } from './edit-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorPanel } from '../../_components/realtor-page';
import { SupportingActionLink, SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

export const dynamic = 'force-dynamic';

export default async function StudioEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `fileId` comes from the Library "Edit" affordance — the panel hydrates
  // the source picker from this id so the realtor doesn't have to
  // re-upload an asset that already lives in their files.
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
        eyebrow="Studio / Edit"
        title="Refine the asset without starting over"
        summary="Upscale, remove distractions, or restyle an image already connected to the campaign."
        nextAction={fileId ? 'Confirm the source image and make one deliberate edit at a time.' : 'Choose an existing asset from your library before describing the change.'}
        action={<SupportingActionLink href={`/s/${slug}/studio/library`} quiet>Choose from library</SupportingActionLink>}
      />
      <SupportingWorkArea className="mx-auto max-w-5xl">
      <RealtorPanel className="p-7 sm:p-10">
        <EditPanel
          initialFileId={typeof fileId === 'string' ? fileId : undefined}
        />
      </RealtorPanel>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
