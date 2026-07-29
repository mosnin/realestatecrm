import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { defineTool } from '../types';
import {
  isWorkbookAttachment,
  MAX_WORKBOOK_SOURCE_BYTES,
  stringifyWorkbook,
  workbookContentHash,
  workbookFromAttachmentBytes,
} from '@/lib/chippi/workbench-store';
import { validateStoredWorkbookContent } from '@/lib/chippi/workbench-format';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';

const parameters = z.object({
  attachmentId: z.string().min(1).describe('The chat Attachment.id from this turn to open in Workbench.'),
  attachmentFilename: z.string().min(1).max(256).describe('Exact filename from this turn attachment manifest; shown in the approval.'),
});

export const openSpreadsheetInWorkbenchTool = defineTool<typeof parameters, { artifactId: string; versionNumber: number }>({
  name: 'open_spreadsheet_in_workbench',
  // The source remains immutable, but creating an Artifact + ArtifactVersion is
  // still a durable, reversible internal mutation and must not masquerade as a
  // read-only tool.
  riskLevel: 'low',
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall: ({ attachmentId, attachmentFilename }) => `Create an editable Workbench copy of ${attachmentFilename} (attachment ${attachmentId})`,
  description: 'Create an editable, versioned Workbench copy of a CSV, TSV, or XLSX chat attachment. Prompts for approval first and never changes the source file.',
  parameters,
  async handler({ attachmentId, attachmentFilename }, ctx) {
    if (!isWorkbenchEnabled()) {
      return { summary: 'Workbench is not enabled for this workspace yet.', display: 'warning' };
    }
    if (!ctx.attachmentIds?.includes(attachmentId)) {
      return { summary: 'That attachment was not provided on this turn, so Workbench cannot open it.', display: 'error' };
    }
    const { data, error } = await supabase.from('Attachment')
      .select('id, filename, "mimeType", "storagePath", "sizeBytes", "conversationId"').eq('id', attachmentId).eq('spaceId', ctx.space.id).maybeSingle();
    if (error) return { summary: `Attachment lookup failed: ${error.message}`, display: 'error' };
    if (!data?.storagePath) return { summary: 'That attachment is unavailable or is not in this workspace.', display: 'error' };
    if (data.filename !== attachmentFilename) return { summary: 'The approved attachment name does not match this turn attachment.', display: 'error' };
    if (/\.xls$/i.test(data.filename)) return { summary: 'Legacy XLS files are not supported. Convert the file to CSV or XLSX and try again.', display: 'error' };
    if (!isWorkbookAttachment({ filename: data.filename, mimeType: data.mimeType })) {
      return { summary: 'Workbench currently supports CSV, TSV, and XLSX attachments.', display: 'error' };
    }
    if (typeof data.sizeBytes === 'number' && data.sizeBytes > MAX_WORKBOOK_SOURCE_BYTES) {
      return { summary: `Workbench currently supports spreadsheets up to ${MAX_WORKBOOK_SOURCE_BYTES / 1024 / 1024} MB.`, display: 'error' };
    }
    let bytes: Buffer;
    try {
      const response = await fetch(await getSignedDownloadUrl(data.storagePath, 300), { signal: ctx.signal });
      if (!response.ok) throw new Error(`download returned ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      return { summary: 'Could not download that attachment. The source was not changed.', display: 'error' };
    }
    const parsed = await workbookFromAttachmentBytes({ attachmentId: data.id, filename: data.filename, mimeType: data.mimeType, bytes });
    if ('error' in parsed) return { summary: parsed.error, display: 'error' };
    const content = stringifyWorkbook(parsed.workbook);
    const contentValidation = validateStoredWorkbookContent(content);
    if (!contentValidation.workbook) return { summary: contentValidation.error ?? 'Workbook is too large to open safely.', display: 'error' };
    const { data: created, error: createError } = await supabase.rpc('create_workbook_artifact', {
      p_space_id: ctx.space.id, p_title: data.filename, p_content: content, p_content_hash: workbookContentHash(content), p_metadata: {
        kind: 'chippi.workbook.v1',
        sourceAttachmentId: data.id,
        sourceConversationId: data.conversationId,
        sourceFilename: data.filename,
        sourceSheetName: parsed.workbook.sheetName,
        sourceSheetCount: parsed.workbook.sourceSheetCount ?? 1,
        importedFirstSheetOnly: parsed.workbook.importedFirstSheetOnly === true,
        immutableSource: true,
      },
    });
    const createdRow = Array.isArray(created) ? created[0] : created;
    if (createError || !createdRow?.artifact_id) return { summary: 'Could not create the workbook artifact.', display: 'error' };
    const sheetSummary = parsed.workbook.importedFirstSheetOnly
      ? ` Showing the first sheet, “${parsed.workbook.sheetName}”, of ${parsed.workbook.sourceSheetCount}.`
      : ` Showing sheet “${parsed.workbook.sheetName}”.`;
    return { summary: `Opened ${data.filename} in Workbench.${sheetSummary} The source attachment remains unchanged.`, data: { artifactId: createdRow.artifact_id, versionNumber: createdRow.version_number ?? 1 }, display: 'workbench' };
  },
});
