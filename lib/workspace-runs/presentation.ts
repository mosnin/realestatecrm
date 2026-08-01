import type { WorkspaceRunStatus, WorkspaceRunView } from './types';

type LaunchReceipt = NonNullable<WorkspaceRunView['launchReceipts']>[number];

const FALLBACK_STATUS: Record<WorkspaceRunStatus, string> = {
  queued: 'Saved and waiting to launch. Safe to leave.',
  launching: 'Saved and starting securely. Safe to leave.',
  running: 'Running in the isolated workspace.',
  completed: 'Workspace complete.',
  failed: 'Workspace could not finish.',
  cancelled: 'Workspace cancelled.',
};

export function workspaceLaunchMessage(
  status: WorkspaceRunStatus,
  receipt?: LaunchReceipt,
): string {
  if (status === 'launching' && receipt?.state === 'recovering') {
    return 'Saved; safely recovering the same launch. Safe to leave.';
  }
  if (status === 'launching' && receipt?.state === 'accepted') {
    return receipt.attempt > 1
      ? 'Runtime accepted the recovered launch. Safe to leave.'
      : 'Runtime accepted; starting the isolated workspace. Safe to leave.';
  }
  if (status === 'launching' && receipt?.state === 'claimed' && receipt.attempt > 1) {
    return 'Saved; safely retrying the same workspace. Safe to leave.';
  }
  return FALLBACK_STATUS[status];
}
