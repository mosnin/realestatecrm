/**
 * Documents page — the realtor's own documents: things they write or paste
 * in-app, as opposed to files they upload. Thin server shell; the editor and
 * list live client-side in DocumentsPanel against /api/files/documents.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { SplitReveal } from '@/components/motion';
import { DocumentsPanel } from './documents-panel';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div data-realtor-page="today" className="chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full max-w-4xl pb-12 pt-3 sm:pt-5">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Documents.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          <SplitReveal as="span" text="Your documents" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Write or paste documents and keep them in one place.
        </p>
      </header>
      <div className="mt-8">
        <DocumentsPanel />
      </div>
    </div>
  );
}
