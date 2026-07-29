import { describe, expect, it } from 'vitest';
import { inspectWorkbook, MAX_WORKBOOK_INSPECTION_CELL_CHARS, MAX_WORKBOOK_INSPECTION_COLUMNS, MAX_WORKBOOK_INSPECTION_MODEL_CONTEXT_BYTES, MAX_WORKBOOK_INSPECTION_ROWS, MAX_WORKBOOK_INSPECTION_SAMPLE_COLUMNS, parseWorkbookTransformReceipt, transformWorkbook, workbookInspectionModelContext, workbookTransformReceiptOperations } from '@/lib/chippi/workbook-transform';

const source = {
  kind: 'chippi.workbook.v1' as const,
  sourceAttachmentId: 'attachment-1', sourceFilename: 'buyers.csv', sheetName: 'Sheet1',
  columns: ['Email', 'Phone', 'Name'],
  rows: [
    [' ADA@EXAMPLE.COM ', '(212) 555-0123 ', ' Ada '],
    ['ada@example.com', '2125550123', 'Ada'],
  ],
};

describe('deterministic workbook transformations', () => {
  it('inspects a bounded schema and sample without mutating the source', () => {
    const inspection = inspectWorkbook(source);
    expect(inspection.rowCount).toBe(2);
    expect(inspection.columns[0]).toEqual({ name: 'Email', nonEmpty: 2, empty: 0 });
    expect(inspection.sampleRows).toEqual(source.rows);
  });

  it('keeps pathological cells and wide/tall sheets out of the model context', () => {
    const inspection = inspectWorkbook({
      ...source,
      columns: Array.from({ length: 50 }, (_, index) => `Column ${index}`),
      rows: Array.from({ length: 500 }, () => Array.from({ length: 50 }, () => 'x'.repeat(32_000))),
    });
    expect(inspection.totalColumnCount).toBe(50);
    expect(inspection.columns).toHaveLength(MAX_WORKBOOK_INSPECTION_COLUMNS);
    expect(inspection.sampleRows).toHaveLength(MAX_WORKBOOK_INSPECTION_ROWS);
    expect(inspection.sampleRows[0]).toHaveLength(MAX_WORKBOOK_INSPECTION_SAMPLE_COLUMNS);
    expect(inspection.sampleRows[0][0]).toHaveLength(MAX_WORKBOOK_INSPECTION_CELL_CHARS);
    expect(inspection).toMatchObject({ columnsTruncated: true, sampleColumnsTruncated: true, sampleRowsTruncated: true, sampleCellsTruncated: true });
    const modelContext = workbookInspectionModelContext({ artifactId: 'artifact-1', versionId: 'version-1', versionNumber: 1, contentHash: 'a'.repeat(64), inspection });
    expect(new TextEncoder().encode(modelContext).byteLength).toBeLessThanOrEqual(MAX_WORKBOOK_INSPECTION_MODEL_CONTEXT_BYTES);
    expect(modelContext).toContain('UNTRUSTED_DATA');
  });

  it('normalizes, deduplicates, and appends a tag without mutating the source', () => {
    const result = transformWorkbook(source, [
      { type: 'trim_whitespace', columns: ['Email', 'Phone', 'Name'] },
      { type: 'normalize_email', column: 'Email' },
      { type: 'normalize_phone', column: 'Phone' },
      { type: 'deduplicate_rows', columns: ['Email', 'Phone'] },
      { type: 'add_constant_column', column: 'Import tag', value: 'July' },
    ]);
    expect(result.workbook.columns).toEqual(['Email', 'Phone', 'Name', 'Import tag']);
    expect(result.workbook.rows).toEqual([['ada@example.com', '+12125550123', 'Ada', 'July']]);
    expect(result.removedRows).toBe(1);
    expect(result.changedCells).toBeGreaterThan(0);
    expect(source.rows).toEqual([
      [' ADA@EXAMPLE.COM ', '(212) 555-0123 ', ' Ada '],
      ['ada@example.com', '2125550123', 'Ada'],
    ]);
  });

  it('supports rename and phone normalization as explicit deterministic operations', () => {
    const result = transformWorkbook(source, [
      { type: 'rename_column', from: 'Name', to: 'Buyer name' },
      { type: 'normalize_phone', column: 'Phone' },
    ]);
    expect(result.workbook.columns).toEqual(['Email', 'Phone', 'Buyer name']);
    expect(result.workbook.rows.map((row) => row[1])).toEqual(['+12125550123', '+12125550123']);
  });

  it('rejects ambiguous columns and never fabricates a no-op version', () => {
    expect(() => transformWorkbook({ ...source, columns: ['Email', 'Email', 'Phone'] }, [{ type: 'normalize_email', column: 'Email' }])).toThrow(/ambiguous/i);
    const result = transformWorkbook(source, [{ type: 'normalize_email', column: 'Email' }]);
    expect(result.changedCells).toBe(1);
  });

  it('rejects unknown/duplicate targets and adding a 51st column before mutation', () => {
    expect(() => transformWorkbook(source, [{ type: 'normalize_phone', column: 'Missing' }])).toThrow(/does not exist/i);
    expect(() => transformWorkbook(source, [{ type: 'add_constant_column', column: 'Email', value: 'x' }])).toThrow(/already exists/i);
    expect(() => transformWorkbook({ ...source, columns: Array.from({ length: 50 }, (_, index) => `C${index}`), rows: [Array.from({ length: 50 }, () => 'x')] }, [{ type: 'add_constant_column', column: 'Overflow', value: 'x' }])).toThrow(/50-column/i);
  });

  it('enforces disclosure bounds at execution even if a schema bridge relaxes zod limits', () => {
    expect(() => transformWorkbook(source, [{ type: 'deduplicate_rows', columns: ['Email', 'Phone', 'Name', 'One', 'Too many'] }])).toThrow(/one to four/i);
    expect(() => transformWorkbook(source, [{ type: 'add_constant_column', column: 'Tag', value: 'x'.repeat(65) }])).toThrow(/64 characters/i);
  });

  it('persists only a bounded, redacted receipt and rejects malformed metadata', () => {
    const operations = workbookTransformReceiptOperations([{ type: 'add_constant_column', column: 'Import tag', value: 'sensitive long value' }]);
    const parsed = parseWorkbookTransformReceipt({
      kind: 'chippi.workbook.transform.v1', sourceVersionId: 'version-1', sourceVersionNumber: 1,
      sourceContentHash: 'a'.repeat(64), operations, changedCells: 2, removedRows: 0, addedColumns: ['Import tag'], savedAt: '2026-07-29T12:00:00.000Z',
    });
    expect(parsed?.operations[0]).toMatchObject({ type: 'add_constant_column', column: 'Import tag', valueLength: 20 });
    expect(parsed?.operations[0]).not.toHaveProperty('value');
    expect(parseWorkbookTransformReceipt({ ...parsed, sourceContentHash: 'UPPERCASE' })).toBeNull();
    expect(parseWorkbookTransformReceipt({ ...parsed, savedAt: 'not-a-date' })).toBeNull();
    expect(parseWorkbookTransformReceipt({ ...parsed, operations: [{ type: 'normalize_email', column: 'Email', injected: true }] })).toBeNull();
    expect(parseWorkbookTransformReceipt({ ...parsed, operations: [{ type: 'add_constant_column', column: 'Tag', valuePreview: 'x'.repeat(65), valueHash: 'b'.repeat(64), valueLength: 65 }] })).toBeNull();
    expect(parseWorkbookTransformReceipt({ ...parsed, padding: 'x'.repeat(5000) })).toBeNull();
  });
});
