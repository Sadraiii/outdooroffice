import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateSeats } from './seats';

test('without a limit everybody has a seat', () => {
  assert.deepEqual(allocateSeats(['a', 'b', 'c'], [], null), { going: ['a', 'b', 'c'], waitlist: [] });
});

test('first come, first served, the rest wait in order', () => {
  assert.deepEqual(allocateSeats(['a', 'b', 'c', 'd'], [], 2), { going: ['a', 'b'], waitlist: ['c', 'd'] });
});

test('a cancellation gives the first on the waitlist a seat', () => {
  assert.deepEqual(allocateSeats(['a', 'c', 'd'], ['a', 'b'], 2), { going: ['a', 'c'], waitlist: ['d'] });
});

test('lowering the limit never takes a seat away', () => {
  assert.deepEqual(allocateSeats(['a', 'b', 'c', 'd'], ['a', 'b', 'c'], 2), { going: ['a', 'b', 'c'], waitlist: ['d'] });
});

test('raising the limit moves people up from the waitlist', () => {
  assert.deepEqual(allocateSeats(['a', 'b', 'c', 'd'], ['a', 'b'], 3), { going: ['a', 'b', 'c'], waitlist: ['d'] });
});
