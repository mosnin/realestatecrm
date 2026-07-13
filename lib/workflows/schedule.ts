/** A `schedule` workflow's trigger.config, as stored. */
export interface ScheduleConfig {
  cadence: 'hourly' | 'daily' | 'weekdays';
  hour?: number;
  timezone?: string;
}

/** Resolve the local hour and weekday, falling back to UTC for invalid zones. */
function localHourAndDay(now: Date, timezone?: string): { hour: number; dow: number } {
  if (!timezone) return { hour: now.getUTCHours(), dow: now.getUTCDay() };

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? String(now.getUTCHours());
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      hour: parseInt(hourStr, 10) % 24,
      dow: dayMap[weekdayStr] ?? now.getUTCDay(),
    };
  } catch {
    return { hour: now.getUTCHours(), dow: now.getUTCDay() };
  }
}

/** Decide whether a schedule workflow is due in the current hourly tick. */
export function isScheduleDue(config: ScheduleConfig, now: Date): boolean {
  if (config.cadence === 'hourly') return true;

  const { hour: currentHour, dow } = localHourAndDay(now, config.timezone);
  if (currentHour !== (config.hour ?? 0)) return false;
  return config.cadence !== 'weekdays' || (dow >= 1 && dow <= 5);
}
