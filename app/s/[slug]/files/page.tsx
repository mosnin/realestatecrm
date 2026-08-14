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
import { SplitReveal } from '@/components/motion';
import { FilesPanel } from './files-panel';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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
  const newestFileAt = fileAggregateRows?.[0]?.createdAt
    ? new Date(fileAggregateRows[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const storageLabel = totalBytes < 1024 * 1024
    ? `${Math.round(totalBytes / 1024)} KB`
    : `${(totalBytes / (1024 * 1024)).toFixed(totalBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;

  return (
    <SupportingPage family="records" width="wide">
      <SupportingOrientation
        family="records"
        eyebrow="Records / Files"
        title={<SplitReveal as="span" text="Everything the work depends on" />}
        summary={statusSentence}
        nextAction={count === 0 ? 'Upload the first document or image Chippi should be able to use.' : 'Open the record tied to your nearest deal deadline and confirm it is current.'}
        action={<SupportingActionLink href="#file-library">Upload or browse</SupportingActionLink>}
      />
      <SupportingMetricBand>
        <SupportingMetric label="Saved files" value={fileCount ?? 0} detail="uploaded directly" />
        <SupportingMetric label="Conversation files" value={attachmentCount ?? 0} detail="from Chippi threads" />
        <SupportingMetric label="Storage used" value={storageLabel} detail="across this workspace" accent />
        <SupportingMetric label="Newest record" value={newestFileAt} detail="latest direct upload" />
      </SupportingMetricBand>
      <SupportingWorkArea>
      <div id="file-library" className="scroll-mt-24">
      <FilesPanel />
      </div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
