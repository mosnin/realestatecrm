/**
 * Overlap check for moving an existing tour.
 *
 * `book_tour_atomic` only guards INSERT. Reschedule (agent tool + realtor
 * PATCH) used to write the new window with no conflict check, so two
 * scheduled tours could land on the same hour after a move. This is the
 * read-side twin of the RPC overlap predicate:
 *   status IN (scheduled, confirmed) AND startsAt < ends AND endsAt > starts
 *
 * Fail-closed: a lookup error is treated as a conflict so a flaky read
 * cannot silently double-book. Callers surface that as 409 / a tool error.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export async function tourWindowConflicts(input: {
  spaceId: string;
  startsAt: string;
  endsAt: string;
  /** The tour being moved — must not collide with itself. */
  excludeTourId?: string;
}): Promise<boolean> {
  let query = supabase
    .from('Tour')
    .select('id')
    .eq('spaceId', input.spaceId)
    .in('status', ['scheduled', 'confirmed'])
    .lt('startsAt', input.endsAt)
    .gt('endsAt', input.startsAt)
    .limit(1);

  if (input.excludeTourId) {
    query = query.neq('id', input.excludeTourId);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn(
      '[tours.conflicts] overlap lookup failed — treating as conflict',
      { spaceId: input.spaceId, err: error.message },
    );
    return true;
  }
  return Array.isArray(data) && data.length > 0;
}
