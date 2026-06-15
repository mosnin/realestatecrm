/**
 * `get_weather` — keyless forecast for tour prep ("weather for the showing").
 *
 * Read-only. Geocodes the given location/address via Open-Meteo's geocoding
 * API, fetches the current conditions + a 5-day daily forecast, maps WMO
 * weather codes to the widget's conditionCode enum, and returns a
 * WeatherWidget payload (`display: 'weather'`). No API key required.
 *
 * Fail-soft: any network/parse failure returns a plain text summary rather
 * than throwing — a flaky weather API must never wedge a chat turn.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { wmoToConditionCode } from '@/components/ai/blocks/tool-results/tool-ui-mappers';
import type {
  WeatherWidgetPayload,
  ForecastDay,
  TemperatureUnit,
} from '@/components/tool-ui/weather-widget/schema-runtime';

const parameters = z
  .object({
    location: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('City, neighborhood, or property address to get the forecast for.'),
    units: z
      .enum(['fahrenheit', 'celsius'])
      .optional()
      .default('fahrenheit')
      .describe('Temperature unit. Defaults to fahrenheit.'),
  })
  .describe('Current conditions + 5-day forecast for a location (tour prep). Keyless Open-Meteo.');

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 6_000;

interface WeatherData {
  payload: WeatherWidgetPayload;
  summary: string;
}

/** GET JSON with a short timeout + redirect follow. Returns null on any failure. */
async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  // Abort the fetch if the turn itself is cancelled.
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** Short weekday label for a forecast day ("Mon", "Tue"). */
function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

async function fetchWeather(
  location: string,
  units: TemperatureUnit,
  signal: AbortSignal,
): Promise<WeatherData | null> {
  // 1. Geocode → lat/lon + a clean display name.
  const geoParams = new URLSearchParams({ name: location, count: '1', language: 'en', format: 'json' });
  const geo = await getJson<{
    results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }>;
  }>(`${GEOCODE_URL}?${geoParams.toString()}`, signal);
  const place = geo?.results?.[0];
  if (!place) return null;

  const displayName = [place.name, place.admin1].filter(Boolean).join(', ') || place.name;

  // 2. Forecast → current + 5 daily.
  const tempUnit = units === 'celsius' ? 'celsius' : 'fahrenheit';
  const fcParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: tempUnit,
    timezone: 'auto',
    forecast_days: '5',
  });
  const fc = await getJson<{
    current?: { temperature_2m?: number; weather_code?: number };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
    utc_offset_seconds?: number;
  }>(`${FORECAST_URL}?${fcParams.toString()}`, signal);
  if (!fc?.current || !fc.daily?.time?.length) return null;

  const daily = fc.daily;
  const forecast: ForecastDay[] = (daily.time ?? []).slice(0, 5).map((date, i) => ({
    label: dayLabel(date),
    conditionCode: wmoToConditionCode(daily.weather_code?.[i] ?? 0),
    tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
  }));

  const todayMin = Math.round(daily.temperature_2m_min?.[0] ?? fc.current.temperature_2m ?? 0);
  const todayMax = Math.round(daily.temperature_2m_max?.[0] ?? fc.current.temperature_2m ?? 0);
  const currentCode = wmoToConditionCode(fc.current.weather_code ?? 0);
  const currentTemp = Math.round(fc.current.temperature_2m ?? todayMax);

  // localTimeOfDay: hour-of-day (0-24) at the location, used by the widget to
  // pick a day/night scene. Derived from the location's UTC offset.
  const offsetMs = (fc.utc_offset_seconds ?? 0) * 1000;
  const localHour = new Date(Date.now() + offsetMs).getUTCHours();

  const payload: WeatherWidgetPayload = {
    version: '3.1',
    id: 'weather',
    location: { name: displayName },
    units: { temperature: tempUnit },
    current: {
      conditionCode: currentCode,
      temperature: currentTemp,
      tempMin: todayMin,
      tempMax: todayMax,
    },
    forecast,
    time: { localTimeOfDay: localHour },
    updatedAt: new Date().toISOString(),
  };

  const unitLabel = tempUnit === 'celsius' ? '°C' : '°F';
  const summary = `${displayName}: ${currentTemp}${unitLabel}, ${currentCode.replace(/-/g, ' ')}. High ${todayMax}${unitLabel} / low ${todayMin}${unitLabel}.`;
  return { payload, summary };
}

export const getWeatherTool = defineTool<typeof parameters, WeatherWidgetPayload>({
  name: 'get_weather',
  riskLevel: 'safe',
  description:
    'Current conditions + 5-day forecast for a location or property address — for tour prep ("weather for the showing"). Keyless Open-Meteo; no setup required.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const units: TemperatureUnit = args.units === 'celsius' ? 'celsius' : 'fahrenheit';
    const data = await fetchWeather(args.location, units, ctx.signal);
    if (!data) {
      return {
        summary: `I couldn't pull the forecast for "${args.location}" right now. Try a nearby city or a more specific address.`,
        display: 'plain',
      };
    }
    return { summary: data.summary, data: data.payload, display: 'weather' };
  },
});
