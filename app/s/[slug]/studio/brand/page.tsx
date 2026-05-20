import { notFound } from 'next/navigation';
import { Palette } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { EmptyState } from '@/components/ui/empty-state';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';

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
    <div className={cn('mx-auto max-w-3xl px-6 py-8', PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Brand
        </h1>
        <p className={BODY_MUTED}>
          The look Studio uses for everything it makes.
        </p>
      </header>
      <EmptyState
        icon={Palette}
        title="Your brand kit is on the way."
        description="Logo, colors, fonts, and voice — the kit every generation uses — coming soon."
      />
    </div>
  );
}
