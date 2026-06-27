/**
 * toast-helpers wraps sonner with two deliberate choices worth pinning: fixed
 * durations (success 3s, error 4s so failures linger longer, copied 2s) and an
 * optional id that's threaded through so a loading toast can be UPDATED in
 * place (loading -> success/error with the same id) instead of stacking a
 * second toast. Mock sonner and assert the method + options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const t = vi.hoisted(() => ({
  loading: vi.fn(() => 'toast-1'),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: t }));

import {
  toastLoading,
  toastSuccess,
  toastError,
  toastCopied,
  toastDismiss,
} from '@/lib/toast-helpers';

beforeEach(() => vi.clearAllMocks());

describe('toast-helpers', () => {
  it('toastLoading passes the id through and returns the toast id', () => {
    expect(toastLoading('Working…', 'x')).toBe('toast-1');
    expect(t.loading).toHaveBeenCalledWith('Working…', { id: 'x' });
  });

  it('toastSuccess uses a 3s duration, threading an id when given (update-in-place)', () => {
    toastSuccess('Saved');
    expect(t.success).toHaveBeenCalledWith('Saved', { duration: 3000 });

    toastSuccess('Saved', 'x');
    expect(t.success).toHaveBeenLastCalledWith('Saved', { id: 'x', duration: 3000 });
  });

  it('toastError lingers longer (4s) and threads an id when given', () => {
    toastError('Failed');
    expect(t.error).toHaveBeenCalledWith('Failed', { duration: 4000 });

    toastError('Failed', 'x');
    expect(t.error).toHaveBeenLastCalledWith('Failed', { id: 'x', duration: 4000 });
  });

  it('toastCopied is a quick 2s success with a sensible default label', () => {
    toastCopied();
    expect(t.success).toHaveBeenCalledWith('Copied to clipboard', { duration: 2000 });

    toastCopied('Link copied');
    expect(t.success).toHaveBeenLastCalledWith('Link copied', { duration: 2000 });
  });

  it('toastDismiss dismisses by id', () => {
    toastDismiss('x');
    expect(t.dismiss).toHaveBeenCalledWith('x');
  });
});
