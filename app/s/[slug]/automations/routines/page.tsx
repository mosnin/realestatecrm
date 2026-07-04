import { redirect } from 'next/navigation';

/**
 * /automations/routines → the unified Automations hub.
 *
 * Routines is a SECTION of the single Automations hub, not its own page — the
 * hub already renders the same RoutinesManager. This route used to render it a
 * second time; it now redirects to the hub's `#routines` section anchor, and
 * the sidebar links there directly.
 */
export default async function RoutinesRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/automations#routines`);
}
