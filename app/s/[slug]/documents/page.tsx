/**
 * Documents page — the realtor's own documents: things they write or paste
 * in-app, as opposed to files they upload. Thin server shell; the editor and
 * list live client-side in DocumentsPanel against /api/files/documents.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { DocumentsPanel } from './documents-panel';
import {
  SupportingActionLink,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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
    <SupportingPage family="records" width="wide">
      <SupportingOrientation
        family="records"
        eyebrow="Records / Documents"
        title="Write the context that should survive the conversation"
        summary="Create durable notes, briefs, and source material that stay in your words and remain available to Chippi."
        nextAction="Capture the one decision, process, or client detail you do not want buried in a message thread."
        action={<SupportingActionLink href="#documents-workspace">Open document room</SupportingActionLink>}
        layout="rail"
      />
      <SupportingWorkArea className="grid gap-9 lg:grid-cols-[minmax(0,0.74fr)_minmax(16rem,0.26fr)] lg:items-start">
      <div id="documents-workspace" className="scroll-mt-24">
        <DocumentsPanel />
      </div>
      <aside className="border-l chippi-dashboard-divider pl-6 text-sm leading-6 text-muted-foreground lg:sticky lg:top-8">
        Documents are authored here. Uploaded PDFs, images, audio, and chat attachments stay in Files. Chippi can read both without changing your original wording.
      </aside>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
