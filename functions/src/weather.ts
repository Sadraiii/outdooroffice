export interface GeoPoint { name?: string; lat: number; lon: number }
export interface HourWeather { temp: number; code: number; pop: number; wind: number }

export const isGeo = (g: unknown): g is GeoPoint => {
  const x = g as GeoPoint | null;
  return !!x && typeof x.lat === 'number' && typeof x.lon === 'number' && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180;
};

export function weatherWord(code: number): string {
  if (code === 0) return 'klart';
  if (code === 1) return 'mest klart';
  if (code === 2) return 'let skyet';
  if (code === 3) return 'overskyet';
  if (code === 45 || code === 48) return 'tåge';
  if (code >= 51 && code <= 55) return 'støvregn';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'isslag';
  if (code === 61 || code === 80) return 'let regn';
  if (code === 63 || code === 81) return 'regn';
  if (code === 65 || code === 82) return 'kraftig regn';
  if (code === 71 || code === 85) return 'let sne';
  if (code === 73 || code === 75 || code === 77 || code === 86) return 'sne';
  if (code >= 95) return 'torden';
  return 'skiftende vejr';
}

export function weatherPhrase(w: HourWeather): string {
  const wind = w.wind >= 8 ? `, ${Math.round(w.wind)} m/s` : '';
  return `${Math.round(w.temp)}° og ${weatherWord(w.code)}${wind}`;
}

export async function forecastAt(geo: GeoPoint, at: number): Promise<HourWeather | null> {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${geo.lat.toFixed(3)}&longitude=${geo.lon.toFixed(3)}`
    + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=GMT&forecast_days=3';
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const body = (await r.json()) as { hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; wind_speed_10m: number[] } };
  const h = body.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const key = new Date(Math.floor(at / 3600_000) * 3600_000).toISOString().slice(0, 13);
  const i = h.time.findIndex((t) => t.slice(0, 13) === key);
  if (i < 0 || typeof h.temperature_2m[i] !== 'number') return null;
  return { temp: h.temperature_2m[i], code: h.weather_code[i], pop: h.precipitation_probability[i] ?? 0, wind: h.wind_speed_10m[i] ?? 0 };
}
