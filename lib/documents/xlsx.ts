/**
 * XLSX (zip-of-XML) parsing for the `read_spreadsheet` agent tool.
 *
 * Split out of `tabular.ts` so routes that only ever see CSV/TSV don't pay
 * exceljs's cold-start cost — `parseXlsxBuffer` is the only export request
 * paths call, and it lazy-imports `exceljs`.
 *
 * DECISION: `exceljs` is already a project dependency (`lib/extraction/
 * extract.ts::extractXlsx` uses it for the chat-attachment extractor), and
 * it already does the zip-unpack + `xl/worksheets/sheetN.xml` +
 * `xl/sharedStrings.xml` parsing this tool needs — a hand-rolled
 * `node:zlib`-based reader would just be a worse reimplementation of code
 * already vetted and already shipping in this codebase. So this module is a
 * thin adapter: exceljs workbook → the same `ParsedTable` shape
 * `parseDelimitedText` produces for CSV, via `rowsFromMatrix`. Multi-sheet
 * workbooks are fully supported (every non-empty sheet is returned, not
 * just the first); very large workbooks are read into memory by exceljs
 * (no streaming) — fine for typical CRM exports, not for gigabyte files.
 */

import { rowsFromMatrix, type ParsedTable } from './tabular';

/** Result of attempting to parse an XLSX workbook. */
export type XlsxParseResult =
  | { sheets: Array<{ name: string; table: ParsedTable }> }
  | { error: string };

/** Unwrap an exceljs cell value into a display string. Rich cells (formula
 *  results, hyperlinks, rich text runs) are reduced to their display text —
 *  same unwrap exceljs shape `lib/extraction/extract.ts::extractXlsx` uses. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; hyperlink?: unknown; richText?: Array<{ text?: string }> };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? '').join('');
    if (o.result !== undefined) return String(o.result ?? '');
    if (o.text !== undefined) return String(o.text ?? '');
    if (o.hyperlink !== undefined) return String(o.hyperlink ?? '');
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

/** Parse an XLSX workbook buffer into one ParsedTable per non-empty sheet.
 *  Never throws — a load failure or an environment without exceljs comes
 *  back as `{ error }` so the caller can report an honest message. exceljs
 *  itself unzips the archive and resolves `xl/sharedStrings.xml` references
 *  into their string values before cells reach `cellToString`. */
export async function parseXlsxBuffer(buffer: Buffer): Promise<XlsxParseResult> {
  let ExcelJS: typeof import('exceljs');
  try {
    ExcelJS = (await import('exceljs')).default as unknown as typeof import('exceljs');
  } catch {
    return { error: 'XLSX parsing is unavailable in this deployment — convert the file to CSV and try again.' };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (err) {
    return { error: `Could not parse the XLSX file: ${err instanceof Error ? err.message : 'unknown error'}` };
  }

  const sheets: Array<{ name: string; table: ParsedTable }> = [];
  workbook.eachSheet((sheet) => {
    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(values.map(cellToString));
    });
    if (matrix.length > 0) {
      sheets.push({ name: sheet.name, table: rowsFromMatrix(matrix) });
    }
  });
  return { sheets };
}
