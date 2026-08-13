import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { LibraryPanel } from './library-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorPage, RealtorPanel } from '../../_components/realtor-page';

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
    <RealtorPage width="content" className={cn(PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Library
        </h1>
        <p className={BODY_MUTED}>
          Re-use, duplicate, schedule from past work.
        </p>
      </header>
      <RealtorPanel>
        <LibraryPanel />
      </RealtorPanel>
    </RealtorPage>
  );
}
