import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { BrandPanel } from './brand-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion';
import { RealtorPage, RealtorPanel } from '../../_components/realtor-page';

export const dynamic = 'force-dynamic';

export default async function StudioBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <RealtorPage width="reading" className={cn(PAGE_RHYTHM)}>
      <Reveal variant="fade" as="header" className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Brand
        </h1>
        <p className={BODY_MUTED}>
          Logo, colors, fonts — applied to every generation.
        </p>
      </Reveal>
      <RealtorPanel>
        <BrandPanel />
      </RealtorPanel>
    </RealtorPage>
  );
}
