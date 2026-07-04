import { redirect } from 'next/navigation';

/**
 * /automations/workflows → the unified Automations hub.
 *
 * Workflows is a SECTION of the single Automations hub, not its own page — the
 * hub already renders the same WorkflowsManager. This route used to render it a
 * second time, so the hub and this page looked identical. It now redirects to
 * the hub (preserving `?new=1` so "New workflow" still opens the builder), and
 * the sidebar links to the `#workflows` section anchor instead.
 */
export default async function WorkflowsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug } = await params;
  const { new: isNew } = await searchParams;
  redirect(`/s/${slug}/automations${isNew === '1' ? '?new=1' : '#workflows'}`);
}
