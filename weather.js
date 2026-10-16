'use strict';
const { HttpError } = require('./util');

/* Current weather and a 7-day forecast from Open-Meteo (free, no API key). Results are cached for 30 minutes. */
function createWeather(opts) {
  opts = opts || {};
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const now = opts.now || Date.now;
  const cache = new Map();
  const TTL = 30 * 60 * 1000;

  function parseCoord(value, min, max, label) {
    const n = Number(value);
    if (value == null || value === '' || !Number.isFinite(n) || n < min || n > max) {
      throw new HttpError(400, 'invalid_coordinates', label + ' must be a number between ' + min + ' and ' + max);
    }
    return Math.round(n * 100) / 100;   // 2 decimals is about 1 km, which also makes the cache effective
  }

  async function forecast(latValue, lonValue) {
    const lat = parseCoord(latValue, -90, 90, 'lat');
    const lon = parseCoord(lonValue, -180, 180, 'lon');
    const key = lat + ',' + lon;
    const hit = cache.get(key);
    if (hit && now() - hit.t < TTL) return hit.v;

    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7';

    let json;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('status ' + res.status);
      json = await res.json();
    } catch (e) {
      throw new HttpError(503, 'weather_unavailable', 'The weather service could not be reached. Please try again later.');
    }

    const d = json.daily || {};
    const c = json.current || {};
    const value = {
      location: { lat, lon },
      current: {
        time: c.time || null,
        temperatureC: c.temperature_2m,
        humidityPercent: c.relative_humidity_2m,
        rainMm: c.precipitation,
        windKmh: c.wind_speed_10m
      },
      daily: (d.time || []).map((date, i) => ({
        date,
        maxC: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
        minC: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
        rainMm: d.precipitation_sum ? d.precipitation_sum[i] : null
      }))
    };
    cache.set(key, { t: now(), v: value });
    return value;
  }

  return { forecast };
}

module.exports = { createWeather };
