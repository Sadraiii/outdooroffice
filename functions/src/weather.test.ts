import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeo, weatherPhrase, weatherWord } from './weather';

test('weather in words', () => {
  assert.equal(weatherWord(0), 'klart');
  assert.equal(weatherWord(61), 'let regn');
  assert.equal(weatherWord(95), 'torden');
  assert.equal(weatherPhrase({ temp: 8.6, code: 3, pop: 20, wind: 4 }), '9° og overskyet');
  assert.equal(weatherPhrase({ temp: -1.2, code: 71, pop: 70, wind: 9.4 }), '-1° og let sne, 9 m/s');
});

test('a place needs coordinates in range', () => {
  assert.ok(isGeo({ name: 'København', lat: 55.68, lon: 12.57 }));
  assert.ok(!isGeo({ lat: 'x', lon: 12 }));
  assert.ok(!isGeo({ lat: 120, lon: 12 }));
  assert.ok(!isGeo(null));
});
