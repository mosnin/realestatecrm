import { notFound } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { EmptyState } from '@/components/ui/empty-state';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudioCreatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className={cn('mx-auto max-w-5xl px-6 py-8', PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Create
        </h1>
        <p className={BODY_MUTED}>
          Generate images and video for your brand and your listings.
        </p>
      </header>
      <EmptyState
        icon={ImagePlus}
        title="Generation is on its way."
        description="Image and video tools land here in the next update."
      />
    </div>
  );
}
