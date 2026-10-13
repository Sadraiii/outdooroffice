import type { EventDoc } from '../api/types';
import { fmt } from './format';
import { addDays, danishTime, hasTime } from './time';

const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const enc = new TextEncoder();
function fold(line: string): string {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of Array.from(line)) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function eventIcs(ev: EventDoc, appUrl: string): string {
  const link = `${appUrl}/e/${ev.id}`;
  let when: string[];
  if (hasTime(ev.time)) {
    const s = danishTime(ev.date, ev.time) ?? Date.now();
    when = [`DTSTART:${stamp(s)}`, `DTEND:${stamp(s + (ev.duration || 60) * 60e3)}`];
  } else {
    when = [`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(ev.date, 1).replace(/-/g, '')}`];
  }
  const program = ev.exercises.map((x) => `${x.name} ${fmt(x.target)} ${x.unit}`).join(', ');
  const desc = [ev.official ? 'OFFICIAL EVENT' : 'COMMUNITY MADE EVENT', program && `Program: ${program}`, ev.note, link].filter(Boolean).join('\n\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Outdoor Office//Kalender//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ev.id}@outdoor-office`, `DTSTAMP:${stamp(Date.now())}`, ...when,
    `SUMMARY:${esc(ev.title)}`, ...(ev.place ? [`LOCATION:${esc(ev.place)}`] : []), `DESCRIPTION:${esc(desc)}`, `URL:${link}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(ev: EventDoc) {
  const blob = new Blob([eventIcs(ev, location.origin)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${ev.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'event'}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
