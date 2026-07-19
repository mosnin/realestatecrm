/**
 * Behavioral tests for Track 17 (XLSX support for `read_spreadsheet`):
 *   - lib/documents/xlsx.ts — parseXlsxBuffer against *real* XLSX bytes
 *     (zip + XML + sharedStrings.xml), built in-test with exceljs's own
 *     writer so the fixture is a genuine workbook, not a hand-typed stub.
 *   - lib/ai-tools/tools/read-spreadsheet.ts — the .xlsx branch of the
 *     tenant-scoped handler, run the same way tests/lib/agent-docs-tools
 *     .test.ts exercises the .csv branch: a real handler call against a
 *     filter-applying supabase mock, so a dropped `.eq('spaceId', …)`
 *     would actually let a cross-space fetch through and fail this test.
 *
 * No readFileSync-source-grep here — every assertion is on parsed output
 * of real bytes, not on the shape of the implementation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { parseXlsxBuffer } from '@/lib/documents/xlsx';
import { inferSchema, toNumber } from '@/lib/documents/tabular';
import type { ToolContext } from '@/lib/ai-tools/types';

// ── fixture helper ──────────────────────────────────────────────────────

/** Build a real XLSX buffer via exceljs's writer — round-trips through an
 *  actual zip archive with xl/worksheets/*.xml and (for repeated string
 *  cells) xl/sharedStrings.xml, exactly like a file a user would upload. */
async function buildWorkbookBuffer(
  sheets: Array<{ name: string; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

// ── lib/documents/xlsx.ts — real bytes, no mocking ──────────────────────

describe('parseXlsxBuffer', () => {
  it('parses a header + data rows into the same ParsedTable shape parseDelimitedText produces', async () => {
    const buffer = await buildWorkbookBuffer([
      {
        name: 'Listings',
        rows: [
          ['city', 'price'],
          ['Austin', 400000],
          ['Denver', 300000],
        ],
      },
    ]);

    const result = await parseXlsxBuffer(buffer);
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('Listings');
    const table = result.sheets[0].table;
    expect(table.columns).toEqual(['city', 'price']);
    expect(table.rows).toEqual([
      ['Austin', '400000'],
      ['Denver', '300000'],
    ]);
    expect(table.raggedRowCount).toBe(0);
    expect(table.rowsTruncated).toBe(false);
  });

  it('resolves repeated string cells through a real xl/sharedStrings.xml round trip', async () => {
    // "Austin" and "active" each appear 3+ times — exceljs's writer will
    // dedupe them into xl/sharedStrings.xml rather than inlining every
    // occurrence, so this genuinely exercises shared-string resolution on
    // read, not just literal inline strings.
    const buffer = await buildWorkbookBuffer([
      {
        name: 'Sheet1',
        rows: [
          ['city', 'status'],
          ['Austin', 'active'],
          ['Austin', 'active'],
          ['Austin', 'pending'],
          ['Denver', 'active'],
        ],
      },
    ]);

    const result = await parseXlsxBuffer(buffer);
    if ('error' in result) throw new Error(result.error);
    const table = result.sheets[0].table;
    expect(table.rows).toEqual([
      ['Austin', 'active'],
      ['Austin', 'active'],
      ['Austin', 'pending'],
      ['Denver', 'active'],
    ]);
    // Every "Austin" cell independently resolved to the same shared string.
    expect(table.rows.filter((r) => r[0] === 'Austin')).toHaveLength(3);
  });

  it('converts typed cells (number, boolean, date, cached formula result) to display strings that feed schema inference correctly', async () => {
    const buffer = await buildWorkbookBuffer([
      {
        name: 'Sheet1',
        rows: [['price', 'active', 'listed', 'total']],
      },
    ]);
    // Add a row with a real formula cell (cached result) alongside typed
    // literal cells, mirroring what Excel actually writes for a computed
    // column.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['price', 'active', 'listed', 'total']);
    sheet.addRow([400000, true, new Date('2024-01-15T00:00:00Z')]);
    sheet.getCell('D2').value = { formula: 'SUM(1,2)', result: 3 } as unknown as ExcelJS.CellValue;
    const formulaBuffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);

    const result = await parseXlsxBuffer(formulaBuffer);
    if ('error' in result) throw new Error(result.error);
    const table = result.sheets[0].table;
    expect(table.rows[0][0]).toBe('400000');
    expect(table.rows[0][1]).toBe('true');
    expect(table.rows[0][2]).toBe('2024-01-15T00:00:00.000Z');
    expect(table.rows[0][3]).toBe('3'); // cached formula result, not the formula text

    const schema = inferSchema(table);
    expect(schema.find((c) => c.name === 'price')?.type).toBe('number');
    expect(toNumber(table.rows[0][0])).toBe(400000);
    expect(schema.find((c) => c.name === 'total')?.type).toBe('number');
  });

  it('returns every non-empty sheet in workbook order and drops sheets with no rows', async () => {
    const buffer = await buildWorkbookBuffer([
      { name: 'Listings', rows: [['city'], ['Austin']] },
      { name: 'Blank', rows: [] },
      { name: 'Notes', rows: [['note'], ['follow up']] },
    ]);

    const result = await parseXlsxBuffer(buffer);
    if ('error' in result) throw new Error(result.error);
    expect(result.sheets.map((s) => s.name)).toEqual(['Listings', 'Notes']);
  });

  it('reports an honest error for a corrupt buffer instead of throwing', async () => {
    const result = await parseXlsxBuffer(Buffer.from('not a zip file at all'));
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/Could not parse the XLSX file/);
    }
  });
});

