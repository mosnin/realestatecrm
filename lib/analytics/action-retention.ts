const DAY = 86_400_000;

export interface ActionReceipt {
  spaceId: string;
  createdAt: string;
  payload: { outcome?: string } | null;
}
export interface ActionCohort {
  week: string;
  activated: number;
  week2Eligible: number;
  week2Repeat: number;
  week5Eligible: number;
  week5Repeat: number;
}

/** Repeat useful work, including unattended execution. This is not login
 * retention or a claim of delivery beyond the originating tool's receipt.
 * Windows mature in full before entering the denominator. */
export function actionRetention(
  receipts: ActionReceipt[],
  now: Date,
): ActionCohort[] {
  const bySpace = new Map<string, number[]>();
  for (const row of receipts) {
    const time = Date.parse(row.createdAt);
    if (
      row.payload?.outcome !== 'completed' ||
      !Number.isFinite(time) ||
      time > now.getTime()
    )
      continue;
    const times = bySpace.get(row.spaceId) ?? [];
    times.push(time);
    bySpace.set(row.spaceId, times);
  }
  const cohorts = new Map<string, ActionCohort>();
  for (const times of bySpace.values()) {
    const first = times.reduce(
      (earliest, time) => Math.min(earliest, time),
      Infinity,
    );
    const monday = new Date(first);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = monday.toISOString().slice(0, 10);
    const row = cohorts.get(week) ?? {
      week,
      activated: 0,
      week2Eligible: 0,
      week2Repeat: 0,
      week5Eligible: 0,
      week5Repeat: 0,
    };
    row.activated++;
    const age = now.getTime() - first;
    if (age >= 14 * DAY) {
      row.week2Eligible++;
      if (
        times.some((time) => time >= first + 7 * DAY && time < first + 14 * DAY)
      )
        row.week2Repeat++;
    }
    if (age >= 35 * DAY) {
      row.week5Eligible++;
      if (
        times.some(
          (time) => time >= first + 28 * DAY && time < first + 35 * DAY,
        )
      )
        row.week5Repeat++;
    }
    cohorts.set(week, row);
  }
  return [...cohorts.values()].sort((a, b) => b.week.localeCompare(a.week));
}
