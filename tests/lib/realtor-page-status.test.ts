import { describe, expect, it } from 'vitest';
import {
  formatFilesStatus,
  formatIntakeStatus,
} from '@/lib/realtor-page-status';

describe('realtor page status copy', () => {
  it('counts chat attachments in the Files status', () => {
    const fileCount = 0;
    const attachmentCount = 1;
    expect(formatFilesStatus(fileCount + attachmentCount, 164_500)).toBe(
      '1 file, 160.6 KB so far.',
    );
  });

  it('qualifies an empty weekly intake window', () => {
    expect(formatIntakeStatus(0, 0)).toBe(
      'No submissions this week. Share the link.',
    );
    expect(formatIntakeStatus(3, 2)).toBe(
      '3 submissions this week. 2 were hot.',
    );
  });
});
