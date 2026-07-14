/**
 * Files page — generic upload surface for documents, images, PDFs, videos,
 * and audio. Falls back to a graceful empty state when nothing's been
 * uploaded yet. All actual uploading + listing happens client-side via
 * /api/files so the page can be a thin server shell.
 *
 * Header follows STYLESHEET.md § "The status-sentence pattern":
 *   muted greeting line (with period) → serif h1 → one-sentence status.
 * The status sentence is computed from both File uploads and chat
 * attachments, matching the union rendered by FilesPanel.
 */

import { notFound } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { formatFilesStatus } from '@/lib/realtor-page-status';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { FilesPanel } from './files-panel';

export const dynamic = 'force-dynamic';

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Status-sentence data. We pull size + createdAt for the most recent few
  // rows + a head-count so the sentence stays honest without dragging the
  // full file list server-side (the client panel already does that).
  const [
    { count: fileCount },
    { data: fileAggregateRows },
    { count: attachmentCount, data: attachmentAggregateRows },
  ] = await Promise.all([
    supabase
      .from('File')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id),
    supabase
      .from('File')
      .select('sizeBytes, createdAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(500),
    supabase
      .from('Attachment')
      .select('sizeBytes', { count: 'exact' })
      .eq('spaceId', space.id)
      .limit(500),
  ]);

  const totalBytes = [
    ...(fileAggregateRows ?? []),
    ...(attachmentAggregateRows ?? []),
  ].reduce(
    (sum, row) => sum + (row.sizeBytes ?? 0),
    0,
  );
  const count = (fileCount ?? 0) + (attachmentCount ?? 0);

  const statusSentence = formatFilesStatus(count, totalBytes);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Files.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          All files
        </h1>
        <p className={cn(BODY_MUTED)}>{statusSentence}</p>
      </header>
      <FilesPanel />
    </div>
  );
}
