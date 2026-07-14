import { formatBytes } from '@/lib/storage/limits';

export function formatFilesStatus(count: number, totalBytes: number): string {
  return count === 0
    ? 'Nothing uploaded yet — drop a file anywhere on this page.'
    : `${count} ${count === 1 ? 'file' : 'files'}, ${formatBytes(totalBytes)} so far.`;
}

export function formatIntakeStatus(
  totalSubmissionsThisWeek: number,
  hotLeadCountThisWeek: number,
): string {
  if (totalSubmissionsThisWeek === 0) {
    return 'No submissions this week. Share the link.';
  }

  const submissions =
    totalSubmissionsThisWeek === 1
      ? '1 submission this week.'
      : `${totalSubmissionsThisWeek} submissions this week.`;

  if (hotLeadCountThisWeek === 0) return submissions;

  const hot =
    hotLeadCountThisWeek === 1
      ? '1 was hot.'
      : `${hotLeadCountThisWeek} were hot.`;
  return `${submissions} ${hot}`;
}
