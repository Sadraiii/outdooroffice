import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityBody, didPhrase, excerpt, storageObject, todayInDenmark, whenText } from './text';

test('run phrase and body', () => {
  assert.equal(didPhrase({ sport: 'lob', distanceKm: 8.2 }), 'løb 8,2 km');
  assert.equal(activityBody({ sport: 'lob', title: 'Morgenløb', distanceKm: 8.2, durationSec: 2530 }), 'Morgenløb · 42:10 · 5:09 /km');
});

test('calisthenics counts only reps', () => {
  assert.equal(didPhrase({ sport: 'calisthenics', reps: [{ name: 'Push-ups', count: 200 }, { name: 'Planke', count: 120, unit: 'sek' }] }), 'lavede 200 reps calisthenics');
});

test('relative day text', () => {
  assert.equal(whenText('2026-10-14', '17:30', '2026-10-14'), 'i dag kl. 17:30');
  assert.equal(whenText('2026-10-15', '', '2026-10-14'), 'i morgen');
  assert.equal(whenText('2026-10-18', '09:00', '2026-10-14'), 'søndag kl. 09:00');
  assert.equal(whenText('2026-10-28', '17:30', '2026-10-14'), 'onsdag 28. okt kl. 17:30');
});

test('Danish date at midnight UTC', () => {
  assert.equal(todayInDenmark(new Date(Date.UTC(2026, 9, 13, 23, 30))), '2026-10-14');
});

test('broken rep lines never break a push text', () => {
  const bad = { sport: 'calisthenics', reps: [null, { name: { x: 1 } }, { name: 'Dips', count: 30 }] } as never;
  assert.equal(didPhrase(bad), 'lavede 30 reps calisthenics');
  assert.equal(activityBody(bad), '30 dips');
});

test('storage download URLs map to the object path', () => {
  assert.deepEqual(
    storageObject('https://firebasestorage.googleapis.com/v0/b/oo.firebasestorage.app/o/activities%2Fu1%2Fi_abc.jpg?alt=media&token=t'),
    { bucket: 'oo.firebasestorage.app', name: 'activities/u1/i_abc.jpg' },
  );
  assert.equal(storageObject('https://example.com/x.jpg'), null);
  assert.equal(storageObject(undefined), null);
});

test('excerpts never split an emoji', () => {
  const s = 'Flot 💪'.repeat(40);
  const e = excerpt(s, 20);
  assert.equal(Array.from(e).length, 20);
  assert.ok(!/[\uD800-\uDBFF]$/.test(e.slice(0, -1)), 'no lone high surrogate before the ellipsis');
  assert.equal(excerpt('kort'), 'kort');
});
