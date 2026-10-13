import type { EventDoc } from '../api/types';
import { pad } from './format';

export const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const DAYS_S = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
export const MONTHS_S = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());

export function dateOf(s: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function startOf(ev: Pick<EventDoc, 'date' | 'time'>): Date | null {
  const d = dateOf(ev.date);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(ev.time || '');
  if (m) d.setHours(+m[1], +m[2], 0, 0);
  return d;
}
export function dayDiff(s: string): number {
  const d = dateOf(s);
  if (!d) return 0;
  const t = new Date();
  return Math.round((d.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 864e5);
}
export const sortKey = (ev: Pick<EventDoc, 'date' | 'time'>) => (ev.date || '9999-99-99') + ' ' + (ev.time || '99:99');
export const bySort = (a: EventDoc, b: EventDoc) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);
export const isPast = (ev: Pick<EventDoc, 'date'>) => (ev.date || '') < todayStr();

export function longDate(ev: Pick<EventDoc, 'date'>): string {
  const d = dateOf(ev.date);
  return d ? `${cap(DAYS[d.getDay()])} ${d.getDate()}. ${MONTHS[d.getMonth()]}` : 'Dato ikke sat';
}
export function relDay(ev: Pick<EventDoc, 'date'>): string {
  const d = dateOf(ev.date);
  if (!d) return '';
  const dd = dayDiff(ev.date);
  if (dd === 0) return 'i dag';
  if (dd === 1) return 'i morgen';
  if (dd === -1) return 'i går';
  if (dd > 1 && dd < 7) return DAYS[d.getDay()];
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_S[d.getMonth()]}`;
}
export function endTime(ev: Pick<EventDoc, 'time' | 'duration'>): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(ev.time || '');
  if (!m || !ev.duration) return '';
  const t = (+m[1] * 60 + +m[2] + ev.duration) % (24 * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
export const timeSpan = (ev: Pick<EventDoc, 'time' | 'duration'>) => (ev.time ? (endTime(ev) ? `${ev.time}–${endTime(ev)}` : ev.time) : '');

export const whenText = (ev: Pick<EventDoc, 'date' | 'time'>) => `${relDay(ev)}${ev.time ? ' kl. ' + ev.time : ''}`;

export function status(ev: Pick<EventDoc, 'date' | 'time'>): { txt: string; cls: '' | 'soon' | 'live' | 'past' } {
  const dd = dayDiff(ev.date);
  if (dd < 0) return { txt: 'Afsluttet', cls: 'past' };
  if (dd === 0) {
    const st = startOf(ev);
    if (ev.time && st) {
      const diff = st.getTime() - Date.now();
      if (diff > 0) {
        const h = Math.floor(diff / 36e5), m = Math.max(1, Math.floor((diff % 36e5) / 6e4));
        return { txt: h ? `Om ${h} t ${m} min` : `Om ${m} min`, cls: 'soon' };
      }
      if (diff > -3 * 36e5) return { txt: 'I gang nu', cls: 'live' };
    }
    return { txt: 'I dag', cls: 'soon' };
  }
  if (dd === 1) return { txt: 'I morgen', cls: '' };
  return { txt: `Om ${dd} dage`, cls: '' };
}

export function deadlineText(ms: number): string {
  const d = new Date(ms);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dd = dayDiff(ymd(d));
  const day = dd === 0 ? 'i dag' : dd === 1 ? 'i morgen' : `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS_S[d.getMonth()]}`;
  return `${day} kl. ${t}`;
}

export function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'lige nu';
  if (s < 3600) return `for ${Math.floor(s / 60)} min siden`;
  if (s < 86400) return `for ${Math.floor(s / 3600)} t siden`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'i går';
  if (d < 7) return `for ${d} dage siden`;
  const dt = new Date(ts);
  return `${dt.getDate()}. ${MONTHS[dt.getMonth()]}`;
}
