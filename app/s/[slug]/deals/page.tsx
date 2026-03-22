import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { KanbanBoard } from '@/components/deals/kanban-board';

export default async function DealsPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let space;
  try {
    space = await getSpaceFromSlug(slug);
  } catch (err) {
    console.error('[deals] DB queries failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/deals`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }
  if (!space) notFound();

  return <KanbanBoard slug={slug} />;
}
