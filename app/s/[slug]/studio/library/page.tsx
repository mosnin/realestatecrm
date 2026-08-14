import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { LibraryPanel } from './library-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { SupportingActionLink, SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

export const dynamic = 'force-dynamic';

export default async function StudioLibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <SupportingPage family="studio" width="wide">
      <SupportingOrientation
        family="studio"
        eyebrow="Studio / Library"
        title="Your reusable campaign archive"
        summary="Every generated image and video stays ready to duplicate, edit, or schedule again."
        nextAction="Reuse the strongest existing asset before generating another version from scratch."
        action={<SupportingActionLink href={`/s/${slug}/studio/create`}>Create new asset</SupportingActionLink>}
      />
      <SupportingWorkArea>
        <LibraryPanel />
      </SupportingWorkArea>
    </SupportingPage>
  );
}
