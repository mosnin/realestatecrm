import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { CreatePanel } from './create-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorPanel } from '../../_components/realtor-page';
import { SupportingActionLink, SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

export const dynamic = 'force-dynamic';

export default async function StudioCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `prompt` + `model` come from the Library "Duplicate" affordance — the
  // realtor lands here with the form already filled so the next attempt
  // is a one-button re-render.
  searchParams: Promise<{ prompt?: string; model?: string }>;
}) {
  const { slug } = await params;
  const { prompt, model } = await searchParams;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <SupportingPage family="studio" width="wide">
      <SupportingOrientation
        family="studio"
        eyebrow="Studio / Create"
        title="Build the campaign image"
        summary="Describe the listing moment you want to show. The finished image is saved to your library for captions, edits, and scheduling."
        nextAction="Name the property, audience, atmosphere, and one visual detail that makes the listing memorable."
        action={<SupportingActionLink href="#studio-create-workspace">Start creating</SupportingActionLink>}
      />
      <SupportingWorkArea className="mx-auto max-w-5xl" >
      <div id="studio-create-workspace" className="scroll-mt-24">
      <RealtorPanel className="p-7 sm:p-10">
        <CreatePanel
          initialPrompt={typeof prompt === 'string' ? prompt : undefined}
          initialModel={typeof model === 'string' ? model : undefined}
        />
      </RealtorPanel>
      </div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
