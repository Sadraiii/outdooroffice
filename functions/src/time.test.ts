import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, checkinWindow, danishTime, feedbackAt, reminderAt, startOf } from './time';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

test('Danish summer and winter time', () => {
  assert.equal(iso(danishTime('2026-10-14', '17:30')), '2026-10-14T15:30:00.000Z');
  assert.equal(iso(danishTime('2026-12-01', '07:00')), '2026-12-01T06:00:00.000Z');
  assert.equal(iso(danishTime('2026-03-29', '01:30')), '2026-03-29T00:30:00.000Z');
  assert.equal(iso(danishTime('2026-03-29', '03:30')), '2026-03-29T01:30:00.000Z');
  assert.equal(iso(danishTime('2026-10-25', '09:00')), '2026-10-25T08:00:00.000Z');
  assert.equal(danishTime('nope', '10:00'), null);
});

test('adding days across months and years', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('check-in window: 30 minutes before to 6 hours after, or the whole day', () => {
  const w = checkinWindow('2026-10-14', '17:30')!;
  assert.equal(iso(w.from), '2026-10-14T15:00:00.000Z');
  assert.equal(iso(w.until), '2026-10-14T21:30:00.000Z');
  const d = checkinWindow('2026-10-14', '')!;
  assert.equal(iso(d.from), '2026-10-13T22:00:00.000Z');
  assert.equal(iso(d.until), '2026-10-14T21:59:59.999Z');
});

test('reminders: 2 hours before, or the evening before early events', () => {
  assert.equal(iso(reminderAt('2026-10-14', '17:30')), '2026-10-14T13:30:00.000Z');
  assert.equal(iso(reminderAt('2026-10-14', '09:00')), '2026-10-14T05:00:00.000Z');
  assert.equal(iso(reminderAt('2026-10-16', '06:30')), '2026-10-15T18:00:00.000Z');
  assert.equal(iso(reminderAt('2026-10-16', '08:59')), '2026-10-15T18:00:00.000Z');
  assert.equal(iso(reminderAt('2026-10-17', '')), '2026-10-17T06:00:00.000Z');
});

test('weather time is midday for events without a time', () => {
  assert.equal(iso(startOf('2026-12-01', '')), '2026-12-01T11:00:00.000Z');
});

test('asking how it went: 2½ hours after, but never late in the evening', () => {
  assert.equal(iso(feedbackAt('2026-10-14', '17:30')), '2026-10-14T18:00:00.000Z');
  assert.equal(iso(feedbackAt('2026-10-14', '19:30')), '2026-10-15T07:00:00.000Z');
  assert.equal(iso(feedbackAt('2026-10-17', '')), '2026-10-17T17:00:00.000Z');
});
