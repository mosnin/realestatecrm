import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { KanbanBoard } from '@/components/deals/kanban-board';

export default async function DealsPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return <KanbanBoard slug={slug} />;
}
