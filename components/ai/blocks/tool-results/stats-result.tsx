'use client';

/**
 * Renders a `display: 'stats'` tool result as the tool-ui StatsDisplay.
 *
 * The analytics tool returns a payload already shaped like StatsDisplay
 * (`{ id, title?, description?, stats: [...] }`). We validate via
 * `safeParseSerializableStatsDisplay` and fall back to null if malformed.
 */

import { StatsDisplay } from '@/components/tool-ui/stats-display';
import { safeParseSerializableStatsDisplay } from '@/components/tool-ui/stats-display/schema';

export function StatsResult({ data }: { data: unknown }) {
  const parsed = safeParseSerializableStatsDisplay(data);
  if (!parsed) return null;
  return (
    <div className="mt-2">
      <StatsDisplay {...parsed} />
    </div>
  );
}
