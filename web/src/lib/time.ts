const TZ = 'Europe/Copenhagen';
const MIN = 60_000;
const HOUR = 60 * MIN;

export const hasTime = (time: unknown): time is string => typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time);

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function offsetAt(utcMs: number): number {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

export function danishTime(date: string, time = '00:00'): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const first = offsetAt(wall);
  const second = offsetAt(wall - first);
  return wall - (first === second ? first : second);
}

export function addDays(date: string, n: number): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return date;
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3] + n)).toISOString().slice(0, 10);
}

export function checkinWindow(date: string, time: string): { from: number; until: number } | null {
  if (hasTime(time)) {
    const start = danishTime(date, time);
    return start === null ? null : { from: start - 30 * MIN, until: start + 6 * HOUR };
  }
  const from = danishTime(date, '00:00');
  const next = danishTime(addDays(date, 1), '00:00');
  return from === null || next === null ? null : { from, until: next - 1 };
}

export function reminderAt(date: string, time: string): number | null {
  if (!hasTime(time)) return danishTime(date, '08:00');
  const [h, m] = time.split(':').map(Number);
  if (h * 60 + m - 120 >= 7 * 60) {
    const start = danishTime(date, time);
    return start === null ? null : start - 2 * HOUR;
  }
  return danishTime(addDays(date, -1), '20:00');
}

export function feedbackAt(date: string, time: string): number | null {
  if (!hasTime(time)) return danishTime(date, '19:00');
  const [h, m] = time.split(':').map(Number);
  if (h * 60 + m + 150 <= 21 * 60 + 30) {
    const start = danishTime(date, time);
    return start === null ? null : start + 150 * MIN;
  }
  return danishTime(addDays(date, 1), '09:00');
}

export function startOf(date: string, time: string): number | null {
  return danishTime(date, hasTime(time) ? time : '12:00');
}
