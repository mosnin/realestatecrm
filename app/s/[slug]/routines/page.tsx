import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /routines → /automations. Workflows and Routines were unified into one
 * "Automations" hub (the realtor holds one concept, not two). This redirect
 * keeps old bookmarks and the activity feed's #routine-<id> deep-links working
 * — the browser re-applies the fragment to the redirect target, and the hub
 * renders the same routine rows (so the anchor still resolves there).
 */
export default async function RoutinesRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/automations`);
}
