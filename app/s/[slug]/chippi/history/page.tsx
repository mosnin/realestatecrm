import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

/**
 * /chippi/history — legacy URL. Chippi's own action log was merged into the
 * unified, filterable timeline at /chippi/activity (which now shows BOTH
 * Chippi's actions and the cross-app events it noticed). Kept as a redirect
 * for bookmark safety.
 */
export default async function ChippiHistoryRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  redirect(`/s/${slug}/chippi/activity`);
}
