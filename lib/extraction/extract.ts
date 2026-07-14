/**
 * Server-side text extraction for chat attachments.
 *
 * Runs at upload time in /api/ai/attachments (the buffer is already in
 * memory there) and writes into the existing Attachment.extractedText /
 * extractionStatus columns. This is the implementation the schema and the
 * read_attachment tool were designed around — extraction previously only
 * existed in the Python Modal runtime and never ran for the default
 * in-process TS agent.
 *
 * All parsers are pure JS (Vercel serverless safe) and lazily imported so
 * routes that never touch documents don't pay the cold-start cost:
 *   - CSV  → papaparse   → TSV rows
 *   - XLSX → exceljs     → per-sheet TSV
 *   - DOCX → mammoth     → raw text
 *   - PDF  → unpdf       → text layer (scanned PDFs with no text layer
 *            extract empty; Anthropic's native document path stays the
 *            primary PDF reader where available)
 *   - txt/markdown/json  → utf8 passthrough
 *
 * Output is capped at MAX_EXTRACTED_CHARS to match the Python extractor
 * (agent/tools/attachments.py::_MAX_TEXT_CHARS).
 */

export const MAX_EXTRACTED_CHARS = 50_000;
/** Rows per sheet/file beyond which tabular extraction truncates. */
const MAX_TABLE_ROWS = 500;

export interface ExtractionResult {
  /** Extracted text, truncated to MAX_EXTRACTED_CHARS. Null when skipped/failed. */
  text: string | null;
  status: 'done' | 'failed' | 'skipped';
}

function cap(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_EXTRACTED_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_EXTRACTED_CHARS)}\n[truncated]`;
}

function rowsToTsv(rows: unknown[][], label?: string): string {
  const out: string[] = label ? [label] : [];
  const slice = rows.slice(0, MAX_TABLE_ROWS);
  for (const row of slice) {
    out.push(
      row
        .map((cell) => (cell === null || cell === undefined ? '' : String(cell).replaceAll('\t', ' ')))
        .join('\t'),
    );
  }
  if (rows.length > MAX_TABLE_ROWS) {
    out.push(`[${rows.length - MAX_TABLE_ROWS} more rows truncated]`);
  }
  return out.join('\n');
}

async function extractCsv(buffer: Buffer): Promise<string> {
  const { default: Papa } = await import('papaparse');
  const parsed = Papa.parse<string[]>(buffer.toString('utf8'), { skipEmptyLines: true });
  return rowsToTsv(parsed.data);
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed with an empty slot 0.
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(
        values.map((v) => {
          if (v && typeof v === 'object') {
            // Rich cells: formula results, hyperlinks, rich text.
            const o = v as { result?: unknown; text?: unknown; hyperlink?: unknown };
            return o.result ?? o.text ?? o.hyperlink ?? '';
          }
          return v;
        }),
      );
    });
    if (rows.length > 0) {
      sections.push(rowsToTsv(rows, `## Sheet: ${sheet.name}`));
    }
  });
  return sections.join('\n\n');
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === 'string' ? text : String(text ?? '');
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Extract readable text from an uploaded attachment buffer. Never throws —
 * a parser failure returns status 'failed' so the upload still succeeds and
 * the UI/tools can report the honest state.
 */
export async function extractAttachmentText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractionResult> {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return { text: null, status: 'skipped' };

  try {
    let text: string;
    if (mime === 'text/csv' || filename.toLowerCase().endsWith('.csv')) {
      text = await extractCsv(buffer);
    } else if (mime === XLSX_MIME) {
      text = await extractXlsx(buffer);
    } else if (mime === DOCX_MIME) {
      text = await extractDocx(buffer);
    } else if (mime === 'application/pdf') {
      text = await extractPdf(buffer);
    } else if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'text/markdown'
    ) {
      text = buffer.toString('utf8');
    } else {
      return { text: null, status: 'skipped' };
    }
    return { text: cap(text), status: 'done' };
  } catch {
    return { text: null, status: 'failed' };
  }
}
