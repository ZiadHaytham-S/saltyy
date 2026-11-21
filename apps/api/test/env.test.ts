import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseEnvironment } from '../src/config/env.js';

test('invalid configuration fails without exposing its values', () => {
  assert.throws(
    () => parseEnvironment({ API_PORT: '99999', MONGODB_URI: 'private-value' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /API_PORT/);
      assert.match(error.message, /MONGODB_URI/);
      assert.doesNotMatch(error.message, /private-value/);
      return true;
    },
  );
});
test('CSRF key and production HTTPS origin are mandatory and malformed origins fail cleanly', () => {
  const key = randomBytes(32).toString('hex');
  assert.throws(
    () => parseEnvironment({ CSRF_SECRET: key, APP_ORIGIN: 'invalid-origin' }),
    /Invalid environment fields: APP_ORIGIN/,
  );
  assert.throws(
    () =>
      parseEnvironment({
        NODE_ENV: 'production',
        CSRF_SECRET: key,
        APP_ORIGIN: 'http://127.0.0.1:3000',
      }),
    /APP_ORIGIN/,
  );
  assert.throws(() => parseEnvironment({ CSRF_SECRET: '' }), /CSRF_SECRET/);
  assert.equal(
    parseEnvironment({
      NODE_ENV: 'production',
      CSRF_SECRET: key,
      APP_ORIGIN: 'https://sallty.example',
    }).APP_ORIGIN,
    'https://sallty.example',
  );
});
