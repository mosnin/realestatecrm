/**
 * The tool-UI media formatters render durations and file sizes on attachment
 * chips (audio/video/file results). formatDuration switches to an h:mm:ss form
 * past an hour and zero-pads; formatFileSize steps B/KB/MB/GB with a precision
 * that drops the decimal at >=10. Both are easy to nudge by an off-by-one, so
 * pin the boundaries and the rounding.
 */

import { describe, it, expect } from 'vitest';
import { formatDuration, formatFileSize } from '@/components/tool-ui/shared/media/format-utils';

describe('formatDuration', () => {
  it('renders mm:ss under an hour, zero-padding seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(599_000)).toBe('9:59');
  });

  it('switches to h:mm:ss past an hour, zero-padding minutes + seconds', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('rounds milliseconds to the nearest second', () => {
    expect(formatDuration(1_500)).toBe('0:02'); // 1.5s -> 2
    expect(formatDuration(1_400)).toBe('0:01');
  });
});

describe('formatFileSize', () => {
  it('shows bytes under 1 KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('steps to KB/MB/GB with one decimal below 10, none at/above 10', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB'); // exactly 1 KB -> one decimal
    expect(formatFileSize(1_536_000)).toBe('1.5 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB'); // >=10 -> no decimal
    expect(formatFileSize(1024 ** 3)).toBe('1.0 GB'); // caps at GB
  });
});
