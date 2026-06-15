'use client';

/**
 * Renders a `display: 'weather'` tool result as the tool-ui WeatherWidget.
 *
 * WeatherWidget ships no Zod schema (plain TS interfaces in
 * `schema-runtime.ts`), so we do a small structural guard before rendering —
 * the WebGL runtime assumes a well-formed payload. `effects.reducedMotion` is
 * forced on per the integration guidance (the chat transcript is not the place
 * for a busy animated canvas; the realtor wants the forecast for tour prep).
 */

import { WeatherWidget } from '@/components/tool-ui/weather-widget/weather-widget-container';
import type { WeatherWidgetPayload } from '@/components/tool-ui/weather-widget/schema-runtime';

/** Narrow `unknown` to a renderable WeatherWidget payload. Keeps the WebGL
 *  runtime from choking on a partial/malformed object. */
function isWeatherPayload(data: unknown): data is WeatherWidgetPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const location = d.location as Record<string, unknown> | undefined;
  const units = d.units as Record<string, unknown> | undefined;
  const current = d.current as Record<string, unknown> | undefined;
  return (
    d.version === '3.1' &&
    typeof d.id === 'string' &&
    !!location &&
    typeof location.name === 'string' &&
    !!units &&
    (units.temperature === 'celsius' || units.temperature === 'fahrenheit') &&
    !!current &&
    typeof current.conditionCode === 'string' &&
    typeof current.temperature === 'number' &&
    Array.isArray(d.forecast)
  );
}

export function WeatherResult({ data }: { data: unknown }) {
  if (!isWeatherPayload(data)) return null;
  return (
    <div className="mt-2">
      <WeatherWidget {...data} effects={{ reducedMotion: true }} />
    </div>
  );
}
