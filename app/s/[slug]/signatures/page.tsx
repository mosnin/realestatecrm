import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { SignaturesView } from './signatures-view';

export const metadata = { title: 'Signatures — Chippi' };

export default async function SignaturesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return <SignaturesView slug={slug} />;
}
