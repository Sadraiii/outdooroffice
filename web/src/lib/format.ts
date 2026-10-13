const nf = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 });

export const fmt = (n: number | undefined | null) => nf.format(Number(n) || 0);
export const fmt1 = (n: number | undefined | null) => nf1.format(Number(n) || 0);
export const pad = (n: number) => String(n).padStart(2, '0');

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function formatPace(km: number, sec: number): string {
  if (!km || !sec) return '–';
  const p = Math.round(sec / km);
  return `${Math.floor(p / 60)}:${pad(p % 60)} /km`;
}

export function formatSpeed(km: number, sec: number): string {
  if (!km || !sec) return '–';
  return `${fmt1(km / (sec / 3600))} km/t`;
}

export function parseDuration(input: string): number | null {
  const t = input.trim().replace(',', '.').replace(/\s*min$/i, '');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function parseNumber(input: string): number | null {
  const v = parseFloat(String(input).trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export const initials = (name: string) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

export function cleanHandle(input: string): string {
  let h = String(input || '').trim();
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return h.replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
}

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
