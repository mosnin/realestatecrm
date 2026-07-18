/**
 * `read_spreadsheet` — parse an uploaded CSV/TSV/XLSX File and answer
 * simple computed questions about it (sum/avg/count/min/max/group-by on a
 * named column). Read-only.
 *
 * Tenant lookup mirrors `read_file.ts` exactly: File row fetched by
 * `id` + `spaceId` — the `.eq('spaceId', ctx.space.id)` IS the security
 * boundary (service-role client, no RLS reliance). Byte download mirrors
 * `app/api/cron/extraction-backfill/route.ts`: a short-lived signed URL
 * fetched with plain `fetch()`, not a direct storage-client call.
 *
 * All parsing/type-inference/aggregate math is deterministic code in
 * `lib/documents/tabular.ts` — no LLM ever sees or produces the numbers in
 * `query`. Honest UI: a column that doesn't exist, or has no numeric
 * values for a sum/avg/min/max, comes back with `warning` explaining why
 * instead of a fabricated number.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { defineTool } from '../types';
import {
  parseDelimitedText,
  parseXlsxBuffer,
  inferSchema,
  previewRows,
  runQuery,
  type ParsedTable,
  type ColumnSchema,
  type QueryResult,
} from '@/lib/documents/tabular';

/** Short-lived — just long enough to fetch bytes this call. */
const SIGN_TTL_SECONDS = 300;
const PREVIEW_ROW_LIMIT = 20;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const XLSX_EXT = /\.xlsx$/i;
const XLS_EXT = /\.xls$/i;
const CSV_EXT = /\.csv$/i;
const TSV_EXT = /\.tsv$/i;

const parameters = z
  .object({
    fileId: z.string().min(1).describe('The File.id of the CSV, TSV, or XLSX file to read.'),
    sheet: z
      .string()
      .min(1)
      .optional()
      .describe('Sheet name for a multi-sheet XLSX file. Defaults to the first non-empty sheet.'),
    query: z
      .object({
        operation: z
          .enum(['sum', 'avg', 'count', 'min', 'max', 'group_by'])
          .describe('Deterministic aggregate to compute — never an LLM guess.'),
        column: z.string().min(1).describe('Column name to aggregate.'),
        groupBy: z
          .string()
          .min(1)
          .optional()
          .describe('Column to group rows by. Required when operation is group_by.'),
      })
      .optional()
      .describe('Optional computed answer over one column — sum/avg/count/min/max/group_by.'),
  })
  .describe(
    'Parse a CSV/TSV/XLSX file: columns + inferred types, row count, a bounded preview, and optional deterministic math on a named column.',
  );

interface ReadSpreadsheetResult {
  fileId: string;
  name: string;
  mimeType: string;
  sheetNames?: string[];
  sheet?: string;
  columns: string[];
  schema: ColumnSchema[];
  rowCount: number;
  raggedRowCount: number;
  rowsTruncated: boolean;
  preview: string[][];
  query?: QueryResult;
}

function emptyResult(r: { id: string; name: string; mimeType: string }, extra: Partial<ReadSpreadsheetResult> = {}): ReadSpreadsheetResult {
  return {
    fileId: r.id,
    name: r.name,
    mimeType: r.mimeType,
    columns: [],
    schema: [],
    rowCount: 0,
    raggedRowCount: 0,
    rowsTruncated: false,
    preview: [],
    ...extra,
  };
}

