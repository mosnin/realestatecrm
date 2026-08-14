import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { ComposePanel } from './compose-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorPanel } from '../../_components/realtor-page';
import { SupportingActionLink, SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

export const dynamic = 'force-dynamic';

export default async function StudioComposePage({
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
        eyebrow="Studio / Compose"
        title="Give the image a point of view"
        summary="Upload the strongest listing image and turn its real details into a social-ready caption."
        nextAction="Choose one audience and one outcome before you write; specificity beats a generic listing recap."
        action={<SupportingActionLink href="#studio-compose-workspace">Compose a caption</SupportingActionLink>}
      />
      <SupportingWorkArea className="mx-auto max-w-5xl">
      <div id="studio-compose-workspace" className="scroll-mt-24">
      <RealtorPanel className="p-7 sm:p-10">
        <ComposePanel />
      </RealtorPanel>
      </div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
