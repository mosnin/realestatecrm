import { redirect } from 'next/navigation';

/**
 * /s/[slug]/communication — legacy unified inbox URL.
 *
 * The unified Communication surface from PR #161 split into two dedicated
 * pages: /s/[slug]/email and /s/[slug]/whatsapp. This route stays as a
 * permanent redirect so old bookmarks land on the email inbox (the more
 * common entry point of the two).
 */
export default async function CommunicationRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/email`);
}
