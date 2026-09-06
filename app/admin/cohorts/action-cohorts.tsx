import { supabase } from '@/lib/supabase';
import {
  actionRetention,
  type ActionReceipt,
} from '@/lib/analytics/action-retention';

/** Parent page has already checked platform-admin access. Only the workspaces
 * in its signup cohort are passed into this read. Paginate so a busy workspace
 * cannot silently truncate the report at the database's row limit. */
export async function ActionCohorts({
  spaceIds,
  now,
}: {
  spaceIds: string[];
  now: Date;
}) {
  const receipts: ActionReceipt[] = [];
  let unavailable = false;
  try {
    for (let i = 0; i < spaceIds.length; i += 100) {
      const scope = spaceIds.slice(i, i + 100);
      for (let page = 0; ; page++) {
        if (page >= 100)
          throw new Error('Report is too large for an interactive read');
        const { data, error } = await supabase
          .from('TelemetryEvent')
          .select('spaceId, createdAt, payload')
          .in('spaceId', scope)
          .eq('event', 'agent_action_result')
          .order('createdAt', { ascending: true })
          .order('id', { ascending: true })
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        receipts.push(...((data ?? []) as ActionReceipt[]));
        if (!data || data.length < 1000) break;
      }
    }
  } catch {
    unavailable = true;
  }
  const cohorts = actionRetention(receipts, now);
  const repeat = (n: number, eligible: number) =>
    eligible
      ? `${n} / ${eligible} (${Math.round((n / eligible) * 100)}%)`
      : 'Window still open';
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Repeat useful work</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          For workspaces from the signup cohorts below, grouped by their first
          recorded completed action. Drafts and failed attempts do not count.
          Automatic work counts alongside tasks requested in chat; this measures
          continued value, not return visits.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Week 2 covers days 7–13 after the first action. Week 5 covers days
          28–34. Only fully elapsed windows enter each denominator. Historical
          work without action receipts cannot be reconstructed.
        </p>
      </div>
      {unavailable ? (
        <p role="alert" className="text-sm">
          Action receipts could not be loaded. Repeat work is unavailable.
        </p>
      ) : !cohorts.length ? (
        <p className="text-sm text-muted-foreground">
          No completed-action receipts recorded yet. This report fills as Chippi
          completes real work.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4">First work week</th>
                <th className="px-3">Workspaces</th>
                <th className="px-3">Week 2 repeat work</th>
                <th className="px-3">Week 5 repeat work</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => (
                <tr
                  key={row.week}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-3 pr-4">{row.week}</td>
                  <td className="px-3">{row.activated}</td>
                  <td className="px-3">
                    {repeat(row.week2Repeat, row.week2Eligible)}
                  </td>
                  <td className="px-3">
                    {repeat(row.week5Repeat, row.week5Eligible)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
