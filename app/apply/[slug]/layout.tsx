import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';

// Do not cache this layout's slug lookup — see the matching note on
// page.tsx's `revalidate = 0`. A stale positive here would be harmless (the
// space still exists), but a stale negative would wrongly 404 a freshly
// created slug, and Next can share/prerender a layout's data independently
// of its page.
export const revalidate = 0;

/**
 * Slug-existence gate for the whole /apply/[slug] route tree
 * (index, /privacy, /status, /chat).
 *
 * This MUST live in layout.tsx, not in page.tsx. `loading.tsx` in this same
 * segment makes Next.js wrap `page.tsx` (and every route nested under it) in
 * an implicit `<Suspense>` boundary. Once that boundary exists, Next starts
 * streaming the response — 200 status, loading.tsx's fallback markup — as
 * soon as the boundary is reached, without waiting for the async page
 * component inside it to resolve. A `notFound()` thrown from inside
 * page.tsx therefore fires too late: the 200 header and the loading shell
 * are already on the wire, so the browser sees a flash of the skeleton
 * followed by the not-found UI, but the HTTP status stays 200.
 *
 * A layout.tsx at the same segment renders OUTSIDE that Suspense boundary —
 * it's the thing that decides whether to render the boundary (and its
 * page/loading pair) at all. Blocking here on the slug lookup means an
 * unknown slug's `notFound()` runs before any bytes are sent, so the
 * response the browser gets is a real 404 with the designed not-found UI —
 * exactly the pattern already used by app/s/[slug]/layout.tsx for the same
 * reason.
 *
 * `getSpaceFromSlug` is wrapped in React `cache()`, so this lookup and each
 * page's own re-lookup (they need the full Space row to render, which a
 * layout can't hand down as props) collapse into a single Supabase query per
 * request.
 */
export default async function ApplyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return <>{children}</>;
}
