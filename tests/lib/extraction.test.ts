/**
 * Behavioral tests for the upload-time attachment extractor. Real parsers,
 * real bytes — CSV/TSV structure, XLSX round-trip through exceljs, plaintext
 * passthrough, image skip, and honest failure on corrupt input.
 */

import { describe, expect, it } from 'vitest';
import { extractAttachmentText, MAX_EXTRACTED_CHARS } from '@/lib/extraction/extract';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('extractAttachmentText', () => {
  it('parses CSV into tab-separated rows', async () => {
    const csv = 'name,price,beds\n412 Elm St,550000,3\n9 Oak Ave,715000,4\n';
    const result = await extractAttachmentText(Buffer.from(csv), 'text/csv', 'listings.csv');
    expect(result.status).toBe('done');
    expect(result.text).toContain('name\tprice\tbeds');
    expect(result.text).toContain('412 Elm St\t550000\t3');
    expect(result.text).toContain('9 Oak Ave\t715000\t4');
  });

  it('round-trips an XLSX workbook through exceljs', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Comps');
    sheet.addRow(['address', 'sold']);
    sheet.addRow(['12 Pine Rd', 480000]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await extractAttachmentText(buffer, XLSX_MIME, 'comps.xlsx');
    expect(result.status).toBe('done');
    expect(result.text).toContain('## Sheet: Comps');
    expect(result.text).toContain('address\tsold');
    expect(result.text).toContain('12 Pine Rd\t480000');
  });

  it('passes plaintext through and caps at the extraction ceiling', async () => {
    const long = 'a'.repeat(MAX_EXTRACTED_CHARS + 5_000);
    const result = await extractAttachmentText(Buffer.from(long), 'text/plain', 'notes.txt');
    expect(result.status).toBe('done');
    expect(result.text).toContain('[truncated]');
    expect(result.text!.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS + '\n[truncated]'.length);
  });

  it('skips images', async () => {
    const result = await extractAttachmentText(Buffer.from('png-bytes'), 'image/png', 'photo.png');
    expect(result).toEqual({ text: null, status: 'skipped' });
  });

  it('fails honestly on corrupt spreadsheet bytes instead of throwing', async () => {
    const result = await extractAttachmentText(
      Buffer.from('this is not a zip archive'),
      XLSX_MIME,
      'broken.xlsx',
    );
    expect(result.status).toBe('failed');
    expect(result.text).toBeNull();
  });
});
