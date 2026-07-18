/**
 * Behavioral tests for Track 9 (chat agent reads documents/spreadsheets):
 *   - lib/documents/tabular.ts — CSV/TSV parsing edge cases + deterministic
 *     aggregate math (sum/avg/count/min/max/group_by).
 *   - lib/ai-tools/tools/read-spreadsheet.ts — tenant-scoped File lookup +
 *     parse + optional query, run against real handlers with mocked
 *     supabase/storage/fetch (no source-grep contract tests).
 *   - lib/ai-tools/tools/summarize-document.ts — tenant-scoped File lookup +
 *     real text extraction (extractAttachmentText's plain-text branch, not
 *     mocked) + a mocked LLM call, mirroring tests/lib/cma-narrative.test.ts's
 *     mock strategy.
 *
 * Cross-tenant rejection is proven with a real filter-applying supabase
 * mock (not a canned null) — if a handler ever drops its `.eq('spaceId', …)`
 * clause, the mock's filter simulation would let the cross-space fetch
 * through and this test would fail.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseDelimitedText,
  rowsFromMatrix,
  inferSchema,
  runQuery,
  previewRows,
  toNumber,
  type ParsedTable,
} from '@/lib/documents/tabular';
import type { ToolContext } from '@/lib/ai-tools/types';

// ── lib/documents/tabular.ts — pure, no mocking needed ─────────────────────

describe('parseDelimitedText', () => {
  it('handles quoted fields containing commas', () => {
    const table = parseDelimitedText('name,age,city\n"Smith, John",30,"New York, NY"\nJane,25,Boston');
    expect(table.columns).toEqual(['name', 'age', 'city']);
    expect(table.rows).toEqual([
      ['Smith, John', '30', 'New York, NY'],
      ['Jane', '25', 'Boston'],
    ]);
    expect(table.raggedRowCount).toBe(0);
  });

  it('handles quoted fields containing embedded newlines', () => {
    const csv = 'name,note\n"Jane","Hello\nWorld"\nBob,Hi';
    const table = parseDelimitedText(csv);
    expect(table.columns).toEqual(['name', 'note']);
    expect(table.rows[0]).toEqual(['Jane', 'Hello\nWorld']);
    expect(table.rows[1]).toEqual(['Bob', 'Hi']);
  });

  it('pads short rows and truncates long rows, counting them as ragged', () => {
    const csv = 'a,b,c\n1,2,3\n4,5\n6,7,8,9';
    const table = parseDelimitedText(csv);
    expect(table.columns).toEqual(['a', 'b', 'c']);
    expect(table.rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', ''],
      ['6', '7', '8'],
    ]);
    expect(table.raggedRowCount).toBe(2);
  });

  it('auto-detects tab-separated input', () => {
    const tsv = 'name\tage\nAda\t36\nGrace\t85';
    const table = parseDelimitedText(tsv);
    expect(table.columns).toEqual(['name', 'age']);
    expect(table.rows).toEqual([
      ['Ada', '36'],
      ['Grace', '85'],
    ]);
  });

  it('generates placeholder column names for a blank header cell', () => {
    const csv = 'name,,city\nAda,36,Boston';
    const table = parseDelimitedText(csv);
    expect(table.columns).toEqual(['name', 'column_2', 'city']);
  });

  it('returns an empty table for empty input', () => {
    expect(parseDelimitedText('')).toEqual({ columns: [], rows: [], raggedRowCount: 0, rowsTruncated: false });
  });
});

describe('rowsFromMatrix', () => {
  it('normalizes a raw matrix the same way parseDelimitedText does', () => {
    const table = rowsFromMatrix([
      ['Sheet Col', 'Value'],
      ['a', '1'],
      ['b'],
    ]);
    expect(table.columns).toEqual(['Sheet Col', 'Value']);
    expect(table.rows).toEqual([
      ['a', '1'],
      ['b', ''],
    ]);
    expect(table.raggedRowCount).toBe(1);
  });
});

describe('toNumber', () => {
  it('parses currency, thousands separators, percents, and accounting negatives', () => {
    expect(toNumber('$1,234.50')).toBeCloseTo(1234.5);
    expect(toNumber('12%')).toBeCloseTo(12);
    expect(toNumber('(500)')).toBe(-500);
    expect(toNumber('  42 ')).toBe(42);
  });

  it('returns null for non-numeric or empty cells', () => {
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber('not a number')).toBeNull();
  });
});

describe('inferSchema', () => {
  it('classifies number, boolean, date, string, and empty columns', () => {
    const table: ParsedTable = {
      columns: ['price', 'active', 'closed_on', 'notes', 'blank'],
      rows: [
        ['$500,000', 'true', '2026-01-15', 'corner lot', ''],
        ['$620,000', 'false', '2026-02-01', 'needs roof', ''],
      ],
      raggedRowCount: 0,
      rowsTruncated: false,
    };
    const schema = inferSchema(table);
    expect(schema.find((c) => c.name === 'price')?.type).toBe('number');
    expect(schema.find((c) => c.name === 'active')?.type).toBe('boolean');
    expect(schema.find((c) => c.name === 'closed_on')?.type).toBe('date');
    expect(schema.find((c) => c.name === 'notes')?.type).toBe('string');
    expect(schema.find((c) => c.name === 'blank')?.type).toBe('empty');
  });
});

describe('previewRows', () => {
  it('bounds the preview to the requested limit', () => {
    const table: ParsedTable = {
      columns: ['n'],
      rows: [['1'], ['2'], ['3'], ['4']],
      raggedRowCount: 0,
      rowsTruncated: false,
    };
    expect(previewRows(table, 2)).toEqual([['1'], ['2']]);
  });
});

describe('runQuery — deterministic aggregate math (no LLM)', () => {
  const salesTable: ParsedTable = {
    columns: ['city', 'price'],
    rows: [
      ['Austin', '$400,000'],
      ['Austin', '$500,000'],
      ['Denver', '$300,000'],
      ['Denver', 'n/a'], // non-numeric — excluded from sum, still counted in group size
      ['Austin', '$600,000'],
    ],
    raggedRowCount: 0,
    rowsTruncated: false,
  };

  it('sum adds every numeric cell and reports excluded non-numeric cells honestly', () => {
    const result = runQuery(salesTable, { operation: 'sum', column: 'price' });
    expect(result.value).toBe(1_800_000);
    expect(result.sampleSize).toBe(4);
    expect(result.warning).toMatch(/1 non-numeric/);
  });

  it('avg divides by the numeric sample size, not the row count', () => {
    const result = runQuery(salesTable, { operation: 'avg', column: 'price' });
    expect(result.value).toBe(1_800_000 / 4);
  });

  it('min and max compute over numeric cells', () => {
    expect(runQuery(salesTable, { operation: 'min', column: 'price' }).value).toBe(300_000);
    expect(runQuery(salesTable, { operation: 'max', column: 'price' }).value).toBe(600_000);
  });

  it('count returns the number of non-empty cells in the column', () => {
    const result = runQuery(salesTable, { operation: 'count', column: 'price' });
    expect(result.value).toBe(5);
  });

  it('group_by sums the numeric column per distinct group value, with correct math', () => {
    const result = runQuery(salesTable, { operation: 'group_by', column: 'price', groupBy: 'city' });
    expect(result.groups).toBeDefined();
    const austin = result.groups!.find((g) => g.key === 'Austin');
    const denver = result.groups!.find((g) => g.key === 'Denver');
    expect(austin).toEqual({ key: 'Austin', value: 1_500_000, count: 3 });
    expect(denver).toEqual({ key: 'Denver', value: 300_000, count: 2 });
  });

  it('returns an honest warning for a column that does not exist', () => {
    const result = runQuery(salesTable, { operation: 'sum', column: 'nope' });
    expect(result.value).toBeUndefined();
    expect(result.warning).toMatch(/not found/);
  });

  it('returns an honest warning when a numeric column has no numeric values', () => {
    const textTable: ParsedTable = {
      columns: ['notes'],
      rows: [['hello'], ['world']],
      raggedRowCount: 0,
      rowsTruncated: false,
    };
    const result = runQuery(textTable, { operation: 'sum', column: 'notes' });
    expect(result.value).toBeUndefined();
    expect(result.warning).toMatch(/No numeric values/);
  });
});

// ── read_spreadsheet tool — tenant scoping + parsing via real handler ──────

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
let fetchOk = true;

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
  fetchOk = true;
  globalThis.fetch = vi.fn(async () => {
    if (!fetchOk) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    const bytes = fetchBytes ?? Buffer.from('');
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe('read_spreadsheet — tenant scoping + parsing', () => {
  it('rejects a fileId that belongs to another space', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_1',
        spaceId: 'space_A',
        name: 'listings.csv',
        mimeType: 'text/csv',
        storageKey: 'files/space_A/file_1-listings.csv',
      },
    ];
    fetchBytes = Buffer.from('city,price\nAustin,400000\n');

    const result = await readSpreadsheetTool.handler({ fileId: 'file_1' }, makeCtx('space_B'));

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No file with id/);
    // Proves the handler never even reached the storage layer for another
    // tenant's file.
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('parses a same-space CSV file and returns schema + preview', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_2',
        spaceId: 'space_A',
        name: 'listings.csv',
        mimeType: 'text/csv',
        storageKey: 'files/space_A/file_2-listings.csv',
      },
    ];
    fetchBytes = Buffer.from('city,price\nAustin,"$400,000"\nDenver,"$300,000"\n');

    const result = await readSpreadsheetTool.handler({ fileId: 'file_2' }, makeCtx('space_A'));

    expect(result.display).toBe('plain');
    const data = result.data as { columns: string[]; rowCount: number; schema: Array<{ name: string; type: string }> };
    expect(data.columns).toEqual(['city', 'price']);
    expect(data.rowCount).toBe(2);
    expect(data.schema.find((c) => c.name === 'price')?.type).toBe('number');
  });

  it('computes a group_by query on the same fixture and reports it in the summary', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_3',
        spaceId: 'space_A',
        name: 'sales.csv',
        mimeType: 'text/csv',
        storageKey: 'files/space_A/file_3-sales.csv',
      },
    ];
    fetchBytes = Buffer.from('city,price\nAustin,400000\nAustin,600000\nDenver,300000\n');

    const result = await readSpreadsheetTool.handler(
      { fileId: 'file_3', query: { operation: 'group_by', column: 'price', groupBy: 'city' } },
      makeCtx('space_A'),
    );

    const data = result.data as { query?: { groups?: Array<{ key: string; value: number | null; count: number }> } };
    const austin = data.query?.groups?.find((g) => g.key === 'Austin');
    expect(austin).toEqual({ key: 'Austin', value: 1_000_000, count: 2 });
    expect(result.summary).toMatch(/Grouped price by city/);
  });

  it('reports an honest error for an unsupported file format', async () => {
    const { readSpreadsheetTool } = await import('@/lib/ai-tools/tools/read-spreadsheet');
    fileStore = [
      {
        id: 'file_4',
        spaceId: 'space_A',
        name: 'photo.png',
        mimeType: 'image/png',
        storageKey: 'files/space_A/file_4-photo.png',
      },
    ];

    const result = await readSpreadsheetTool.handler({ fileId: 'file_4' }, makeCtx('space_A'));

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/isn't a spreadsheet format/);
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
  });
});

// ── summarize_document tool — tenant scoping + real extraction + mocked LLM ─

const createMock = vi.fn();
const recordChatUsageMock = vi.fn(() => Promise.resolve());

vi.mock('@/lib/usage/record-chat-usage', () => ({
  recordChatUsage: recordChatUsageMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm')>('@/lib/llm');
  return {
    ...actual,
    getLLMClient: () => ({ chat: { completions: { create: createMock } } }),
  };
});

function llmReply(content: string | null, usage?: Record<string, unknown>) {
  return {
    choices: content === null ? [] : [{ message: { content } }],
    usage: usage ?? { prompt_tokens: 200, completion_tokens: 80 },
  };
}

describe('summarize_document — tenant scoping + extraction + billing', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'or-test-key');
  });

  it('rejects a fileId that belongs to another space without calling the LLM', async () => {
    const { summarizeDocumentTool } = await import('@/lib/ai-tools/tools/summarize-document');
    fileStore = [
      {
        id: 'doc_1',
        spaceId: 'space_A',
        name: 'notes.md',
        mimeType: 'text/markdown',
        storageKey: 'files/space_A/doc_1-notes.md',
      },
    ];

    const result = await summarizeDocumentTool.handler({ fileId: 'doc_1' }, makeCtx('space_B'));

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No file with id/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('summarizes a same-space text file, using only real extracted content, and records exact usage cost', async () => {
    const { summarizeDocumentTool } = await import('@/lib/ai-tools/tools/summarize-document');
    fileStore = [
      {
        id: 'doc_2',
        spaceId: 'space_A',
        name: 'listing-notes.md',
        mimeType: 'text/markdown',
        storageKey: 'files/space_A/doc_2-listing-notes.md',
      },
    ];
    fetchBytes = Buffer.from('# 412 Elm St\n\nSeller wants to close by September. Roof replaced 2024.');
    createMock.mockResolvedValue(
      llmReply('The seller wants to close by September; the roof was replaced in 2024.', {
        prompt_tokens: 210,
        completion_tokens: 40,
        cost: 0.00021,
      }),
    );

    const result = await summarizeDocumentTool.handler({ fileId: 'doc_2' }, makeCtx('space_A'));

    expect(result.display).toBe('plain');
    expect(result.summary).toMatch(/September/);
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    // Grounding: the actual extracted document text reached the model.
    expect(callArgs.messages[1].content).toContain('Roof replaced 2024');
    expect(recordChatUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_A', costUsd: 0.00021, route: 'agent', runtime: 'ts' }),
    );
  });

  it('reports honestly when the file has no extractable text (image) instead of calling the LLM', async () => {
    const { summarizeDocumentTool } = await import('@/lib/ai-tools/tools/summarize-document');
    fileStore = [
      {
        id: 'doc_3',
        spaceId: 'space_A',
        name: 'photo.png',
        mimeType: 'image/png',
        storageKey: 'files/space_A/doc_3-photo.png',
      },
    ];
    fetchBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const result = await summarizeDocumentTool.handler({ fileId: 'doc_3' }, makeCtx('space_A'));

    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/no text to summarize/);
    expect(createMock).not.toHaveBeenCalled();
  });
});
