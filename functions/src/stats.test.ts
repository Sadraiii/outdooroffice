import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, currentStreak, earnedBadges, weekIndex, weeksAway } from './stats';

test('weeks start on Monday', () => {
  assert.equal(weekIndex('2026-10-11'), weekIndex('2026-10-05'));
  assert.equal(weekIndex('2026-10-12'), weekIndex('2026-10-11') + 1);
  assert.equal(weekIndex('2027-01-04'), weekIndex('2026-12-28') + 1);
});

test('weeks in a row, best run and the rest', () => {
  const s = computeStats([
    { date: '2026-09-01', time: '06:30', sport: 'fitness' },
    { date: '2026-09-09', time: '17:30', sport: 'calisthenics' },
    { date: '2026-09-10', time: '07:00', sport: 'vinterbadning' },
    { date: '2026-09-16', time: '', sport: 'lob' },
    { date: '2026-09-30', time: '17:30', sport: 'calisthenics' },
    { date: '2026-10-07', time: '17:30', sport: 'socialt' },
  ]);
  assert.equal(s.trainings, 6);
  assert.equal(s.bestStreak, 3);
  assert.equal(s.streak, 2);
  assert.equal(s.lastWeek, weekIndex('2026-10-07'));
  assert.equal(s.mornings, 2);
  assert.equal(s.winter, 1);
  assert.equal(s.sports, 4);
  assert.equal(s.lastDate, '2026-10-07');
  assert.equal(s.weeks[String(weekIndex('2026-09-09'))], 2);
  assert.equal(Object.keys(s.weeks).length, 5);
});

test('weeks away from training', () => {
  const s = computeStats([{ date: '2026-09-16' }]);
  assert.equal(weeksAway(s, '2026-09-17'), 0);
  assert.equal(weeksAway(s, '2026-10-08'), 3);
  assert.equal(weeksAway(null, '2026-10-08'), null);
});

test('the streak survives the current week and ends after a whole week off', () => {
  const s = computeStats([{ date: '2026-09-30' }, { date: '2026-10-07' }]);
  assert.equal(currentStreak(s, '2026-10-08'), 2);
  assert.equal(currentStreak(s, '2026-10-14'), 2);
  assert.equal(currentStreak(s, '2026-10-19'), 0);
  assert.equal(currentStreak(null, '2026-10-19'), 0);
});

test('badges follow the numbers', () => {
  const visits = Array.from({ length: 10 }, (_, i) => ({ date: `2026-0${7 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`, time: '06:45', sport: 'fitness' }));
  const ids = earnedBadges(computeStats(visits));
  assert.ok(ids.includes('first') && ids.includes('t10') && ids.includes('early'));
  assert.ok(!ids.includes('t25') && !ids.includes('winter'));
  assert.deepEqual(earnedBadges(computeStats([])), []);
});

test('more badges: three in a week, weekends, evenings, comebacks, seasons and kinds of training', () => {
  const s = computeStats([
    { date: '2026-01-10', time: '10:00', sport: 'lob' },
    { date: '2026-04-15', time: '19:30', sport: 'calisthenics' },
    { date: '2026-04-16', time: '20:00', sport: 'calisthenics' },
    { date: '2026-04-18', time: '09:00', sport: 'lob' },
    { date: '2026-07-05', time: '09:00', sport: 'fitness' },
    { date: '2026-10-07', time: '17:30', sport: 'calisthenics' },
  ]);
  assert.equal(s.bestWeek, 3);
  assert.equal(s.weekends, 3);
  assert.equal(s.evenings, 2);
  assert.equal(s.comebacks, 3);
  assert.equal(s.seasons, 4);
  assert.deepEqual(s.bySport, { lob: 2, calisthenics: 3, fitness: 1 });
  const ids = earnedBadges(s);
  for (const id of ['first', 't5', 'hattrick', 'seasons', 'comeback']) assert.ok(ids.includes(id), id);
  for (const id of ['t10', 'weekend', 'evening', 'runner', 'bars']) assert.ok(!ids.includes(id), id);
});

test('stats saved before a field existed count as zero', () => {
  const old = { trainings: 12, streak: 2, bestStreak: 5, lastWeek: 1, mornings: 0, winter: 0, sports: 1, lastDate: '', weeks: {} } as unknown as Parameters<typeof earnedBadges>[0];
  assert.deepEqual(earnedBadges(old), ['first', 't5', 't10', 'w4']);
});
