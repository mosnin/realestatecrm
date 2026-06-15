"""Weather tool — keyless forecast for tour prep ("weather for the showing").

Geocodes a location/property address via Open-Meteo's geocoding API, fetches
current conditions + a 5-day daily forecast, maps WMO weather codes to the
WeatherWidget conditionCode enum, and returns a version 3.1 payload.

No API key required. Fail-soft: any network/parse error returns a small error
dict rather than raising, so a flaky weather API never wedges an agent run.
This is the Python/Modal-path counterpart of lib/ai-tools/tools/get-weather.ts.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from security.context import AgentContext

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TIMEOUT = 6.0


def wmo_to_condition_code(code: int) -> str:
    """Map an Open-Meteo WMO weather-interpretation code to the widget's
    13-value conditionCode enum. Mirrors wmoToConditionCode in the TS mapper."""
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly-cloudy"
    if code == 3:
        return "overcast"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55):
        return "drizzle"
    if code in (56, 57):
        return "sleet"
    if code in (61, 63):
        return "rain"
    if code == 65:
        return "heavy-rain"
    if code in (66, 67):
        return "sleet"
    if code in (71, 73, 75, 77):
        return "snow"
    if code in (80, 81):
        return "rain"
    if code == 82:
        return "heavy-rain"
    if code in (85, 86):
        return "snow"
    if code == 95:
        return "thunderstorm"
    if code in (96, 99):
        return "hail"
    return "cloudy"


def _day_label(iso_date: str) -> str:
    try:
        d = datetime.fromisoformat(f"{iso_date}T12:00:00")
        return d.strftime("%a")
    except ValueError:
        return iso_date


@function_tool(strict_mode=False)
async def get_weather(
    ctx: RunContextWrapper[AgentContext],
    location: str,
    units: str = "fahrenheit",
) -> dict[str, Any]:
    """Current conditions + 5-day forecast for a location/address (tour prep)."""
    # location: city, neighborhood, or property address. units: fahrenheit|celsius.
    # Keyless Open-Meteo. Returns a WeatherWidget v3.1 payload with display:'weather'.
    del ctx  # weather is space-agnostic; no tenant data involved.
    location_clean = (location or "").strip()
    if not location_clean:
        return {"error": "location is required"}

    temp_unit = "celsius" if str(units).lower() == "celsius" else "fahrenheit"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            geo_res = await client.get(
                _GEOCODE_URL,
                params={"name": location_clean, "count": 1, "language": "en", "format": "json"},
            )
            geo = geo_res.json() if geo_res.status_code == 200 else {}
            results = geo.get("results") or []
            if not results:
                return {"error": f"Could not find a location matching '{location_clean}'."}
            place = results[0]
            display_name = ", ".join(
                [p for p in (place.get("name"), place.get("admin1")) if p]
            ) or place.get("name", location_clean)

            fc_res = await client.get(
                _FORECAST_URL,
                params={
                    "latitude": place["latitude"],
                    "longitude": place["longitude"],
                    "current": "temperature_2m,weather_code",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min",
                    "temperature_unit": temp_unit,
                    "timezone": "auto",
                    "forecast_days": 5,
                },
            )
            fc = fc_res.json() if fc_res.status_code == 200 else {}
    except Exception as exc:  # noqa: BLE001 — fail soft, never raise to the agent loop
        return {"error": f"Weather lookup failed: {exc}"}

    current = fc.get("current") or {}
    daily = fc.get("daily") or {}
    times = daily.get("time") or []
    if not current or not times:
        return {"error": "Weather service returned no forecast — try again shortly."}

    codes = daily.get("weather_code") or []
    maxes = daily.get("temperature_2m_max") or []
    mins = daily.get("temperature_2m_min") or []

    def _round(value: Any, fallback: float = 0.0) -> int:
        try:
            return round(float(value))
        except (TypeError, ValueError):
            return round(fallback)

    forecast: list[dict[str, Any]] = []
    for i, date in enumerate(times[:5]):
        forecast.append({
            "label": _day_label(date),
            "conditionCode": wmo_to_condition_code(int(codes[i]) if i < len(codes) else 0),
            "tempMin": _round(mins[i] if i < len(mins) else 0),
            "tempMax": _round(maxes[i] if i < len(maxes) else 0),
        })

    current_temp = _round(current.get("temperature_2m"), maxes[0] if maxes else 0)
    today_max = _round(maxes[0] if maxes else current.get("temperature_2m"), current_temp)
    today_min = _round(mins[0] if mins else current.get("temperature_2m"), current_temp)
    current_code = wmo_to_condition_code(int(current.get("weather_code") or 0))

    offset = int(fc.get("utc_offset_seconds") or 0)
    local_hour = (datetime.now(timezone.utc).hour + offset // 3600) % 24

    return {
        "version": "3.1",
        "id": "weather",
        "location": {"name": display_name},
        "units": {"temperature": temp_unit},
        "current": {
            "conditionCode": current_code,
            "temperature": current_temp,
            "tempMin": today_min,
            "tempMax": today_max,
        },
        "forecast": forecast,
        "time": {"localTimeOfDay": local_hour},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "display": "weather",
    }
