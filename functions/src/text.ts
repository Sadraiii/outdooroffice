const SPORT_LABEL: Record<string, string> = {
  calisthenics: 'Calisthenics', fitness: 'Fitness', lob: 'Løb', cykling: 'Cykling', gang: 'Gåtur',
  yoga: 'Yoga', vinterbadning: 'Vinterbadning', socialt: 'Socialt', andet: 'Andet',
};
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS_S = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const sportLabel = (s?: string) => SPORT_LABEL[s || ''] || 'Andet';

const nf = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });
export const fmt = (n: number | undefined) => nf.format(Number(n) || 0);

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

export function formatPace(km: number, sec: number): string {
  const p = Math.round(sec / km);
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')} /km`;
}

export interface ActivityLike {
  sport?: string; title?: string; distanceKm?: number; durationSec?: number;
  reps?: { name: string; count: number; unit?: string }[];
}

const repLines = (a: ActivityLike) =>
  (Array.isArray(a.reps) ? a.reps : []).filter((r) => r && typeof r.name === 'string' && typeof r.count === 'number');

export function didPhrase(a: ActivityLike): string {
  const km = a.distanceKm ? `${fmt(a.distanceKm)} km` : '';
  const dur = a.durationSec ? formatDuration(a.durationSec) : '';
  switch (a.sport) {
    case 'lob': return km ? `løb ${km}` : 'var ude at løbe';
    case 'cykling': return km ? `cyklede ${km}` : 'var ude at cykle';
    case 'gang': return km ? `gik ${km}` : 'var på gåtur';
    case 'yoga': return dur ? `lavede yoga i ${dur}` : 'lavede yoga';
    case 'vinterbadning': return 'vinterbadede';
    case 'calisthenics':
    case 'fitness': {
      const total = repLines(a).filter((r) => !r.unit || r.unit === 'reps').reduce((s, r) => s + (r.count || 0), 0);
      return total ? `lavede ${fmt(total)} reps ${sportLabel(a.sport).toLowerCase()}` : `trænede ${sportLabel(a.sport).toLowerCase()}`;
    }
    default: return 'delte en træning';
  }
}

export function activityBody(a: ActivityLike): string {
  const parts: string[] = [];
  const reps = repLines(a);
  if (typeof a.title === 'string' && a.title) parts.push(a.title);
  if (typeof a.durationSec === 'number' && a.durationSec > 0) parts.push(formatDuration(a.durationSec));
  if (typeof a.distanceKm === 'number' && a.distanceKm > 0 && typeof a.durationSec === 'number' && a.durationSec > 0 && a.sport !== 'cykling') parts.push(formatPace(a.distanceKm, a.durationSec));
  if (!a.distanceKm && reps.length) parts.push(reps.slice(0, 3).map((r) => `${fmt(r.count)} ${r.name.toLowerCase()}`).join(', '));
  return parts.join(' · ');
}

export function whenText(date: string, time: string, todayYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return '';
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayYmd)!;
  const diff = Math.round((d - Date.UTC(+t[1], +t[2] - 1, +t[3])) / 864e5);
  const wd = DAYS[new Date(d).getUTCDay()];
  const day = diff === 0 ? 'i dag' : diff === 1 ? 'i morgen' : diff > 1 && diff < 7 ? wd : `${wd} ${+m[3]}. ${MONTHS_S[+m[2] - 1]}`;
  return day + (time ? ` kl. ${time}` : '');
}

export function todayInDenmark(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function excerpt(s: string, n = 110): string {
  const chars = Array.from(s);
  return chars.length > n ? chars.slice(0, n - 1).join('').trimEnd() + '…' : s;
}

export function storageObject(url: unknown): { bucket: string; name: string } | null {
  if (typeof url !== 'string') return null;
  const m = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/?#]+)\/o\/([^/?#]+)/.exec(url);
  if (!m) return null;
  try { return { bucket: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]) }; } catch { return null; }
}
