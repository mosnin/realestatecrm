import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { CmaView } from './cma-view';

export const metadata = { title: 'CMA — Chippi' };

export default async function CmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `address` comes from a property page's "Run a CMA" handoff — the subject
  // arrives pre-filled so the report is one click away.
  searchParams: Promise<{ address?: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { address } = await searchParams;
  return (
    <CmaView
      slug={slug}
      initialAddress={typeof address === 'string' && address.trim() ? address.trim().slice(0, 200) : undefined}
    />
  );
}
