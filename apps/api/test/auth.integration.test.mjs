import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { SMTPServer } from 'smtp-server';
const messages = new Map();
const recoveryTokens = new Map();
function createSmtp() {
  return new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    onData(stream, session, callback) {
      let body = '';
      stream.on('data', (chunk) => {
        body += chunk.toString();
      });
      stream.on('end', () => {
        const code = body.replace(/=\r?\n/g, '').match(/>(\d{6})<\/p>/)?.[1];
        messages.set(session.envelope.rcptTo[0].address, code);
        const token = body
          .replace(/=\r?\n/g, '')
          .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          )
          .match(/\/reset-password#token=([A-Za-z0-9_-]{43})/)?.[1];
        if (token)
          recoveryTokens.set(session.envelope.rcptTo[0].address, token);
        callback();
      });
    },
  });
}
let smtp = createSmtp();
let smtpPort;

const origin = 'http://127.0.0.1:3100';
const secret = randomBytes(32).toString('hex');
const password = randomBytes(18).toString('base64url') + 'Aa1!';
const name = 'sallty_test_' + randomUUID().replaceAll('-', '');
const url = new URL(
  process.env.MONGODB_URI ??
    'mongodb://127.0.0.1:27017/sallty?replicaSet=rs0&directConnection=true',
);
url.pathname = '/' + name;
let server;
let serverOutput = '';
let port;
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve) => socket.close(resolve));
  return address.port;
}
function stop() {
  if (server && server.pid && server.exitCode === null) {
    if (process.platform === 'win32')
      spawnSync('taskkill.exe', ['/pid', String(server.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    else server.kill('SIGTERM');
  }
}
async function start(overrides = {}, readyStatus = 200) {
  serverOutput = '';
  server = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(port),
      API_HOST: '127.0.0.1',
      APP_ORIGIN: origin,
      CSRF_SECRET: secret,
      MONGODB_URI: url.toString(),
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      APPLICATION_EMAIL: 'sallty@example.test',
      APPLICATION_PASSWORD: '',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', (data) => {
    serverOutput = (serverOutput + data).slice(-3000);
  });
  server.stderr.on('data', (data) => {
    serverOutput = (serverOutput + data).slice(-3000);
  });
  for (let count = 0; count < 80; count++) {
    if (server.exitCode !== null)
      throw new Error('Test API exited: ' + serverOutput);
    try {
      if (
        (await fetch('http://127.0.0.1:' + port + '/ready')).status ===
        readyStatus
      )
        return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Test API startup timed out: ' + serverOutput);
}
class Browser {
  jar = new Map();
  get cookie() {
    return [...this.jar].map(([key, value]) => key + '=' + value).join('; ');
  }
  async request(path, method = 'GET', body, headers = {}) {
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const delimiter = pair.indexOf('=');
      const key = pair.slice(0, delimiter),
        value = pair.slice(delimiter + 1);
      if (value) this.jar.set(key, value);
      else this.jar.delete(key);
    }
    return { response, body: await response.json() };
  }
  async csrf() {
    const result = await this.request('/auth/csrf');
    assert.equal(result.response.status, 200);
    return result.body.csrfToken;
  }
  async write(path, body, method = 'POST', extra = {}) {
    const token = await this.csrf();
    return this.request(path, method, body, {
      Origin: origin,
      'X-CSRF-Token': token,
      ...extra,
    });
  }
}
test(
  'Authentication and tenant isolation against a real local replica set',
  { timeout: 120000 },
  async (t) => {
    const connection = mongoose.createConnection(url.toString(), {
      serverSelectionTimeoutMS: 5000,
    });
    const a = new Browser(),
      b = new Browser();
    const emailA = 'a-' + randomUUID() + '@example.test',
      emailB = 'b-' + randomUUID() + '@example.test';
    let aId, bId, storeA, storeB;
    try {
      await connection.asPromise();
      smtpPort = await freePort();
      await new Promise((resolve, reject) => {
        smtp.once('error', reject);
        smtp.listen(smtpPort, '127.0.0.1', resolve);
      });
      const db = connection.db;
      assert.ok(db);
      port = await freePort();
      await start();

      await t.test(
        'anonymous endpoints are guarded; strict validation rejects injection and weak password',
        async () => {
          assert.equal((await a.request('/auth/me')).response.status, 401);
          assert.equal(
            (await a.request('/merchant/store')).response.status,
            401,
          );
          const invalid = await a.write('/auth/register', {
            name: 'تاجر',
            email: { $ne: null },
            phone: '123',
            password: 'short',
            ownerId: 'forged',
          });
          assert.equal(invalid.response.status, 400);
          assert.equal(await db.collection('users').countDocuments(), 0);
        },
      );

      await t.test(
        'register normalizes email/phone, hashes password and sets HttpOnly cookie without leaking secrets',
        async () => {
          const result = await a.write('/auth/register', {
            name: 'أحمد التاجر',
            email: ' ' + emailA.toUpperCase() + ' ',
            phone: '٠١٠١٢٣٤٥٦٧٨',
            password,
          });
          assert.equal(result.response.status, 201);
          aId = result.body.user.id;
          assert.equal(result.body.user.email, emailA);
          assert.equal(result.body.user.phone, '+201012345678');
          const cookies = result.response.headers.getSetCookie().join(';');
          assert.match(cookies, /HttpOnly/);
          assert.match(cookies, /SameSite=Lax/i);
          assert.match(cookies, /Path=\//);
          assert.doesNotMatch(
            JSON.stringify(result.body),
            /passwordHash|tokenHash|csrf|password/,
          );
          const user = await db.collection('users').findOne({ email: emailA });
          assert.match(user.passwordHash, /^\$argon2id\$/);
          assert.ok(await argon2.verify(user.passwordHash, password));
          const raw = a.jar.get('sallty_session');
          const session = await db
            .collection('sessions')
            .findOne({ tokenHash: hash(raw) });
          assert.ok(session);
          assert.notEqual(session.tokenHash, raw);
          const duplicate = await new Browser().write('/auth/register', {
            name: 'اسم تاني',
            email: emailA.toUpperCase(),
            phone: '01112345678',
            password,
          });
          assert.equal(duplicate.response.status, 409);
          const other = await b.write('/auth/register', {
            name: 'منى التاجرة',
            email: emailB,
            phone: '0020 12 1234 5678',
            password,
          });
          assert.equal(other.response.status, 201);
          bId = other.body.user.id;
        },
      );

      await t.test(
        'concurrent duplicate registrations use unique index and transaction rollback',
        async () => {
          const email = 'race-' + randomUUID() + '@example.test';
          const clients = [new Browser(), new Browser()];
          const results = await Promise.all(
            clients.map((client) =>
              client.write('/auth/register', {
                name: 'تاجر اختبار',
                email,
                phone: '01512345678',
                password,
              }),
            ),
          );
          assert.deepEqual(
            results.map((result) => result.response.status).sort(),
            [201, 409],
          );
          const user = await db.collection('users').findOne({ email });
          assert.equal(
            await db.collection('users').countDocuments({ email }),
            1,
          );
          assert.equal(
            await db
              .collection('sessions')
              .countDocuments({ userId: user._id }),
            1,
          );
          const indexes = await db.collection('users').indexes();
          assert.ok(
            indexes.some((index) => index.key.email === 1 && index.unique),
          );
        },
      );

      await t.test(
        'CSRF, session binding, Origin, CORS and JSON body protections',
        async () => {
          const token = await a.csrf();
          assert.equal(
            (
              await a.request(
                '/merchant/store',
                'POST',
                { name: 'متجر', slug: 'csrf-test' },
                { Origin: origin },
              )
            ).response.status,
            403,
          );
          assert.equal(
            (
              await a.request(
                '/merchant/store',
                'POST',
                { name: 'متجر', slug: 'csrf-test' },
                { 'X-CSRF-Token': token },
              )
            ).response.status,
            403,
          );
          const foreign = await a.write(
            '/merchant/store',
            { name: 'متجر', slug: 'csrf-test' },
            'POST',
            { Origin: 'https://attacker.example' },
          );
          assert.equal(foreign.response.status, 403);
          assert.equal(
            foreign.response.headers.get('access-control-allow-origin'),
            null,
          );
          const crossGet = await a.request('/auth/csrf', 'GET', undefined, {
            Origin: 'https://attacker.example',
          });
          assert.equal(crossGet.response.status, 403);
          const tokenB = await b.csrf();
          const combinedCookies =
            'sallty_session=' +
            a.jar.get('sallty_session') +
            '; sallty_csrf=' +
            b.jar.get('sallty_csrf');
          const mismatch = await a.request(
            '/merchant/store',
            'POST',
            { name: 'متجر', slug: 'csrf-test' },
            { Origin: origin, Cookie: combinedCookies, 'X-CSRF-Token': tokenB },
          );
          assert.equal(mismatch.response.status, 403);
          const form = await fetch('http://127.0.0.1:' + port + '/auth/login', {
            method: 'POST',
            headers: {
              Origin: origin,
              Cookie: a.cookie,
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-CSRF-Token': token,
            },
            body: 'email=' + emailA,
          });
          assert.equal(form.status, 403);
        },
      );

      await t.test(
        'Nodemailer SMTP delivery, session-bound verification, wrong OTP and replay prevention',
        async () => {
          assert.equal(
            (await a.request('/merchant/store')).response.status,
            403,
          );
          const codeA = messages.get(emailA),
            codeB = messages.get(emailB);
          assert.match(codeA, /^\d{6}$/);
          assert.match(codeB, /^\d{6}$/);
          assert.equal(
            (await a.write('/auth/email/resend', {})).response.status,
            429,
          );
          const wrong = codeA === '000000' ? '111111' : '000000';
          assert.equal(
            (await a.write('/auth/email/verify', { code: wrong })).response
              .status,
            400,
          );
          assert.equal(
            (await a.write('/auth/email/verify', { code: codeA })).response
              .status,
            200,
          );
          assert.equal(
            (await a.write('/auth/email/verify', { code: codeA })).response
              .status,
            400,
          );
          assert.equal(
            (await b.write('/auth/email/verify', { code: codeB })).response
              .status,
            200,
          );
          assert.equal(
            (await a.request('/auth/me')).body.user.emailVerified,
            true,
          );
          const user = await db.collection('users').findOne({ email: emailA });
          assert.ok(user.emailVerifiedAt);
          assert.equal(user.emailOtpHash, undefined);
        },
      );
      await t.test(
        'OTP expires, limits concurrent attempts, invalidates old challenge, isolates users and preserves account on SMTP failure',
        async () => {
          const c = new Browser();
          const email = 'otp-' + randomUUID() + '@example.test';
          const registration = await c.write('/auth/register', {
            name: 'تاجر التأكيد',
            email,
            phone: '01012345678',
            password,
          });
          assert.equal(registration.response.status, 201);
          assert.equal(registration.body.verificationEmailSent, true);
          const id = registration.body.user.id;
          const code = messages.get(email);
          assert.match(code, /^\d{6}$/);
          let user = await db.collection('users').findOne({ email });
          assert.match(user.emailOtpHash, /^[a-f0-9]{64}$/);
          assert.doesNotMatch(
            JSON.stringify(registration.body),
            /emailOtp|otpHash/,
          );
          assert.equal(
            (await c.write('/auth/email/verify', { code, userId: aId }))
              .response.status,
            400,
          );
          const wrong = code === '000000' ? '111111' : '000000';
          const token = await c.csrf();
          const failures = await Promise.all(
            Array.from({ length: 5 }, () =>
              c.request(
                '/auth/email/verify',
                'POST',
                { code: wrong },
                { Origin: origin, 'X-CSRF-Token': token },
              ),
            ),
          );
          assert.ok(failures.every((result) => result.response.status === 400));
          assert.equal(
            (await c.write('/auth/email/verify', { code })).response.status,
            400,
          );
          user = await db.collection('users').findOne({ email });
          assert.equal(user.emailOtpAttempts, 5);
          await db
            .collection('users')
            .updateOne(
              { email },
              { $set: { emailOtpSentAt: new Date(Date.now() - 61000) } },
            );
          assert.equal(
            (await c.write('/auth/email/resend', {})).response.status,
            200,
          );
          const renewed = await db.collection('users').findOne({ email });
          assert.notEqual(renewed.emailOtpNonce, user.emailOtpNonce);
          assert.equal(renewed.emailOtpAttempts, 0);
          await db
            .collection('users')
            .updateOne(
              { email },
              { $set: { emailOtpExpiresAt: new Date(Date.now() - 1000) } },
            );
          assert.equal(
            (await c.write('/auth/email/verify', { code: messages.get(email) }))
              .response.status,
            400,
          );
          assert.equal(
            (await c.request('/merchant/store')).response.status,
            403,
          );
          assert.equal(
            (await a.request('/auth/me')).body.user.emailVerified,
            true,
          );
          assert.equal((await c.request('/auth/me')).body.user.id, id);
          await new Promise((resolve) => smtp.close(resolve));
          const failed = new Browser();
          const failEmail = 'fail-' + randomUUID() + '@example.test';
          const failedSend = await failed.write('/auth/register', {
            name: 'حساب محفوظ',
            email: failEmail,
            phone: '01012345678',
            password,
          });
          assert.equal(failedSend.response.status, 201);
          assert.equal(failedSend.body.verificationEmailSent, false);
          assert.equal((await failed.request('/auth/me')).response.status, 200);
          const preserved = await db
            .collection('users')
            .findOne({ email: failEmail });
          assert.ok(preserved);
          assert.equal(preserved.emailOtpHash, undefined);
          assert.equal(preserved.emailVerifiedAt, null);
          smtp = createSmtp();
          await new Promise((resolve, reject) => {
            smtp.once('error', reject);
            smtp.listen(smtpPort, '127.0.0.1', resolve);
          });
        },
      );
      await t.test(
        'store creation: Arabic name, unique slug, one owner, immutable associations',
        async () => {
          assert.equal(
            (
              await a.write('/merchant/store', {
                name: 'English only',
                slug: 'admin',
              })
            ).response.status,
            400,
          );
          const slug = 'nour-' + randomUUID();
          const raced = await Promise.all([
            a.write('/merchant/store', { name: 'متجر أحمد', slug }),
            b.write('/merchant/store', { name: 'متجر منى', slug }),
          ]);
          assert.deepEqual(
            raced.map((result) => result.response.status).sort(),
            [201, 409],
          );
          const lost = raced[0].response.status === 409 ? a : b;
          assert.equal(
            (
              await lost.write('/merchant/store', {
                name: 'متجر مستقل',
                slug: 'independent-' + randomUUID(),
              })
            ).response.status,
            201,
          );
          storeA = (await a.request('/merchant/store')).body.store;
          storeB = (await b.request('/merchant/store')).body.store;
          assert.equal(
            (
              await a.write('/merchant/store', {
                name: 'متجر إضافي',
                slug: 'extra-' + randomUUID(),
              })
            ).response.status,
            409,
          );
          const indexes = await db.collection('stores').indexes();
          assert.ok(
            indexes.some((index) => index.key.ownerId === 1 && index.unique),
          );
          assert.ok(
            indexes.some((index) => index.key.slug === 1 && index.unique),
          );
        },
      );

      await t.test(
        'merchant A cannot read or change B store; forged IDs, filters and mass assignment are rejected',
        async () => {
          assert.equal(
            (await a.request('/merchant/stores/' + storeB.id)).response.status,
            404,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/stores/' + storeB.id,
                { name: 'اسم مسروق' },
                'PATCH',
              )
            ).response.status,
            404,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/store',
                { name: 'اسم جديد', ownerId: bId, storeId: storeB.id },
                'PATCH',
              )
            ).response.status,
            400,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/store',
                { name: 'اسم جديد', slug: storeB.slug },
                'PATCH',
              )
            ).response.status,
            400,
          );
          assert.equal(
            (
              await a.request(
                '/merchant/stores/' + encodeURIComponent('{"$ne":null}'),
              )
            ).response.status,
            404,
          );
          const query = await a.request('/merchant/store?ownerId=' + bId);
          assert.equal(query.response.status, 400);
          assert.equal(
            (await a.request('/merchant/store?filter[$ne]=null')).response
              .status,
            400,
          );
          const updated = await a.write(
            '/merchant/stores/' + storeA.id,
            { name: 'متجر أحمد الجديد' },
            'PATCH',
          );
          assert.equal(updated.response.status, 200);
          assert.equal(updated.body.store.name, 'متجر أحمد الجديد');
          assert.equal(
            (await b.request('/merchant/store')).body.store.name,
            storeB.name,
          );
          const own = await a.request('/auth/me');
          assert.equal(own.body.user.id, aId);
          assert.doesNotMatch(
            JSON.stringify(own.body),
            /passwordHash|tokenHash|expiresAt|sessionId/,
          );
        },
      );

      await t.test(
        'session rotation, invalid token, absolute expiry, idle expiry and logout revoke server-side',
        async () => {
          const old = a.jar.get('sallty_session');
          const oldCsrf = await a.csrf();
          const oldNonce = a.jar.get('sallty_csrf');
          assert.equal(
            (await a.write('/auth/login', { email: emailA, password })).response
              .status,
            200,
          );
          assert.notEqual(a.jar.get('sallty_session'), old);
          assert.equal(
            (
              await new Browser().request('/auth/me', 'GET', undefined, {
                Cookie: 'sallty_session=' + old,
              })
            ).response.status,
            401,
          );
          const staleCsrf = await a.request(
            '/merchant/store',
            'PATCH',
            { name: 'متجر آخر' },
            {
              Origin: origin,
              Cookie:
                'sallty_session=' +
                a.jar.get('sallty_session') +
                '; sallty_csrf=' +
                oldNonce,
              'X-CSRF-Token': oldCsrf,
            },
          );
          assert.equal(staleCsrf.response.status, 403);
          const fake = await new Browser().request(
            '/auth/me',
            'GET',
            undefined,
            {
              Cookie: 'sallty_session=' + randomBytes(32).toString('base64url'),
            },
          );
          assert.equal(fake.response.status, 401);
          await db
            .collection('sessions')
            .updateOne(
              { tokenHash: hash(b.jar.get('sallty_session')) },
              { $set: { expiresAt: new Date(Date.now() - 1000) } },
            );
          assert.equal((await b.request('/auth/me')).response.status, 401);
          assert.equal(
            (await b.write('/auth/login', { email: emailB, password })).response
              .status,
            200,
          );
          await db
            .collection('sessions')
            .updateOne(
              { tokenHash: hash(b.jar.get('sallty_session')) },
              { $set: { lastSeenAt: new Date(Date.now() - 25 * 3600 * 1000) } },
            );
          assert.equal((await b.request('/auth/me')).response.status, 401);
          assert.equal(
            (await b.write('/auth/login', { email: emailB, password })).response
              .status,
            200,
          );
          const revoked = b.jar.get('sallty_session');
          assert.equal(
            (await b.write('/auth/logout', {})).response.status,
            200,
          );
          assert.equal((await b.request('/auth/me')).response.status, 401);
          assert.equal(
            (
              await a.request('/auth/me', 'GET', undefined, {
                Cookie: 'sallty_session=' + revoked,
              })
            ).response.status,
            401,
          );
          assert.equal(
            await db
              .collection('sessions')
              .countDocuments({ tokenHash: hash(revoked) }),
            0,
          );
        },
      );

      await t.test(
        'generic login failures and durable account rate limits survive API restart',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          const anonymous = new Browser();
          const wrong = await anonymous.write('/auth/login', {
            email: emailA,
            password: 'incorrect-password',
          });
          const email = 'unknown-' + randomUUID() + '@example.test';
          const absent = await anonymous.write('/auth/login', {
            email,
            password,
          });
          assert.equal(wrong.response.status, 401);
          assert.deepEqual(wrong.body, absent.body);
          for (let i = 1; i < 5; i++)
            assert.equal(
              (await anonymous.write('/auth/login', { email, password }))
                .response.status,
              401,
            );
          const blocked = await anonymous.write('/auth/login', {
            email,
            password,
          });
          assert.equal(blocked.response.status, 429);
          assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
          stop();
          await new Promise((resolve) =>
            server.exitCode !== null ? resolve() : server.once('exit', resolve),
          );
          await start();
          assert.equal(
            (await anonymous.write('/auth/login', { email, password })).response
              .status,
            429,
          );
          const buckets = await db
            .collection('rateLimitBuckets')
            .find({})
            .toArray();
          assert.ok(
            buckets.every((bucket) => !JSON.stringify(bucket).includes(email)),
          );
        },
      );

      await t.test(
        'registration IP quota cannot be bypassed with forged forwarded headers',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          const anonymous = new Browser();
          for (let i = 0; i < 20; i++) {
            assert.equal(
              (
                await anonymous.write('/auth/register', {}, 'POST', {
                  'X-Forwarded-For': '10.0.0.' + i,
                })
              ).response.status,
              400,
            );
          }
          assert.equal(
            (
              await anonymous.write('/auth/register', {}, 'POST', {
                'X-Forwarded-For': '203.0.113.10',
              })
            ).response.status,
            429,
          );
        },
      );
      await t.test(
        'malformed and oversized JSON fail safely without reflecting submitted data',
        async () => {
          const browser = new Browser();
          const token = await browser.csrf();
          for (const [body, expected] of [
            ['{"password":"sensitive-invalid-json"', 400],
            [JSON.stringify({ password: 'x'.repeat(17000) }), 413],
          ]) {
            const response = await fetch(
              'http://127.0.0.1:' + port + '/auth/login',
              {
                method: 'POST',
                headers: {
                  Cookie: browser.cookie,
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'X-CSRF-Token': token,
                },
                body,
              },
            );
            assert.equal(response.status, expected);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.doesNotMatch(
              await response.text(),
              /sensitive-invalid-json|xxxxx/,
            );
          }
          const forged = await browser.request(
            '/auth/login',
            'POST',
            { email: emailA, password },
            { Origin: origin, 'X-CSRF-Token': token.slice(0, -8) + 'xxxxxxxx' },
          );
          assert.equal(forged.response.status, 403);
        },
      );
      await t.test(
        'password recovery: private SMTP delivery, expiry, replay, concurrent consumption and session revocation; admin permissions and regional store',
        async () => {
          const client = new Browser(),
            other = new Browser(),
            email = 'recovery-' + randomUUID() + '@example.test',
            userId = new mongoose.Types.ObjectId();
          await db.collection('users').insertOne({
            _id: userId,
            name: 'Regional merchant',
            email,
            phone: '+966501234567',
            country: 'SA',
            passwordHash: await argon2.hash(password, {
              type: argon2.argon2id,
            }),
            emailVerifiedAt: new Date(),
          });
          assert.equal(
            (await client.write('/auth/login', { email, password })).response
              .status,
            200,
          );
          assert.equal(
            (await other.write('/auth/login', { email, password })).response
              .status,
            200,
          );
          assert.equal(
            (await client.request('/admin/summary')).response.status,
            403,
          );
          assert.equal(
            (await new Browser().request('/admin/summary')).response.status,
            401,
          );
          assert.equal(
            (await client.request('/auth/me')).body.user.role,
            'MERCHANT',
          );
          const regionStore = await client.write('/merchant/store', {
            name: 'Regional store',
            slug: 'regional-' + randomUUID(),
            country: 'KW',
          });
          assert.equal(regionStore.response.status, 201);
          assert.equal(regionStore.body.store.currency, 'KWD');
          assert.equal(
            (
              await client.write(
                '/merchant/store',
                { name: 'Changed', currency: 'SAR' },
                'PATCH',
              )
            ).response.status,
            400,
          );
          const missing = await client.write('/auth/forgot-password', {
            email: 'missing-' + randomUUID() + '@example.test',
          });
          const known = await client.write('/auth/forgot-password', { email });
          assert.equal(known.response.status, 200);
          assert.deepEqual(known.body, missing.body);
          for (let n = 0; n < 100 && !recoveryTokens.has(email); n++)
            await new Promise((r) => setTimeout(r, 50));
          const old = recoveryTokens.get(email);
          assert.ok(old, 'Recovery delivery missing: ' + serverOutput);
          assert.match(old, /^[A-Za-z0-9_-]{43}$/);
          const stored = await db.collection('users').findOne({ _id: userId });
          assert.equal(stored.passwordResetHash, hash(old));
          assert.notEqual(stored.passwordResetHash, old);
          assert.doesNotMatch(
            JSON.stringify((await client.request('/auth/me')).body),
            /passwordReset|passwordHash/,
          );
          await db
            .collection('users')
            .updateOne(
              { _id: userId },
              { $set: { passwordResetSentAt: new Date(Date.now() - 61000) } },
            );
          await client.write('/auth/forgot-password', { email });
          for (let n = 0; n < 100 && recoveryTokens.get(email) === old; n++)
            await new Promise((r) => setTimeout(r, 50));
          const token = recoveryTokens.get(email);
          assert.notEqual(token, old);
          const newPassword = randomBytes(18).toString('base64url');
          assert.equal(
            (
              await client.write('/auth/reset-password', {
                token: old,
                password: newPassword,
              })
            ).response.status,
            400,
          );
          const raced = await Promise.all([
            client.write('/auth/reset-password', {
              token,
              password: newPassword,
            }),
            other.write('/auth/reset-password', {
              token,
              password: newPassword,
            }),
          ]);
          assert.deepEqual(
            raced.map((r) => r.response.status).sort(),
            [200, 400],
          );
          assert.equal(
            await db.collection('sessions').countDocuments({ userId }),
            0,
          );
          assert.equal((await other.request('/auth/me')).response.status, 401);
          assert.equal(
            (
              await client.write('/auth/reset-password', {
                token,
                password: newPassword,
              })
            ).response.status,
            400,
          );
          assert.equal(
            (await client.write('/auth/login', { email, password })).response
              .status,
            401,
          );
          assert.equal(
            (
              await client.write('/auth/login', {
                email,
                password: newPassword,
              })
            ).response.status,
            200,
          );
          const saved = await db.collection('users').findOne({ _id: userId });
          assert.ok(saved.passwordHash.startsWith('$argon2id$'));
          assert.equal(
            await argon2.verify(saved.passwordHash, newPassword),
            true,
          );
          const expired = randomBytes(32).toString('base64url');
          await db.collection('users').updateOne(
            { _id: userId },
            {
              $set: {
                passwordResetHash: hash(expired),
                passwordResetExpiresAt: new Date(Date.now() - 1000),
              },
            },
          );
          assert.equal(
            (
              await client.write('/auth/reset-password', {
                token: expired,
                password: newPassword,
              })
            ).response.status,
            400,
          );
          assert.equal(
            (
              await client.request(
                '/auth/reset-password',
                'POST',
                { token, password: newPassword },
                { Origin: origin },
              )
            ).response.status,
            403,
          );
          await db
            .collection('users')
            .updateOne({ _id: userId }, { $set: { role: 'ADMIN' } });
          const summary = await client.request('/admin/summary');
          assert.equal(summary.response.status, 200);
          assert.deepEqual(Object.keys(summary.body).sort(), [
            'stores',
            'users',
          ]);
          await db
            .collection('users')
            .updateOne({ _id: userId }, { $set: { role: 'MERCHANT' } });
          assert.equal(
            (await client.request('/admin/summary')).response.status,
            403,
          );
        },
      );
      await t.test(
        'production session and CSRF cookies enforce __Host, Secure, HttpOnly, SameSite and matching deletion',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          stop();
          await new Promise((resolve) =>
            server.exitCode !== null ? resolve() : server.once('exit', resolve),
          );
          const productionOrigin = 'https://sallty.example';
          await start({ NODE_ENV: 'production', APP_ORIGIN: productionOrigin });
          const browser = new Browser();
          const csrf = await browser.request('/auth/csrf');
          const csrfCookie = csrf.response.headers.getSetCookie().join(';');
          assert.match(csrfCookie, /__Host-sallty_csrf=/);
          for (const flag of [/Secure/, /HttpOnly/, /SameSite=Lax/i, /Path=\//])
            assert.match(csrfCookie, flag);
          assert.doesNotMatch(csrfCookie, /Domain=/i);
          const login = await browser.write(
            '/auth/login',
            { email: emailA, password },
            'POST',
            { Origin: productionOrigin },
          );
          assert.equal(login.response.status, 200);
          const sessionCookie = login.response.headers
            .getSetCookie()
            .find((line) => line.startsWith('__Host-sallty_session='));
          assert.ok(sessionCookie);
          for (const flag of [/Secure/, /HttpOnly/, /SameSite=Lax/i, /Path=\//])
            assert.match(sessionCookie, flag);
          assert.doesNotMatch(sessionCookie, /Domain=/i);
          assert.equal(
            (await browser.request('/auth/me')).response.status,
            200,
          );
          const logout = await browser.write('/auth/logout', {}, 'POST', {
            Origin: productionOrigin,
          });
          assert.equal(logout.response.status, 200);
          const cleared = logout.response.headers
            .getSetCookie()
            .find((line) => line.startsWith('__Host-sallty_session='));
          assert.ok(cleared);
          assert.match(cleared, /Secure/);
          assert.match(cleared, /HttpOnly/);
          assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
          assert.equal(
            (await browser.request('/auth/me')).response.status,
            401,
          );
        },
      );
      await t.test(
        'database outage keeps health available but fails closed for authentication',
        async () => {
          stop();
          await new Promise((resolve) =>
            server.exitCode !== null ? resolve() : server.once('exit', resolve),
          );
          const missingPort = await freePort();
          await start(
            {
              MONGODB_URI:
                'mongodb://127.0.0.1:' +
                missingPort +
                '/unavailable?replicaSet=rs0&directConnection=true',
            },
            503,
          );
          const health = await new Browser().request('/health');
          assert.equal(health.response.status, 200);
          const ready = await new Browser().request('/ready');
          assert.equal(ready.response.status, 503);
          assert.equal(ready.body.status, 'not_ready');
          assert.equal(
            (await new Browser().request('/auth/me')).response.status,
            503,
          );
          assert.equal(
            (await new Browser().request('/auth/csrf')).response.status,
            503,
          );
        },
      );
    } finally {
      stop();
      // Only the randomly generated database created by this test may be dropped.
      assert.ok(/^sallty_test_[a-f0-9]+$/.test(name));
      if (connection.readyState === 1) await connection.dropDatabase();
      await connection.close();
      await new Promise((resolve) => smtp.close(resolve));
    }
  },
);
