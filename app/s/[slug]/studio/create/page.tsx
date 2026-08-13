import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { CreatePanel } from './create-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorPage, RealtorPanel } from '../../_components/realtor-page';

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
    <RealtorPage width="content" className={cn(PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Create
        </h1>
        <p className={BODY_MUTED}>AI-generate listing images.</p>
      </header>
      <RealtorPanel>
        <CreatePanel
          initialPrompt={typeof prompt === 'string' ? prompt : undefined}
          initialModel={typeof model === 'string' ? model : undefined}
        />
      </RealtorPanel>
    </RealtorPage>
  );
}
