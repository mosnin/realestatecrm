import 'server-only';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { isPremiumAccessBlocked } from '@/lib/api-auth';
import { fireRoutineRun } from '@/lib/routines';
import { callFollowUpCoordinator, usesConvexFollowUp, type FollowUpReference } from './follow-up-pilot';

/** The callback carries references, never instructions or a grant to send. Re-read authority at execution time. */
export async function executeConvexFollowUp(job: FollowUpReference & { jobId: string }) {
  if (!usesConvexFollowUp(job.routineId) || process.env.CRON_ROUTINES_DISABLED) return 'skipped' as const;
  // Claim before touching the executor. Replayed callbacks can never execute twice.
  const claimed = await callFollowUpCoordinator('claim', job);
  if (claimed !== true) return 'duplicate' as const;
  const { data: routine, error: routineError } = await tenantTable(supabase, 'Routine', { spaceId: job.spaceId })
    .select('id, instruction, enabled, nextRunAt').eq('id', job.routineId).maybeSingle();
  if (routineError) throw routineError;
  if (!routine?.enabled || !routine.nextRunAt || Date.parse(routine.nextRunAt) !== Date.parse(job.scheduledFor) || Date.parse(job.scheduledFor) > Date.now()) return 'skipped' as const;
  const { data: space, error: spaceError } = await supabase.from('Space')
    .select('ownerId, stripeSubscriptionStatus, stripePeriodEnd').eq('id', job.spaceId).maybeSingle();
  if (spaceError) throw spaceError;
  if (!space || isPremiumAccessBlocked(space.stripeSubscriptionStatus, space.stripePeriodEnd)) return 'skipped' as const;
  const { data: owner, error: ownerError } = await supabase.from('User').select('clerkId, platformRole, status').eq('id', space.ownerId).maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner?.clerkId || owner.platformRole === 'banned' || owner.status === 'offboarded') return 'skipped' as const;
  // Canonical runner enforces the saved autonomy policy, tool grants, shared lock and budget.
  return await fireRoutineRun(job.spaceId, routine.instruction, owner.clerkId) === 'ok' ? 'completed' as const : 'failed' as const;
}
