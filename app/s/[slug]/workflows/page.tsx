import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /workflows → /automations. Workflows and Routines were unified into one
 * "Automations" hub (the realtor holds one concept, not two). This redirect
 * keeps old bookmarks and the activity feed's #workflow-<id> deep-links working
 * — the browser re-applies the fragment to the redirect target, and the hub
 * renders the same workflow rows (so the anchor still resolves there).
 */
export default async function WorkflowsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/automations`);
}