// ── read_spreadsheet tool — .xlsx branch, tenant scoping via real handler ──

interface FileRow {
  id: string;
  spaceId: string;
  name: string;
  mimeType: string;
  storageKey: string;
}

let fileStore: FileRow[] = [];

vi.mock('@/lib/supabase', () => {
  function makeChain() {
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        const row = fileStore.find((r) =>
          filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
        );
        return { data: row ?? null, error: null };
      }),
    };
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

const getSignedDownloadUrlMock = vi.fn(async (key: string, _ttl?: number) => `https://signed.example/${key}`);
vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: (key: string, ttl?: number) => getSignedDownloadUrlMock(key, ttl),
}));

let fetchBytes: Buffer | null = null;

function makeCtx(spaceId: string): ToolContext {
  return {
    userId: `user_${spaceId}`,
    space: { id: spaceId, slug: spaceId, name: spaceId, ownerId: `owner_${spaceId}` },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStore = [];
  fetchBytes = null;
  globalThis.fetch = vi.fn(async () => {
    const bytes = fetchBytes ?? Buffer.from('');
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe('read_spreadsheet — .xlsx branch, tenant scoping + parsing', () => {
  it('rejects a cross-space fileId for an XLSX file before ever downloading it', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_x1',
        spaceId: 'space_A',
        name: 'listings.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey: 'files/space_A/file_x1-listings.xlsx',
      },
    ];
    fetchBytes = await buildWorkbookBuffer([{ name: 'Sheet1', rows: [['city'], ['Austin']] }]);

    const result = await readSpreadsheetTool.handler({ fileId: 'file_x1' }, makeCtx('space_B'));

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No file with id/);
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('parses a same-space XLSX file (detected by extension), returning columns/schema/preview', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_x2',
        spaceId: 'space_A',
        name: 'listings.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey: 'files/space_A/file_x2-listings.xlsx',
      },
    ];
    fetchBytes = await buildWorkbookBuffer([
      {
        name: 'Listings',
        rows: [
          ['city', 'price'],
          ['Austin', 400000],
          ['Denver', 300000],
        ],
      },
    ]);

    const result = await readSpreadsheetTool.handler({ fileId: 'file_x2' }, makeCtx('space_A'));

    expect(result.display).toBe('plain');
    const data = result.data as {
      columns: string[];
      rowCount: number;
      sheetNames?: string[];
      sheet?: string;
      schema: Array<{ name: string; type: string }>;
      preview: string[][];
    };
    expect(data.columns).toEqual(['city', 'price']);
    expect(data.rowCount).toBe(2);
    expect(data.sheetNames).toEqual(['Listings']);
    expect(data.sheet).toBe('Listings');
    expect(data.schema.find((c) => c.name === 'price')?.type).toBe('number');
    expect(data.preview).toEqual([
      ['Austin', '400000'],
      ['Denver', '300000'],
    ]);
  });

  it('selects a non-default sheet by name and computes a query over it', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_x3',
        spaceId: 'space_A',
        name: 'workbook.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey: 'files/space_A/file_x3-workbook.xlsx',
      },
    ];
    fetchBytes = await buildWorkbookBuffer([
      { name: 'Summary', rows: [['note'], ['see Sales tab']] },
      {
        name: 'Sales',
        rows: [
          ['city', 'price'],
          ['Austin', 400000],
          ['Austin', 600000],
          ['Denver', 300000],
        ],
      },
    ]);

    const result = await readSpreadsheetTool.handler(
      { fileId: 'file_x3', sheet: 'Sales', query: { operation: 'group_by', column: 'price', groupBy: 'city' } },
      makeCtx('space_A'),
    );

    expect(result.display).toBe('plain');
    const data = result.data as {
      sheet?: string;
      sheetNames?: string[];
      query?: { groups?: Array<{ key: string; value: number | null; count: number }> };
    };
    expect(data.sheet).toBe('Sales');
    expect(data.sheetNames).toEqual(['Summary', 'Sales']);
    const austin = data.query?.groups?.find((g) => g.key === 'Austin');
    expect(austin).toEqual({ key: 'Austin', value: 1_000_000, count: 2 });
    expect(result.summary).toMatch(/Grouped price by city/);
  });

  it('reports an honest error when the requested sheet name does not exist', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_x4',
        spaceId: 'space_A',
        name: 'workbook.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey: 'files/space_A/file_x4-workbook.xlsx',
      },
    ];
    fetchBytes = await buildWorkbookBuffer([{ name: 'Sales', rows: [['city'], ['Austin']] }]);

    const result = await readSpreadsheetTool.handler(
      { fileId: 'file_x4', sheet: 'DoesNotExist' },
      makeCtx('space_A'),
    );

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/no sheet named "DoesNotExist"/);
  });
});