export const readSpreadsheetTool = defineTool<typeof parameters, ReadSpreadsheetResult>({
  name: 'read_spreadsheet',
  riskLevel: 'safe',
  description:
    'Parse an uploaded CSV/TSV/XLSX file by File.id: columns + inferred types, row count, a preview, and optional deterministic sum/avg/count/min/max/group_by math on a named column. Use list_files to find the file id first.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: row, error } = await supabase
      .from('File')
      .select('id, name, mimeType, storageKey')
      .eq('id', args.fileId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (error) {
      return { summary: `File lookup failed: ${error.message}`, display: 'error' };
    }
    if (!row) {
      return { summary: `No file with id "${args.fileId}" in this workspace.`, display: 'error' };
    }
    const r = row as { id: string; name: string; mimeType: string; storageKey: string };
    const mime = (r.mimeType || '').toLowerCase();

    const isXlsx = mime === XLSX_MIME || (XLSX_EXT.test(r.name) && mime !== XLS_MIME);
    const isLegacyXls = !isXlsx && (mime === XLS_MIME || XLS_EXT.test(r.name));
    const isCsv = mime === 'text/csv' || CSV_EXT.test(r.name);
    const isTsv = mime === 'text/tab-separated-values' || TSV_EXT.test(r.name);

    if (isLegacyXls) {
      return {
        summary: `${r.name} is a legacy .xls file, which this tool can't parse. Ask for it to be re-saved as .xlsx or .csv.`,
        display: 'error',
      };
    }
    if (!isXlsx && !isCsv && !isTsv) {
      return {
        summary: `${r.name} (${r.mimeType}) isn't a spreadsheet format this tool reads. Supported: CSV, TSV, XLSX.`,
        display: 'error',
      };
    }

    let buffer: Buffer;
    try {
      const url = await getSignedDownloadUrl(r.storageKey, SIGN_TTL_SECONDS);
      const res = await fetch(url, { signal: ctx.signal });
      if (!res.ok) {
        return { summary: `Could not download ${r.name} (storage returned ${res.status}).`, display: 'error' };
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return {
        summary: `Could not download ${r.name}: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    let table: ParsedTable;
    let sheetNames: string[] | undefined;
    let sheetUsed: string | undefined;

    if (isXlsx) {
      const parsed = await parseXlsxBuffer(buffer);
      if ('error' in parsed) {
        return { summary: `${r.name}: ${parsed.error}`, display: 'error' };
      }
      if (parsed.sheets.length === 0) {
        return {
          summary: `${r.name} has no data on any sheet.`,
          data: emptyResult(r),
          display: 'plain',
        };
      }
      sheetNames = parsed.sheets.map((s) => s.name);
      const chosen = args.sheet ? parsed.sheets.find((s) => s.name === args.sheet) : parsed.sheets[0];
      if (!chosen) {
        return {
          summary: `${r.name} has no sheet named "${args.sheet}". Sheets: ${sheetNames.join(', ')}.`,
          display: 'error',
        };
      }
      table = chosen.table;
      sheetUsed = chosen.name;
    } else {
      table = parseDelimitedText(buffer.toString('utf8'));
    }

    if (table.columns.length === 0) {
      return {
        summary: `${r.name} has no rows to read.`,
        data: emptyResult(r, { sheetNames, sheet: sheetUsed }),
        display: 'plain',
      };
    }

    const schema = inferSchema(table);
    const preview = previewRows(table, PREVIEW_ROW_LIMIT);
    const queryResult = args.query ? runQuery(table, args.query) : undefined;

    const raggedNote = table.raggedRowCount > 0 ? `, ${table.raggedRowCount} ragged row(s)` : '';
    const truncNote = table.rowsTruncated ? ' (row count capped for this preview)' : '';
    let summary = `${r.name}: ${table.columns.length} columns, ${table.rows.length} rows${raggedNote}${truncNote}.`;
    if (queryResult) {
      if (queryResult.groups) {
        summary += ` Grouped ${queryResult.column} by ${queryResult.groupBy}: ${queryResult.groups.length} group(s).`;
      } else if (queryResult.value !== undefined) {
        summary += ` ${queryResult.operation}(${queryResult.column}) = ${queryResult.value}.`;
        if (queryResult.warning) summary += ` ${queryResult.warning}`;
      } else if (queryResult.warning) {
        summary += ` ${queryResult.warning}`;
      }
    }

    return {
      summary,
      data: {
        fileId: r.id,
        name: r.name,
        mimeType: r.mimeType,
        sheetNames,
        sheet: sheetUsed,
        columns: table.columns,
        schema,
        rowCount: table.rows.length,
        raggedRowCount: table.raggedRowCount,
        rowsTruncated: table.rowsTruncated,
        preview,
        query: queryResult,
      },
      display: 'plain',
    };
  },
});
