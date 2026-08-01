import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn() }));

vi.mock('@/lib/workspace-runs/recovery', () => ({
  reconcileWorkspaceRunLaunches: reconcile,
}));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunRecoveryEnabled: () =>
    process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED === 'true',
}));
vi.mock('@/lib/cron-monitor', () => ({
  monitorCron: (_slug: string, _schedule: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/cron/workspace-run-recovery/route';

const savedSecret = process.env.CRON_SECRET;
const savedDisabled = process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED;
const savedRecoveryEnabled = process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED;

describe('Workspace Run recovery cron', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED = 'true';
    delete process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED;
    reconcile.mockReset();
    reconcile.mockResolvedValue({
      scanned: 2,
      enqueued: 2,
      planning: 1,
      execution: 1,
      failedSilent: 0,
      featureDisabled: 0,
      maxStaleSeconds: 301,
    });
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
    if (savedDisabled === undefined) {
      delete process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED;
    } else {
      process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED = savedDisabled;
    }
    if (savedRecoveryEnabled === undefined) {
      delete process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED;
    } else {
      process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED = savedRecoveryEnabled;
    }
  });

  it('fails closed without the exact cron authority', async () => {
    delete process.env.CRON_SECRET;
    expect(
      (await GET(new NextRequest('http://localhost/api/cron/workspace-run-recovery'))).status,
    ).toBe(500);

    process.env.CRON_SECRET = 'cron-secret';
    expect(
      (await GET(new NextRequest('http://localhost/api/cron/workspace-run-recovery'))).status,
    ).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('returns the bounded recovery receipt only after accepted reconciliation', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/cron/workspace-run-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      scanned: 2,
      enqueued: 2,
      planning: 1,
      execution: 1,
      failedSilent: 0,
      featureDisabled: 0,
      maxStaleSeconds: 301,
      durationMs: expect.any(Number),
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('honors the kill switch and exposes dependency failure as a 500', async () => {
    process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED = '1';
    const disabled = await GET(new NextRequest(
      'http://localhost/api/cron/workspace-run-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(await disabled.json()).toMatchObject({ skipped: 'kill-switch on' });
    expect(reconcile).not.toHaveBeenCalled();

    delete process.env.CRON_WORKSPACE_RUN_RECOVERY_DISABLED;
    reconcile.mockRejectedValueOnce(new Error('event acceptance failed'));
    const failed = await GET(new NextRequest(
      'http://localhost/api/cron/workspace-run-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Workspace recovery failed' });
  });

  it('is default-off even when the cron authority is valid', async () => {
    delete process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED;
    const response = await GET(new NextRequest(
      'http://localhost/api/cron/workspace-run-recovery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ));
    expect(await response.json()).toEqual({ ok: true, skipped: 'feature-off' });
    expect(reconcile).not.toHaveBeenCalled();
  });
});
