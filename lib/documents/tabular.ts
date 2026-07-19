/**
 * Tabular data parsing + deterministic aggregate math for the
 * `read_spreadsheet` tool.
 *
 * CSV/TSV parsing reuses `papaparse` (already a project dependency —
 * `lib/extraction/extract.ts` uses the same library for the chat-attachment
 * extractor) rather than hand-rolling a quote/newline-aware parser; it is
 * well-tested against exactly the edge cases this module is asked to
 * handle (quoted commas, embedded newlines, ragged rows) and auto-detects
 * the delimiter, so both CSV and TSV go through one code path.
 *
 * XLSX parsing lives in `./xlsx.ts` (kept out of this file so routes that
 * never touch an XLSX file don't pay exceljs's cold-start cost) — it
 * normalizes into the same `ParsedTable` shape via `rowsFromMatrix` below,
 * so schema inference, previews, and aggregate math don't know or care
 * which format a table came from.
 *
 * Everything below the parse step — schema inference, previews, and
 * sum/avg/count/min/max/group-by — is plain deterministic code. No LLM is
 * involved in producing a numeric answer; the summary strings this module
 * hands back are built only from numbers actually computed here.
 */

import Papa from 'papaparse';

/** Rows returned to a caller are capped here — a spreadsheet with 500k rows
 *  still parses (aggregates run over the full set below this cap), but we
 *  don't hold an unbounded array in memory for a wildly oversized upload. */
const MAX_ROWS = 50_000;

export type ColumnType = 'number' | 'boolean' | 'date' | 'string' | 'empty';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  /** Non-empty cell count for this column, out of table.rows.length. */
  nonEmptyCount: number;
}

export interface ParsedTable {
  columns: string[];
  /** Raw string cells, one array per data row (header excluded), each
   *  padded/truncated to `columns.length`. */
  rows: string[][];
  /** Rows whose original width didn't match the header width. */
  raggedRowCount: number;
  /** True when the source had more rows than MAX_ROWS and was truncated. */
  rowsTruncated: boolean;
}

const EMPTY_TABLE: ParsedTable = { columns: [], rows: [], raggedRowCount: 0, rowsTruncated: false };

/** Normalize a raw 2D matrix (already-split cells, e.g. from papaparse or
 *  exceljs) into a ParsedTable: first row is the header, every data row is
 *  padded/truncated to the header width. */
export function rowsFromMatrix(matrix: string[][]): ParsedTable {
  if (matrix.length === 0) return EMPTY_TABLE;
  const header = matrix[0].map((h, i) => {
    const trimmed = (h ?? '').trim();
    return trimmed.length > 0 ? trimmed : `column_${i + 1}`;
  });
  const width = header.length;
  const rowsTruncated = matrix.length - 1 > MAX_ROWS;
  const dataRows = matrix.slice(1, 1 + MAX_ROWS);

  let raggedRowCount = 0;
  const rows = dataRows.map((row) => {
    if (row.length !== width) raggedRowCount += 1;
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });

  return { columns: header, rows, raggedRowCount, rowsTruncated };
}

/** Parse CSV or TSV text into a ParsedTable. Handles quoted fields
 *  (including embedded commas/newlines) and ragged rows via papaparse. */
export function parseDelimitedText(text: string): ParsedTable {
  // Lazy require-free import isn't possible for a sync function, so this
  // module takes papaparse as a normal top-level import (it's cheap — pure
  // JS, no native bindings — unlike exceljs/mammoth/unpdf which extract.ts
  // lazy-imports for cold-start reasons).
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = (parsed.data ?? []).filter((r): r is string[] => Array.isArray(r));
  return rowsFromMatrix(rows.map((r) => r.map((cell) => (cell == null ? '' : String(cell)))));
}

/** Parse a numeric-looking cell: strips thousands separators, currency
 *  symbols, percent signs, and treats "(123)" accounting notation as
 *  negative. Returns null when the cell isn't a number. */
export function toNumber(cell: string | undefined | null): number | null {
  if (cell == null) return null;
  let s = cell.trim();
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,€£%\s]/g, '');
  if (s === '' || Number.isNaN(Number(s))) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const DATE_LIKE = /^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{1,2}-\d{1,2}-\d{2,4}$/;

function looksLikeDate(cell: string): boolean {
  const s = cell.trim();
  if (!DATE_LIKE.test(s)) return false;
  return !Number.isNaN(Date.parse(s));
}

const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);

function inferColumnType(values: string[]): ColumnType {
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return 'empty';
  if (nonEmpty.every((v) => toNumber(v) !== null)) return 'number';
  if (nonEmpty.every((v) => BOOLEAN_VALUES.has(v.trim().toLowerCase()))) return 'boolean';
  if (nonEmpty.every(looksLikeDate)) return 'date';
  return 'string';
}

