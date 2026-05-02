import { permanentRedirect } from 'next/navigation';

// The standalone properties list is gone. Properties live inside deals — they
// reach this app via the deal-create flow and are read from the deal-detail
// page. The only standalone properties surface that earned its keep is the
// commissions roll-up (revenue view, not a property catalogue), so any visit
// to /properties is forwarded there with a 308 so external bookmarks don't
// 404. App-internal links have all been updated to point at their real
// destinations; this redirect is purely a courtesy for stale URLs.
export default async function PropertiesIndexRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/properties/commissions`);
}
