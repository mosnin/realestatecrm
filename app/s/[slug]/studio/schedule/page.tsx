import { notFound } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { EmptyState } from '@/components/ui/empty-state';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudioSchedulePage({
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
          Schedule
        </h1>
        <p className={BODY_MUTED}>
          Plan and queue your posts across every connected account.
        </p>
      </header>
      <EmptyState
        icon={CalendarClock}
        title="Your content calendar is on the way."
        description="Scheduled posting to Instagram, Facebook, and LinkedIn is coming soon."
      />
    </div>
  );
}
