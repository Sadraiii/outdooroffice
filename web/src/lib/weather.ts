import type { EventDoc, Forecast, GeoPlace } from '../api/types';
import { danishTime, hasTime } from './time';

export type WeatherIcon = 'w-sun' | 'w-moon' | 'w-partly' | 'w-partly-moon' | 'w-cloud' | 'w-fog' | 'w-drizzle' | 'w-rain' | 'w-snow' | 'w-thunder';

export function describe(code: number, night = false): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: 'Klart', icon: night ? 'w-moon' : 'w-sun' };
  if (code === 1) return { label: 'Mest klart', icon: night ? 'w-partly-moon' : 'w-partly' };
  if (code === 2) return { label: 'Let skyet', icon: night ? 'w-partly-moon' : 'w-partly' };
  if (code === 3) return { label: 'Overskyet', icon: 'w-cloud' };
  if (code === 45 || code === 48) return { label: 'Tåge', icon: 'w-fog' };
  if (code >= 51 && code <= 55) return { label: 'Støvregn', icon: 'w-drizzle' };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { label: 'Isslag', icon: 'w-drizzle' };
  if (code === 61 || code === 80) return { label: 'Let regn', icon: 'w-rain' };
  if (code === 63 || code === 81) return { label: 'Regn', icon: 'w-rain' };
  if (code === 65 || code === 82) return { label: 'Kraftig regn', icon: 'w-rain' };
  if (code === 71 || code === 85) return { label: 'Let sne', icon: 'w-snow' };
  if (code === 73 || code === 75 || code === 77 || code === 86) return { label: 'Sne', icon: 'w-snow' };
  if (code >= 95) return { label: 'Torden', icon: 'w-thunder' };
  return { label: 'Skiftende', icon: 'w-cloud' };
}

const LIGHT: [number, number][] = [[8.6, 16.1], [7.8, 17.1], [6.6, 18.2], [6.4, 20.2], [5.2, 21.1], [4.5, 21.9], [4.8, 21.7], [5.8, 20.6], [6.9, 19.3], [7.9, 18.1], [7.8, 16.2], [8.6, 15.7]];
function isDark(date: string, time: string): boolean {
  const [h, m] = time.split(':').map(Number);
  const [rise, set] = LIGHT[Math.max(0, Math.min(11, Number(date.slice(5, 7)) - 1))];
  const t = h + m / 60;
  return t < rise || t > set;
}

export interface EventWeather {
  kind: 'hour' | 'day';
  temp: number;
  min: number;
  max: number;
  feels: number;
  code: number;
  pop: number;
  wind: number;
  label: string;
  icon: WeatherIcon;
}

export function weatherFor(ev: Pick<EventDoc, 'date' | 'time'>, f: Forecast | null): EventWeather | null {
  if (!f) return null;
  if (hasTime(ev.time)) {
    const start = danishTime(ev.date, ev.time);
    if (start === null) return null;
    const hour = Math.floor(start / 3600e3) * 3600e3;
    const h = f.hours.find((x) => x.t === hour);
    if (!h) return null;
    const d = describe(h.code, isDark(ev.date, ev.time));
    return { kind: 'hour', temp: h.temp, min: h.temp, max: h.temp, feels: h.feels, code: h.code, pop: h.pop, wind: h.wind, ...d };
  }
  const day = f.days.find((x) => x.date === ev.date);
  if (!day) return null;
  return { kind: 'day', temp: day.max, min: day.min, max: day.max, feels: day.max, code: day.code, pop: day.pop, wind: day.wind, ...describe(day.code) };
}

export const deg = (n: number) => `${Math.round(n)}°`;

export function shortWeather(w: EventWeather): string {
  return w.kind === 'day' ? `${Math.round(w.min)}–${deg(w.max)}` : deg(w.temp);
}

export function weatherDetail(w: EventWeather): string {
  const parts = [w.label];
  if (w.pop >= 20 && w.code < 51) parts.push(`${Math.round(w.pop)} % risiko for nedbør`);
  else if (w.pop >= 20) parts.push(`${Math.round(w.pop)} % sandsynlighed`);
  parts.push(`${Math.round(w.wind)} m/s`);
  if (w.kind === 'hour' && Math.round(w.feels) <= Math.round(w.temp) - 3) parts.push(`føles som ${deg(w.feels)}`);
  return parts.join(' · ');
}

export function parseForecast(j: unknown): Forecast {
  const o = (j || {}) as { hourly?: Record<string, (number | string | null)[]>; daily?: Record<string, (number | string | null)[]> };
  const h = o.hourly || {}, d = o.daily || {};
  const n = (a: (number | string | null)[] | undefined, i: number, dflt = 0) => (a && typeof a[i] === 'number' ? (a[i] as number) : dflt);
  const hours = ((h.time || []) as string[]).map((t, i) => ({
    t: typeof t === 'string' ? danishTime(t.slice(0, 10), t.slice(11, 16)) ?? 0 : 0,
    temp: n(h.temperature_2m, i, Number.NaN), feels: n(h.apparent_temperature, i, n(h.temperature_2m, i)), code: n(h.weather_code, i),
    pop: n(h.precipitation_probability, i), wind: n(h.wind_speed_10m, i),
  })).filter((x) => x.t > 0 && Number.isFinite(x.temp));
  const days = ((d.time || []) as string[]).map((date, i) => ({
    date: String(date), max: n(d.temperature_2m_max, i, Number.NaN), min: n(d.temperature_2m_min, i, Number.NaN), code: n(d.weather_code, i),
    pop: n(d.precipitation_probability_max, i), wind: n(d.wind_speed_10m_max, i),
  })).filter((x) => Number.isFinite(x.max) && Number.isFinite(x.min));
  return { hours, days, fetchedAt: Date.now() };
}

export const forecastUrl = (p: GeoPlace) => 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}`
  + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
  + '&wind_speed_unit=ms&timezone=Europe%2FCopenhagen&forecast_days=16&past_days=7';

export const placesUrl = (q: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=8&language=da&format=json`;

export function parsePlaces(j: unknown): GeoPlace[] {
  const list = ((j as { results?: unknown[] } | null)?.results || []) as { name?: string; latitude?: number; longitude?: number; admin1?: string; country?: string; country_code?: string }[];
  return list
    .filter((x) => typeof x.name === 'string' && typeof x.latitude === 'number' && typeof x.longitude === 'number')
    .sort((a, b) => Number(b.country_code === 'DK') - Number(a.country_code === 'DK'))
    .map((x) => ({ name: x.name!.slice(0, 60), lat: x.latitude!, lon: x.longitude!, region: [x.admin1, x.country_code === 'DK' ? '' : x.country].filter(Boolean).join(', ') }));
}
