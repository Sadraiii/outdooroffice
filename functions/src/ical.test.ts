import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, escapeText, foldLine } from './ical';

test('text is escaped', () => {
  assert.equal(escapeText('Løb, kaffe; snak\nbagefter \\o/'), 'Løb\\, kaffe\\; snak\\nbagefter \\\\o/');
});

test('long lines are folded at 75 bytes without splitting letters', () => {
  const line = 'DESCRIPTION:' + 'æøå'.repeat(40);
  const folded = foldLine(line);
  for (const l of folded.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), line);
});

test('a calendar with a timed, an all-day and a cancelled event', () => {
  const ics = buildCalendar({
    name: 'Outdoor Office', appUrl: 'https://oo.web.app', now: Date.UTC(2026, 9, 11, 12),
    events: [
      { id: 'e1', title: 'Calisthenics', date: '2026-10-14', time: '17:30', place: 'Parken, ved havnen', note: '', official: true, exercises: [{ name: 'Push-ups', target: 200, unit: 'reps' }] },
      { id: 'e2', title: 'Pizza', date: '2026-10-17', time: '', place: '', note: 'Alle er velkomne', official: false },
      { id: 'e3', title: 'Bakkeløb', date: '2026-10-18', time: '09:00', duration: 90, place: 'Skoven', note: '', official: false, cancelled: true, cancelNote: 'Storm' },
    ],
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261014T153000Z\r\nDTEND:20261014T163000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261017\r\nDTEND;VALUE=DATE:20261018/);
  assert.match(ics, /DTSTART:20261018T070000Z\r\nDTEND:20261018T083000Z/);
  assert.match(ics, /LOCATION:Parken\\, ved havnen/);
  assert.match(ics, /SUMMARY:Bakkeløb \(aflyst\)\r\n/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /URL:https:\/\/oo.web.app\/e\/e1/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
});
