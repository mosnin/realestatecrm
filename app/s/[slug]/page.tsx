import { redirect } from 'next/navigation';

/**
 * The workspace home is Today (/chippi/brief) — the prepared day. The agent
 * opens the app to an answer, not an empty prompt: today's book, what Chippi
 * did overnight, and the few things that need a human. Chippi chat stays one
 * tap away (pinned at the top of the nav) — the conversation is the interface
 * for DOING; the brief is the interface for SEEING.
 *
 * The layout (app/s/[slug]/layout.tsx) handles auth, space ownership, and
 * the subscription gate before this page renders, so the redirect runs
 * only for legitimately-scoped requests.
 */
export default async function SpaceHomeRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/chippi/brief`);
}
