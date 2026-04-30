import { permanentRedirect } from 'next/navigation';

/**
 * Message templates folded into Integrations — preserve old bookmarks
 * with a 308 redirect to the relevant section anchor.
 */
export default async function TemplatesRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings/integrations#templates`);
}
