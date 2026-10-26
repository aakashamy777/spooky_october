'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOfrendaHtml, escapeHtml, safePhotoUrl, fileSlug } = require('../public/ofrenda.js');

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

const sample = {
  name: 'Nani',
  relation: 'my grandmother',
  years: '1941 to 2023',
  title: 'Remembering Nani',
  text: 'I remember the mithai.\n\nShe lit the lamps.',
  items: ['mithai', 'Rafi songs'],
  photos: [{ url: jpeg, caption: 'On the porch' }],
  madeOn: '31 October 2026',
};

test('escapes anything that could become HTML', () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'y'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
});

test('a hostile name, text, caption and item never become real tags', () => {
  const html = buildOfrendaHtml({
    ...sample,
    name: '<img src=x onerror=alert(1)>',
    text: '</p><script>alert(2)</script>',
    items: ['<b>bold</b>'],
    photos: [{ url: jpeg, caption: '"><script>alert(3)</script>' }],
  });
  assert.ok(!html.includes('<script'), 'no script tag may appear');
  assert.ok(!html.includes('<img src=x'), 'no injected img');
  assert.ok(!html.includes('<b>bold</b>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the page has no scripts and makes no outside requests', () => {
  const html = buildOfrendaHtml(sample);
  assert.ok(!/<script/i.test(html));
  assert.ok(!/https?:\/\//i.test(html), 'no web addresses at all');
  assert.ok(!/<link[^>]+href/i.test(html));
  assert.ok(!/url\((?!['"]?data:)/i.test(html));
});

test('the writer\'s words and items are in the page', () => {
  const html = buildOfrendaHtml(sample);
  assert.ok(html.includes('<h1>Nani</h1>'));
  assert.ok(html.includes('my grandmother'));
  assert.ok(html.includes('<p>I remember the mithai.</p>'));
  assert.ok(html.includes('<p>She lit the lamps.</p>'));
  assert.ok(html.includes('Rafi songs'));
  assert.ok(html.includes('On the porch'));
  assert.ok(html.includes('31 October 2026'));
});

test('optional parts are left out when empty', () => {
  const html = buildOfrendaHtml({ name: 'Nani', text: 'Hello.' });
  assert.ok(!html.includes('On the ofrenda'));
  assert.ok(!html.includes('class="details"'));
  assert.ok(!html.includes('<figure'));
});

test('only JPEG data URLs made by this app are allowed as photos', () => {
  assert.equal(safePhotoUrl(jpeg), jpeg);
  assert.equal(safePhotoUrl('https://example.com/a.jpg'), '');
  assert.equal(safePhotoUrl('javascript:alert(1)'), '');
  assert.equal(safePhotoUrl('data:text/html;base64,PHNjcmlwdD4='), '');
  const html = buildOfrendaHtml({ ...sample, photos: [{ url: 'https://example.com/a.jpg', caption: 'x' }] });
  assert.ok(!html.includes('example.com'));
  assert.ok(!html.includes('<figure'));
});

test('file names are safe', () => {
  assert.equal(fileSlug('Nani'), 'nani');
  assert.equal(fileSlug('José María'), 'jose-maria');
  assert.equal(fileSlug('../../etc/passwd'), 'etc-passwd');
  assert.equal(fileSlug('   '), 'remembrance');
  assert.equal(fileSlug('🕯️'), 'remembrance');
});
