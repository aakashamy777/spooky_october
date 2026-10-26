'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRemember, LIMITS } = require('../lib/validate');

const jpeg = '/9j/4AAQSkZJRgABAQ'; // the start of a real JPEG in base64

test('needs a name', () => {
  const result = validateRemember({ name: '   ', memories: ['hello'] });
  assert.equal(result.ok, false);
});

test('needs at least one memory or photo', () => {
  const result = validateRemember({ name: 'Nani', memories: ['  ', ''] });
  assert.equal(result.ok, false);
});

test('a name and one memory is enough, and text is trimmed', () => {
  const result = validateRemember({ name: '  Nani ', memories: [' She sang. '] });
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Nani');
  assert.deepEqual(result.value.memories, ['She sang.']);
});

test('a photo alone is enough', () => {
  const result = validateRemember({ name: 'Nani', photos: [{ data: jpeg, caption: ' on the porch ' }] });
  assert.equal(result.ok, true);
  assert.equal(result.value.photos[0].caption, 'on the porch');
});

test('long text is cut to the limit and control characters are removed', () => {
  const result = validateRemember({
    name: 'A'.repeat(500),
    memories: ['x\u0000y' + 'z'.repeat(1000)],
  });
  assert.equal(result.value.name.length, LIMITS.name);
  assert.ok(!result.value.memories[0].includes('\u0000'));
  assert.equal(result.value.memories[0].length, LIMITS.memory);
});

test('too many memories or photos are refused', () => {
  const memories = Array.from({ length: LIMITS.memories + 1 }, (_, i) => `m${i}`);
  assert.equal(validateRemember({ name: 'N', memories }).ok, false);
  const photos = Array.from({ length: LIMITS.photos + 1 }, () => ({ data: jpeg }));
  assert.equal(validateRemember({ name: 'N', photos }).ok, false);
});

test('photos must be JPEG base64 without a data: prefix', () => {
  assert.equal(validateRemember({ name: 'N', photos: [{ data: 'data:image/jpeg;base64,' + jpeg }] }).ok, false);
  assert.equal(validateRemember({ name: 'N', photos: [{ data: 'iVBORw0KGgo=' }] }).ok, false); // a PNG
  assert.equal(validateRemember({ name: 'N', photos: [{ data: '<script>' }] }).ok, false);
});

test('wrong types are refused, not crashed on', () => {
  assert.equal(validateRemember(null).ok, false);
  assert.equal(validateRemember({ name: 'N', memories: 'a string' }).ok, false);
  assert.equal(validateRemember({ name: 'N', memories: ['ok'], photos: 'nope' }).ok, false);
  assert.equal(validateRemember({ name: 5, memories: ['ok'] }).ok, false);
});
