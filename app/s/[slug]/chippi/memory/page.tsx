import { redirect } from 'next/navigation';

/**
 * "What Chippi remembers" now lives as a section in Settings (id=memory).
 * Keep this route as a permanent redirect so existing deep links still
 * land in the right place.
 */
export default async function ChippiMemoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/settings#memory`);
}
