import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { KanbanBoard } from '@/components/deals/kanban-board';

export default async function DealsPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  return <KanbanBoard subdomain={subdomain} />;
}
