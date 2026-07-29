import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { parseStoredWorkbook, stringifyWorkbook, validateStoredWorkbookContent } from '@/lib/chippi/workbench-format';
import { workbookContentHash } from '@/lib/chippi/workbench-store';
import { assertValidWorkbookTransformOperations, inspectWorkbook, MAX_WORKBOOK_TRANSFORM_OPERATIONS, transformWorkbook, workbookInspectionModelContext, workbookTransformReceiptOperations, type WorkbookTransformOperation } from '@/lib/chippi/workbook-transform';

// Approval text names every affected target. These bounds make that complete
// disclosure finite rather than silently abbreviating a broad operation.
const identifier = z.string().min(1).max(64);
const workbookTitle = z.string().min(1).max(200);
const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('trim_whitespace'), columns: z.array(identifier).min(1).max(4) }),
  z.object({ type: z.literal('rename_column'), from: identifier, to: identifier }),
  z.object({ type: z.literal('normalize_email'), column: identifier }),
  z.object({ type: z.literal('normalize_phone'), column: identifier }),
  z.object({ type: z.literal('deduplicate_rows'), columns: z.array(identifier).min(1).max(4) }),
  z.object({ type: z.literal('add_constant_column'), column: identifier, value: z.string().max(64) }),
]);

const inspectParameters = z.object({ artifactId: identifier, versionNumber: z.number().int().positive() });
const applyParameters = z.object({
  artifactId: identifier,
  workbookTitle,
  sourceVersionId: identifier,
  sourceVersionNumber: z.number().int().positive(),
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(operationSchema).min(1).max(MAX_WORKBOOK_TRANSFORM_OPERATIONS),
});

type VersionRow = { id: string; versionNumber: number; content: string; contentHash: string | null };

function describeOperation(operation: WorkbookTransformOperation): string {
  switch (operation.type) {
    case 'trim_whitespace': return `trim whitespace in ${operation.columns.join(', ')}`;
    case 'rename_column': return `rename ${operation.from} to ${operation.to}`;
    case 'normalize_email': return `normalize email in ${operation.column}`;
    case 'normalize_phone': return `normalize phone in ${operation.column}`;
    case 'deduplicate_rows': return `deduplicate by ${operation.columns.join(' + ')}`;
    case 'add_constant_column': return `add ${operation.column} = “${operation.value}”`;
  }
}

async function loadWorkbookVersion(input: { artifactId: string; versionNumber: number }, spaceId: string): Promise<{ version: VersionRow; title: string } | { error: string }> {
  const { data: artifact, error: artifactError } = await supabase.from('Artifact')
    .select('id, title, artifactType').eq('id', input.artifactId).eq('spaceId', spaceId).maybeSingle();
  if (artifactError) return { error: 'Could not look up that workbook.' };
  if (!artifact || artifact.artifactType !== 'workbook') return { error: 'That workbook is unavailable in this workspace.' };
  const { data: version, error: versionError } = await supabase.from('ArtifactVersion')
    .select('id, versionNumber, content, contentHash').eq('artifactId', input.artifactId).eq('spaceId', spaceId).eq('versionNumber', input.versionNumber).maybeSingle();
  if (versionError) return { error: 'Could not read that workbook version.' };
  if (!version) return { error: 'That workbook version is unavailable in this workspace.' };
  return { version: version as VersionRow, title: artifact.title };
}

export const inspectWorkbookTool = defineTool<typeof inspectParameters, { artifactId: string; versionId: string; versionNumber: number; contentHash: string; inspection: ReturnType<typeof inspectWorkbook> }>({
  name: 'inspect_workbook',
  riskLevel: 'safe',
  requiresApproval: false,
  description: 'Inspect an exact, versioned Workbench workbook and return bounded columns, sample rows, and completeness statistics. Use this before proposing a transformation.',
  parameters: inspectParameters,
  async handler({ artifactId, versionNumber }, ctx) {
    if (!isWorkbenchEnabled()) return { summary: 'Workbench is not enabled for this workspace yet.', display: 'warning' };
    if (!ctx.activeWorkbook || ctx.activeWorkbook.artifactId !== artifactId || ctx.activeWorkbook.versionNumber !== versionNumber) {
      return { summary: 'Open the workbook you want to transform, then inspect that current version again.', display: 'warning' };
    }
    const loaded = await loadWorkbookVersion({ artifactId, versionNumber }, ctx.space.id);
    if ('error' in loaded) return { summary: loaded.error, display: 'error' };
    if (loaded.title !== ctx.activeWorkbook.title) return { summary: 'That workbook changed. Reopen it in Workbench before transforming it.', display: 'warning' };
    const workbook = parseStoredWorkbook(loaded.version.content);
    if (!workbook) return { summary: 'This workbook version has invalid content and cannot be transformed.', display: 'error' };
    const contentHash = loaded.version.contentHash ?? workbookContentHash(loaded.version.content);
    const inspection = inspectWorkbook(workbook);
    const data = { artifactId, versionId: loaded.version.id, versionNumber: loaded.version.versionNumber, contentHash, inspection };
    return { summary: `${loaded.title}, version ${loaded.version.versionNumber}: ${inspection.rowCount} rows and ${inspection.totalColumnCount} columns.`, modelContext: workbookInspectionModelContext(data), data, display: 'plain' };
  },
});

