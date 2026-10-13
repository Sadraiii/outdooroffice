import { addDays, danishTime, hasTime } from './time';

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  duration?: number | null;
  place: string;
  note: string;
  official: boolean;
  cancelled?: boolean;
  cancelNote?: string;
  exercises?: { name: string; target: number; unit: string }[];
  createdAt?: number;
  updatedAt?: number;
  waiting?: boolean;
}

const nf = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });

export function escapeText(s: string): string {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of Array.from(line)) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateValue = (date: string) => date.replace(/-/g, '');

export function buildCalendar(o: { name: string; events: CalEvent[]; appUrl: string; now: number }): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Outdoor Office//Kalender//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(o.name)}`, 'X-WR-TIMEZONE:Europe/Copenhagen',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of o.events) {
    const link = o.appUrl ? `${o.appUrl}/e/${e.id}` : '';
    let start: string[], end: string[];
    if (hasTime(e.time)) {
      const s = danishTime(e.date, e.time);
      if (s === null) continue;
      start = [`DTSTART:${stamp(s)}`]; end = [`DTEND:${stamp(s + (e.duration && e.duration >= 10 ? e.duration : 60) * 60_000)}`];
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
      start = [`DTSTART;VALUE=DATE:${dateValue(e.date)}`]; end = [`DTEND;VALUE=DATE:${dateValue(addDays(e.date, 1))}`];
    }
    const program = (e.exercises || []).map((x) => `${x.name} ${nf.format(x.target)} ${x.unit}`).join(', ');
    const desc = [
      e.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT',
      e.cancelled ? `Aflyst${e.cancelNote ? `: ${e.cancelNote}` : ''}` : '',
      e.waiting ? 'Du er på ventelisten.' : '',
      program ? `Program: ${program}` : '',
      e.note,
      link,
    ].filter(Boolean).join('\n\n');
    const summary = e.title + (e.cancelled ? ' (aflyst)' : e.waiting ? ' (venteliste)' : '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@outdoor-office`,
      `DTSTAMP:${stamp(o.now)}`,
      ...start, ...end,
      `SUMMARY:${escapeText(summary)}`,
      ...(e.place ? [`LOCATION:${escapeText(e.place)}`] : []),
      `DESCRIPTION:${escapeText(desc)}`,
      ...(link ? [`URL:${link}`] : []),
      `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      ...(e.updatedAt || e.createdAt ? [`LAST-MODIFIED:${stamp(e.updatedAt || e.createdAt || o.now)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