/** Infer a per-column type from a table's data rows (header excluded). */
export function inferSchema(table: ParsedTable): ColumnSchema[] {
  return table.columns.map((name, i) => {
    const values = table.rows.map((r) => r[i] ?? '');
    return {
      name,
      type: inferColumnType(values),
      nonEmptyCount: values.filter((v) => v.trim() !== '').length,
    };
  });
}

/** Bounded preview of the first `limit` data rows, header excluded. */
export function previewRows(table: ParsedTable, limit: number): string[][] {
  return table.rows.slice(0, limit);
}

export type AggOp = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'group_by';

export interface QueryRequest {
  operation: AggOp;
  /** Column to aggregate. */
  column: string;
  /** Required for group_by: the column whose distinct values become groups. */
  groupBy?: string;
}

export interface GroupResult {
  key: string;
  /** Sum of `column` within the group, or null when no numeric values. */
  value: number | null;
  count: number;
}

export interface QueryResult {
  operation: AggOp;
  column: string;
  groupBy?: string;
  /** Scalar result for sum/avg/count/min/max. */
  value?: number;
  /** Number of values the scalar result was computed over. */
  sampleSize?: number;
  groups?: GroupResult[];
  /** Honest caveat — e.g. non-numeric values excluded, column not found. */
  warning?: string;
}

/** Deterministic sum/avg/count/min/max/group-by over one named column.
 *  Never calls an LLM — every number in the result was actually computed
 *  from the parsed cells. */
export function runQuery(table: ParsedTable, req: QueryRequest): QueryResult {
  const colIdx = table.columns.indexOf(req.column);
  if (colIdx === -1) {
    return {
      operation: req.operation,
      column: req.column,
      groupBy: req.groupBy,
      warning: `Column "${req.column}" not found. Available columns: ${table.columns.join(', ') || '(none)'}.`,
    };
  }

  if (req.operation === 'count') {
    const nonEmpty = table.rows.filter((r) => (r[colIdx] ?? '').trim() !== '').length;
    return { operation: 'count', column: req.column, value: nonEmpty, sampleSize: table.rows.length };
  }

  if (req.operation === 'group_by') {
    if (!req.groupBy) {
      return { operation: req.operation, column: req.column, warning: 'group_by requires a groupBy column.' };
    }
    const groupIdx = table.columns.indexOf(req.groupBy);
    if (groupIdx === -1) {
      return {
        operation: req.operation,
        column: req.column,
        groupBy: req.groupBy,
        warning: `Group-by column "${req.groupBy}" not found. Available columns: ${table.columns.join(', ') || '(none)'}.`,
      };
    }
    const groups = new Map<string, { sum: number; count: number; numericCount: number }>();
    for (const row of table.rows) {
      const rawKey = (row[groupIdx] ?? '').trim();
      const key = rawKey === '' ? '(blank)' : rawKey;
      const num = toNumber(row[colIdx]);
      const g = groups.get(key) ?? { sum: 0, count: 0, numericCount: 0 };
      g.count += 1;
      if (num !== null) {
        g.sum += num;
        g.numericCount += 1;
      }
      groups.set(key, g);
    }
    const groupResults: GroupResult[] = [...groups.entries()]
      .map(([key, g]) => ({ key, value: g.numericCount > 0 ? g.sum : null, count: g.count }))
      .sort((a, b) => b.count - a.count);
    return { operation: req.operation, column: req.column, groupBy: req.groupBy, groups: groupResults };
  }

  // sum / avg / min / max
  const numbers: number[] = [];
  let nonNumericNonEmpty = 0;
  for (const row of table.rows) {
    const cell = row[colIdx] ?? '';
    const num = toNumber(cell);
    if (num === null) {
      if (cell.trim() !== '') nonNumericNonEmpty += 1;
      continue;
    }
    numbers.push(num);
  }
  if (numbers.length === 0) {
    return {
      operation: req.operation,
      column: req.column,
      warning: `No numeric values found in column "${req.column}".`,
    };
  }
  let value: number;
  if (req.operation === 'sum') value = numbers.reduce((a, b) => a + b, 0);
  else if (req.operation === 'avg') value = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  else if (req.operation === 'min') value = Math.min(...numbers);
  else value = Math.max(...numbers);

  const warning =
    nonNumericNonEmpty > 0
      ? `${nonNumericNonEmpty} non-numeric value(s) in "${req.column}" were excluded.`
      : undefined;

  return { operation: req.operation, column: req.column, value, sampleSize: numbers.length, warning };
}