export const applyWorkbookTransformationTool = defineTool<typeof applyParameters, { artifactId: string; versionNumber: number; receipt: { changedCells: number; removedRows: number; addedColumns: string[] } }>({
  name: 'apply_workbook_transformation',
  riskLevel: 'low',
  requiresApproval: true,
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall: ({ workbookTitle: approvedWorkbookTitle, sourceVersionNumber, operations }) => {
    try { assertValidWorkbookTransformOperations(operations); } catch { return 'The requested workbook transformation is invalid and will not run.'; }
    const descriptions = (operations as WorkbookTransformOperation[]).map(describeOperation);
    return `Create a new version of “${approvedWorkbookTitle}” from version ${sourceVersionNumber}: ${descriptions.join('; ')}. The source stays unchanged.`;
  },
  description: 'Apply a closed set of deterministic cleanup operations to the exact inspected Workbench version. Always asks for approval and creates an immutable new version; never overwrites data.',
  parameters: applyParameters,
  async handler({ artifactId, workbookTitle: approvedWorkbookTitle, sourceVersionId, sourceVersionNumber, expectedContentHash, operations }, ctx) {
    if (!isWorkbenchEnabled()) return { summary: 'Workbench is not enabled for this workspace yet.', display: 'warning' };
    if (!ctx.activeWorkbook
      || ctx.activeWorkbook.artifactId !== artifactId
      || ctx.activeWorkbook.versionNumber !== sourceVersionNumber
      || ctx.activeWorkbook.title !== approvedWorkbookTitle) {
      return { summary: 'Open and inspect the workbook you want to transform again before approving changes.', display: 'warning' };
    }
    const loaded = await loadWorkbookVersion({ artifactId, versionNumber: sourceVersionNumber }, ctx.space.id);
    if ('error' in loaded) return { summary: loaded.error, display: 'error' };
    if (loaded.title !== approvedWorkbookTitle) return { summary: 'That workbook changed. Reopen and inspect it before approving changes.', display: 'warning' };
    if (loaded.version.id !== sourceVersionId) return { summary: 'That workbook version changed before approval. Inspect the current version and try again.', display: 'warning' };
    const currentHash = loaded.version.contentHash ?? workbookContentHash(loaded.version.content);
    if (currentHash !== expectedContentHash) return { summary: 'That workbook content changed before approval. Inspect the current version and try again.', display: 'warning' };
    const workbook = parseStoredWorkbook(loaded.version.content);
    if (!workbook) return { summary: 'This workbook version has invalid content and cannot be transformed.', display: 'error' };
    let transformed: ReturnType<typeof transformWorkbook>;
    try { transformed = transformWorkbook(workbook, operations as WorkbookTransformOperation[]); } catch (error) { return { summary: error instanceof Error ? error.message : 'The requested transformation is invalid.', display: 'error' }; }
    if (transformed.changedCells === 0 && transformed.removedRows === 0 && transformed.addedColumns.length === 0) {
      return { summary: 'Those transformations would not change this workbook, so no version was created.', display: 'warning' };
    }
    const content = stringifyWorkbook(transformed.workbook);
    const validated = validateStoredWorkbookContent(content);
    if (!validated.workbook) return { summary: validated.error ?? 'The transformed workbook exceeds Workbench limits.', display: 'error' };
    const receipt = { kind: 'chippi.workbook.transform.v1' as const, sourceVersionId, sourceVersionNumber, sourceContentHash: expectedContentHash, operations: workbookTransformReceiptOperations(operations as WorkbookTransformOperation[]), changedCells: transformed.changedCells, removedRows: transformed.removedRows, addedColumns: transformed.addedColumns, savedAt: new Date().toISOString() };
    const { data, error } = await supabase.rpc('append_transformed_workbook_artifact_version', {
      p_artifact_id: artifactId, p_space_id: ctx.space.id, p_source_version_id: sourceVersionId, p_source_version_number: sourceVersionNumber,
      p_expected_content_hash: expectedContentHash, p_content: content, p_content_hash: workbookContentHash(content), p_metadata: receipt,
    });
    const appended = Array.isArray(data) ? data[0] : data;
    if (error || !appended?.version_id) {
      // The transaction repeats the current-version + content-hash check to
      // close the read/approval/write race. Treat a mismatch as stale, never
      // as a partial save.
      return { summary: 'The workbook changed while this approval was pending. No transformation was saved; inspect the latest version and try again.', display: 'warning' };
    }
    return { summary: `Created version ${appended.version_number}: ${transformed.changedCells} cell changes${transformed.removedRows ? ` and ${transformed.removedRows} duplicate rows removed` : ''}.`, data: { artifactId, versionNumber: appended.version_number, receipt: { changedCells: transformed.changedCells, removedRows: transformed.removedRows, addedColumns: transformed.addedColumns } }, display: 'workbench' };
  },
});
