import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { BrandPanel } from './brand-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion';
import { RealtorPanel } from '../../_components/realtor-page';
import { SupportingOrientation, SupportingPage, SupportingWorkArea } from '../../_components/supporting-page';

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
    <SupportingPage family="studio" width="wide">
      <SupportingOrientation
        family="studio"
        eyebrow="Studio / Brand system"
        title="Make every campaign recognizably yours"
        summary="Set the reusable identity Studio applies to future generated work."
        nextAction="Start with your logo and primary type choice; only add color once those feel unmistakably yours."
        layout="rail"
      />
      <SupportingWorkArea className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(16rem,0.28fr)]">
      <RealtorPanel className="p-7 sm:p-10">
        <BrandPanel />
      </RealtorPanel>
      <aside className="border-l chippi-dashboard-divider pl-6 text-sm leading-6 text-muted-foreground">These choices become the default starting point for Create, Compose, and Edit. You can still adjust an individual campaign later.</aside>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
