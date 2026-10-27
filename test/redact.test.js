'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('../lib/redact');

test('a command with nothing secret comes back unchanged', () => {
  const result = redact('git commit -m "fix the login page" && mkdir -p build/out');
  assert.equal(result.text, 'git commit -m "fix the login page" && mkdir -p build/out');
  assert.equal(result.hidden, 0);
});

test('secret-looking environment assignments are hidden', () => {
  assert.equal(redact('API_KEY=abc123 node app.js').text, 'API_KEY=[hidden] node app.js');
  assert.equal(redact('export DB_PASSWORD="my pass word"').text, 'export DB_PASSWORD=[hidden]');
  assert.equal(redact("GITHUB_TOKEN='x y' gh pr list").text, 'GITHUB_TOKEN=[hidden] gh pr list');
});

test('plain environment assignments are left alone', () => {
  assert.equal(redact('NODE_ENV=production node app.js').text, 'NODE_ENV=production node app.js');
  assert.equal(redact('PORT=3000 npm start').text, 'PORT=3000 npm start');
});

test('long flags that carry a secret are hidden, with = or a space', () => {
  assert.equal(redact('tool --password hunter2 --verbose').text, 'tool --password [hidden] --verbose');
  assert.equal(redact('tool --token=abc.def').text, 'tool --token=[hidden]');
  assert.equal(redact('tool --api-key "abc def"').text, 'tool --api-key [hidden]');
});

test('curl -u, sshpass -p and mysql -p are hidden', () => {
  assert.equal(redact('curl -u admin:s3cret https://example.com').text, 'curl -u [hidden] https://example.com');
  assert.equal(redact('sshpass -p topsecret ssh me@host').text, 'sshpass -p [hidden] ssh me@host');
  assert.equal(redact('mysql -u root -pS3cret mydb').text, 'mysql -u root -p[hidden] mydb');
});

test('mkdir -p and other harmless -p flags are not touched', () => {
  assert.equal(redact('mkdir -p a/b/c').text, 'mkdir -p a/b/c');
  assert.equal(redact('cp -p one two').text, 'cp -p one two');
});

test('a word that only contains a secret word inside it is not a secret name', () => {
  assert.equal(redact('PASSENGER_COUNT=4 ./run').text, 'PASSENGER_COUNT=4 ./run');
});

test('credentials inside a URL are hidden but the host stays', () => {
  assert.equal(
    redact('git clone https://me:ghpass@github.com/me/repo.git').text,
    'git clone https://[hidden]@github.com/me/repo.git',
  );
  assert.equal(redact('curl https://example.com/a:b').text, 'curl https://example.com/a:b');
});

test('Authorization headers are hidden', () => {
  assert.equal(
    redact('curl -H "Authorization: Bearer abc.def.ghi" https://api.example.com').text,
    'curl -H "Authorization: Bearer [hidden]" https://api.example.com',
  );
  assert.equal(redact("curl -H 'Authorization: Basic dXNlcjpwYXNz' x").text, "curl -H 'Authorization: Basic [hidden]' x");
});

test('well-known token shapes are hidden wherever they appear', () => {
  const github = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4';
  const openai = 'sk-' + 'abcdefghijklmnopqrstuvwx';
  const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  assert.equal(redact(`echo ${github}`).text, 'echo [hidden]');
  assert.equal(redact(`echo ${openai}`).text, 'echo [hidden]');
  assert.equal(redact(`echo ${aws}`).text, 'echo [hidden]');
});

test('a JSON web token is hidden', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijk';
  assert.equal(redact(`curl --data ${jwt} x`).text, 'curl --data [hidden] x');
});

test('the number of hidden secrets is counted', () => {
  const result = redact('API_KEY=a SECRET_TOKEN=b run --password c');
  assert.equal(result.hidden, 3);
});

test('odd input does not crash', () => {
  assert.equal(redact(undefined).text, '');
  assert.equal(redact(null).text, '');
  assert.equal(redact(42).text, '42');
});
