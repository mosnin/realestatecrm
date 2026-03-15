/**
 * Client-side CSV download utility.
 * Builds a CSV string from an array of flat objects and triggers a browser download.
 */
export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;

  const keys = Object.keys(rows[0]);

  function escapeCsvCell(val: unknown): string {
    if (val == null) return '';
    const str = String(val).replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  }

  const lines = [
    keys.join(','),
    ...rows.map((row) => keys.map((k) => escapeCsvCell(row[k])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
