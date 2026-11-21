async function openMerchantMenu(page) {
  await page.waitForLoadState('networkidle');
  const summary = page
    .locator('summary')
    .filter({ hasText: /قائمة إدارة المتجر|Store management menu/ });
  await summary.waitFor({ state: 'attached' });
  if (await summary.isVisible()) {
    const details = summary.locator('..');
    if ((await details.getAttribute('open')) === null) await summary.click();
  }
}
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const root = new URL('../', import.meta.url);
const apiDir = fileURLToPath(new URL('apps/api/', root));
const webDir = fileURLToPath(new URL('apps/web/', root));
const nextEnvPath = new URL('apps/web/next-env.d.ts', root);
const originalNextEnv = await readFile(nextEnvPath, 'utf8').catch(() => null);
const require = createRequire(new URL('apps/api/package.json', root));
const mongoose = require('mongoose');
const { SMTPServer } = require('smtp-server');
const messages = new Map();
const recoveryTokens = new Map();
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['AUTH', 'STARTTLS'],
  onData(stream, session, callback) {
    let body = '';
    stream.on('data', (chunk) => {
      body += chunk.toString();
    });
    stream.on('end', () => {
      const token = body
        .replace(/=\r?\n/g, '')
        .replace(/=3D/g, '=')
        .match(/\/reset-password#token=([A-Za-z0-9_-]{43})/)?.[1];
      if (token) recoveryTokens.set(session.envelope.rcptTo[0].address, token);
      messages.set(
        session.envelope.rcptTo[0].address,
        body.replace(/=\r?\n/g, '').match(/>(\d{6})<\/p>/)?.[1],
      );
      callback();
    });
  },
});
let smtpStarted = false;
const next = createRequire(new URL('apps/web/package.json', root)).resolve(
  'next/dist/bin/next',
);
const { chromium } = createRequire(new URL('apps/web/package.json', root))(
  'playwright',
);
const dbName = 'sallty_web_test_' + randomUUID().replaceAll('-', '');
const uploads = resolve(fileURLToPath(root), '.local', dbName);
const mongo = new URL(
  process.env.MONGODB_URI ??
    'mongodb://127.0.0.1:27017/sallty?replicaSet=rs0&directConnection=true',
);
mongo.pathname = '/' + dbName;
const children = [];
let connection;
let browser;
let activePage;
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
function launch(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  return { child, output: () => output };
}
async function wait(server, url) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (server.child.exitCode !== null)
      throw new Error('Test process exited: ' + server.output());
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Test startup timed out: ' + server.output());
}
class Browser {
  jar = new Map();
  constructor(origin) {
    this.origin = origin;
  }
  get cookie() {
    return [...this.jar].map(([key, value]) => key + '=' + value).join('; ');
  }
  async request(path, init = {}) {
    const response = await fetch(this.origin + path, {
      ...init,
      redirect: 'manual',
      headers: { Cookie: this.cookie, ...init.headers },
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const position = pair.indexOf('=');
      const key = pair.slice(0, position),
        value = pair.slice(position + 1);
      if (value) this.jar.set(key, value);
      else this.jar.delete(key);
    }
    return response;
  }
  async write(path, body, method = 'POST') {
    const csrf = await this.request('/api/v1/auth/csrf');
    assert.equal(csrf.status, 200);
    const { csrfToken } = await csrf.json();
    return this.request('/api/v1' + path, {
      method,
      headers: {
        Origin: this.origin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(body),
    });
  }
}
async function redirectLocation(response) {
  const location = response.headers.get('location');
  if (location) {
    assert.equal(response.status, 307);
    return location;
  }
  // With a root loading boundary, Next.js can redirect after streaming starts.
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /passwordHash|tokenHash/);
  const meta = html.match(/<meta[^>]*http-equiv="refresh"[^>]*>/i)?.[0];
  assert.ok(meta, 'Expected a streamed redirect, not a protected page');
  const target = meta.match(/content="\d+;url=([^"]+)"/i)?.[1];
  assert.ok(target, 'Expected an explicit redirect destination');
  return target;
}
try {
  const apiPort = await freePort(),
    webPort = await freePort();
  const origin = 'http://127.0.0.1:' + webPort;
  const smtpPort = await freePort();
  await new Promise((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(smtpPort, '127.0.0.1', resolve);
  });
  smtpStarted = true;
  connection = mongoose.createConnection(mongo.toString(), {
    serverSelectionTimeoutMS: 5000,
  });
  await connection.asPromise();
  const api = launch(['dist/main.js'], apiDir, {
    NODE_ENV: 'test',
    API_PORT: String(apiPort),
    API_HOST: '127.0.0.1',
    APP_ORIGIN: origin,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    APPLICATION_EMAIL: 'sallty@example.test',
    APPLICATION_PASSWORD: '',
    CSRF_SECRET: randomBytes(32).toString('hex'),
    MONGODB_URI: mongo.toString(),
    LOCAL_UPLOAD_ROOT: uploads,
  });
  await wait(api, 'http://127.0.0.1:' + apiPort + '/ready');
  const webEnvironment = {
    NEXT_TELEMETRY_DISABLED: '1',
    SALLTY_AUTH_TEST: '1',
    API_INTERNAL_URL: 'http://127.0.0.1:' + apiPort,
  };
  console.log('Building isolated Next.js production test...');
  const build = launch([next, 'build'], webDir, webEnvironment);
  const exit = await new Promise((resolve, reject) => {
    build.child.once('error', reject);
    build.child.once('exit', resolve);
  });
  assert.equal(exit, 0, build.output());
  const web = launch(
    [next, 'start', '--hostname', '127.0.0.1', '--port', String(webPort)],
    webDir,
    webEnvironment,
  );
  await wait(web, origin + '/api/v1/health');
  const a = new Browser(origin),
    b = new Browser(origin);
  for (const path of ['/dashboard', '/onboarding/store']) {
    const response = await a.request(path);
    assert.equal(await redirectLocation(response), '/login');
  }
  for (const path of ['/register', '/login']) {
    const html = await (await a.request(path)).text();
    assert.match(html, /lang="ar"/);
    assert.match(html, /dir="rtl"/);
    assert.match(html, /name="email"/);
    assert.match(html, /name="password"/);
  }
  const password = randomBytes(18).toString('base64url');
  const email = 'web-' + randomUUID() + '@example.test';
  const register = await a.write('/auth/register', {
    name: 'تاجر اختبار الواجهة',
    email,
    phone: '01012345678',
    password,
  });
  assert.equal(register.status, 201);
  assert.equal(await redirectLocation(await a.request('/')), '/verify-email');
  assert.equal(
    await redirectLocation(await a.request('/dashboard')),
    '/verify-email',
  );
  assert.match(messages.get(email), /^\d{6}$/);
  assert.equal(
    (await a.write('/auth/email/verify', { code: messages.get(email) })).status,
    200,
  );
  assert.match(register.headers.getSetCookie().join(';'), /HttpOnly/);
  assert.equal(
    await redirectLocation(await a.request('/dashboard')),
    '/onboarding/store',
  );
  const onboarding = await a.request('/onboarding/store');
  assert.equal(onboarding.status, 200);
  assert.match(await onboarding.text(), /name="slug"/);
  const store = await a.write('/merchant/store', {
    name: 'متجر الواجهة الأول',
    slug: 'web-' + randomUUID(),
  });
  assert.equal(store.status, 201);
  const storeId = (await store.json()).store.id;
  const dashboard = await a.request('/dashboard');
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /تاجر اختبار الواجهة/);
  assert.match(html, /متجر الواجهة الأول/);
  assert.doesNotMatch(html, /passwordHash|tokenHash/);
  assert.match(html, /متجرك جاهز خطوة بخطوة/);
  const help = await a.request('/dashboard/help');
  assert.equal(help.status, 200);
  assert.match(await help.text(), /الطلب التجريبي حقيقي ويخصم المخزون/);
  assert.equal(
    await redirectLocation(await a.request('/register')),
    '/dashboard',
  );
  assert.equal(
    await redirectLocation(await a.request('/onboarding/store')),
    '/dashboard',
  );
  const other = await b.write('/auth/register', {
    name: 'التاجر الثاني',
    email: 'other-' + email,
    phone: '01112345678',
    password,
  });
  assert.equal(other.status, 201);
  assert.equal(
    (
      await b.write('/auth/email/verify', {
        code: messages.get('other-' + email),
      })
    ).status,
    200,
  );
  assert.equal(
    (await b.request('/api/v1/merchant/stores/' + storeId)).status,
    404,
  );
  assert.equal(
    (
      await b.write(
        '/merchant/stores/' + storeId,
        { name: 'محاولة تعديل' },
        'PATCH',
      )
    ).status,
    404,
  );
  assert.equal(
    (await a.write('/merchant/store', { name: 'اسم متجر جديد' }, 'PATCH'))
      .status,
    200,
  );
  assert.match(await (await a.request('/dashboard')).text(), /اسم متجر جديد/);
  const oldCookie = a.cookie;
  assert.equal((await a.write('/auth/logout', {})).status, 200);
  assert.equal(await redirectLocation(await a.request('/dashboard')), '/login');
  assert.equal(
    (await a.request('/api/v1/auth/me', { headers: { Cookie: oldCookie } }))
      .status,
    401,
  );
  assert.equal((await a.write('/auth/login', { email, password })).status, 200);
  assert.equal((await a.request('/dashboard')).status, 200);
  assert.equal(await redirectLocation(await a.request('/')), '/dashboard');
  console.log(
    'PASS: production Next.js register/login/onboarding/dashboard SSR, HttpOnly cookie forwarding, CSRF proxy, ownership, edit and logout/login journey.',
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : process.platform === 'win32'
        ? { channel: 'msedge' }
        : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ar-EG',
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const uiEmail = 'browser-' + randomUUID() + '@example.test';
  await page.goto(origin + '/register');
  await page.getByLabel('الاسم', { exact: true }).fill('تاجر المتصفح');
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(uiEmail);
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('٠١٢١٢٣٤٥٦٧٨');
  await page.getByLabel('كلمة المرور', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'إنشاء حساب', exact: true }).click();
  await page.waitForURL(origin + '/verify-email', { timeout: 20000 });
  await page
    .getByRole('button', { name: 'تسجيل الخروج', exact: true })
    .waitFor();
  assert.match(messages.get(uiEmail), /^\d{6}$/);
  await page
    .getByLabel('رمز تأكيد البريد الإلكتروني', { exact: true })
    .fill(messages.get(uiEmail));
  await page
    .getByRole('button', { name: 'تأكيد البريد الإلكتروني', exact: true })
    .click();
  await page.waitForURL(origin + '/onboarding/store', { timeout: 20000 });
  await page.getByLabel('اسم المتجر', { exact: true }).fill('متجر المتصفح');
  await page
    .getByLabel('معرّف رابط المتجر (Store Slug)', { exact: true })
    .fill('browser-' + randomUUID());
  await page.getByRole('button', { name: 'إنشاء المتجر', exact: true }).click();
  await page.waitForURL(origin + '/dashboard', { timeout: 20000 });
  await page
    .getByRole('heading', { name: 'مرحبًا، تاجر المتصفح', exact: true })
    .waitFor();
  await page.getByRole('link', { name: 'دليل الاستخدام', exact: true }).click();
  await page.waitForURL(origin + '/dashboard/help');
  await page
    .getByRole('heading', { name: 'دليل استخدام سلتي', exact: true })
    .waitFor();
  assert.match(
    await page
      .getByRole('link', { name: 'فتح المتجر', exact: true })
      .getAttribute('href'),
    /^\/store\/browser-/,
  );
  await page.goto(origin + '/dashboard');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.doesNotMatch(
    await page.evaluate(() => document.cookie),
    /sallty_session|sallty_csrf/,
  );
  const session = (await context.cookies()).find(
    (cookie) => cookie.name === 'sallty_session',
  );
  assert.ok(session?.httpOnly);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    'No mobile horizontal overflow',
  );
  await page.goto(origin + '/');
  await page.waitForURL(origin + '/dashboard');
  assert.equal(
    await page
      .getByRole('link', { name: 'إنشاء حساب تاجر', exact: true })
      .count(),
    0,
  );
  await page
    .getByRole('heading', { name: 'أضف منتجًا للبيع', exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('ol')
      .getByRole('link', { name: 'إدارة المنتجات', exact: true })
      .getAttribute('href'),
    '/dashboard/products/new',
    'An empty catalog points the setup step to product creation',
  );
  await page.getByText('تعديل اسم المتجر', { exact: true }).click();
  await page.getByLabel('اسم المتجر', { exact: true }).fill('اسم من المتصفح');
  await page
    .getByRole('button', { name: 'حفظ اسم المتجر', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'اسم من المتصفح', exact: true })
    .waitFor();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ اسم المتجر بنجاح' })
    .waitFor();
  assert.equal(page.url(), origin + '/dashboard');
  const artifacts = fileURLToPath(new URL('.local/test-artifacts/', root));
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: artifacts + '/dashboard-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: artifacts + '/dashboard-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await page.waitForURL(origin + '/login', { timeout: 20000 });
  await page.goto(origin + '/dashboard');
  await page.waitForURL(origin + '/login');
  const revoked = await context.request.get(origin + '/api/v1/auth/me', {
    headers: { Cookie: 'sallty_session=' + session.value },
  });
  assert.equal(revoked.status(), 401);
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(uiEmail);
  await page
    .getByLabel('كلمة المرور', { exact: true })
    .fill('incorrect-password');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' })
    .waitFor();
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.waitForURL(origin + '/dashboard', { timeout: 20000 });
  await page
    .getByRole('heading', { name: 'اسم من المتصفح', exact: true })
    .waitFor();
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'التصنيفات', exact: true }).click();
  await page.getByLabel('اسم التصنيف').fill('ملابس الاختبار');
  await page.getByLabel('معرّف التصنيف (Slug)').fill('test-clothes');
  await page
    .getByRole('button', { name: 'إضافة التصنيف', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'ملابس الاختبار', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'تعديل ملابس الاختبار', exact: true })
    .click();
  await page.getByLabel('اسم التصنيف').fill('ملابس مصرية');
  await page.getByRole('button', { name: 'حفظ التصنيف', exact: true }).click();
  await page
    .getByRole('heading', { name: 'ملابس مصرية', exact: true })
    .waitFor();
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'المنتجات', exact: true }).click();
  await page
    .getByRole('heading', { name: 'ابدأ بإضافة أول منتج', exact: true })
    .waitFor();
  await page.getByRole('link', { name: 'إضافة منتج', exact: true }).click();
  await page.waitForURL(origin + '/dashboard/products/new');
  await page.getByLabel('اسم المنتج', { exact: true }).fill('قميص أزرق');
  await page.getByLabel('معرّف رابط المنتج (Slug)').fill('blue-shirt');
  await page
    .getByLabel('وصف المنتج')
    .fill('<script>نص عادي</script> قميص قطني');
  await page.getByLabel('السعر (EGP)', { exact: true }).fill('١٢٥٫٥٠');
  await page.getByLabel('سعر قبل الخصم (اختياري)').fill('150.00');
  await page.getByLabel('عدد القطع المتاحة').fill('5');
  await page
    .getByLabel('التصنيف', { exact: true })
    .selectOption({ label: 'ملابس مصرية' });
  await page.getByLabel('حالة المنتج').selectOption('ACTIVE');
  const sharp = require('sharp');
  const photo = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#246bfe' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('رفع صورة جديدة').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await page.getByRole('status').filter({ hasText: 'تم رفع الصورة' }).waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(), true);
  assert.equal(
    await page.getByLabel('اسم المنتج', { exact: true }).inputValue(),
    'قميص أزرق',
    'Product name survives upload and concurrent React updates',
  );
  await page.getByRole('button', { name: 'إضافة المنتج', exact: true }).click();
  await page.waitForURL(origin + '/dashboard/products');
  await page.getByRole('heading', { name: 'قميص أزرق', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('img', { name: 'قميص أزرق', exact: true })
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page.getByLabel('البحث باسم المنتج').fill('مش موجود');
  await page.getByRole('button', { name: 'بحث وتصفية', exact: true }).click();
  await page
    .getByRole('heading', { name: 'لا توجد نتائج مطابقة', exact: true })
    .waitFor();
  await page.getByRole('link', { name: 'مسح', exact: true }).click();
  await page
    .getByRole('link', { name: 'تعديل قميص أزرق', exact: true })
    .click();
  await page.getByLabel('السعر (EGP)', { exact: true }).fill('129.99');
  await page.getByLabel('عدد القطع المتاحة').fill('8');
  await page
    .getByRole('button', { name: 'حفظ التعديلات', exact: true })
    .click();
  await page.waitForURL(origin + '/dashboard/products');
  await page.getByText('129.99 EGP', { exact: true }).waitFor();
  await page.goto(origin + '/');
  await page.waitForURL(origin + '/dashboard');
  await page
    .getByRole('heading', { name: 'متجرك جاهز خطوة بخطوة', exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('ol')
      .getByRole('link', { name: 'إدارة المنتجات', exact: true })
      .getAttribute('href'),
    '/dashboard/products',
    'An active catalog points the setup step to product management',
  );
  await page.locator('ol').getByText('مكتمل', { exact: true }).waitFor();
  assert.match(
    await page.getByRole('link', { name: /منتجات نشطة/ }).innerText(),
    /1/,
  );
  await page.getByRole('link', { name: 'إدارة المنتجات', exact: true }).click();
  await page.screenshot({
    path: artifacts + '/products-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    'Products fit mobile viewport',
  );
  await page.screenshot({
    path: artifacts + '/products-mobile.png',
    fullPage: true,
  });
  const uiUser = await connection.db
    .collection('users')
    .findOne({ email: uiEmail });
  const uiStore = await connection.db
    .collection('stores')
    .findOne({ ownerId: uiUser._id });
  const activeProduct = await connection.db
    .collection('products')
    .findOne({ storeId: uiStore._id, slug: 'blue-shirt' });
  const hiddenProducts = ['DRAFT', 'ARCHIVED'].map((status, index) => ({
    ...activeProduct,
    _id: new mongoose.Types.ObjectId(),
    slug: 'hidden-public-' + index,
    name: 'منتج مخفي ' + index,
    status,
  }));
  await connection.db.collection('products').insertMany(hiddenProducts);
  const shopperContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ar-EG',
  });
  const shopper = await shopperContext.newPage();
  activePage = shopper;
  const publicHome = origin + '/store/' + uiStore.slug;
  try {
    await shopper.goto(publicHome);
    await shopper
      .getByRole('heading', { name: 'قميص أزرق', exact: true })
      .waitFor();
    assert.equal(await shopper.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(
      await shopper.getByText('منتج مخفي 0', { exact: true }).count(),
      0,
    );
    assert.equal(
      await shopper.getByText('منتج مخفي 1', { exact: true }).count(),
      0,
    );
    await shopper.waitForFunction(() =>
      [...document.querySelectorAll('img')].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    assert.equal(
      await shopper.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      'Public store fits mobile viewport',
    );
    await shopper.screenshot({
      path: artifacts + '/storefront-mobile.png',
      fullPage: true,
    });
    await shopper.setViewportSize({ width: 1440, height: 1000 });
    await shopper.screenshot({
      path: artifacts + '/storefront-desktop.png',
      fullPage: true,
    });
    await shopper.getByLabel('ما الذي تبحث عنه؟').fill('مش موجود');
    await shopper.getByRole('button', { name: 'تطبيق', exact: true }).click();
    await shopper
      .getByRole('heading', { name: 'لا توجد منتجات مطابقة', exact: true })
      .waitFor();
    await shopper
      .getByRole('link', { name: 'عرض كل المنتجات', exact: false })
      .click();
    await shopper
      .getByRole('link', { name: 'ملابس مصرية', exact: true })
      .click();
    await shopper.waitForURL(/category=test-clothes/);
    await shopper
      .getByRole('heading', { name: 'قميص أزرق', exact: true })
      .waitFor();
    assert.match(shopper.url(), /category=test-clothes/);
    assert.equal(
      await shopper.getByLabel('التصنيف', { exact: true }).inputValue(),
      'test-clothes',
      'Category form reflects navigation filters',
    );
    await shopper.getByLabel('السعر من (EGP)').fill('130');
    await shopper.getByLabel('السعر إلى (EGP)').fill('140');
    await shopper.getByRole('button', { name: 'تطبيق', exact: true }).click();
    await shopper
      .getByRole('heading', { name: 'لا توجد منتجات مطابقة', exact: true })
      .waitFor();
    await shopper.goto(
      publicHome + '?minEGP=129.99&maxEGP=129.99&sort=price-desc',
    );
    await shopper
      .getByRole('heading', { name: 'قميص أزرق', exact: true })
      .waitFor();
    await shopper
      .getByRole('link')
      .filter({
        has: shopper.getByRole('heading', { name: 'قميص أزرق', exact: true }),
      })
      .click();
    await shopper
      .getByRole('heading', { name: 'عن المنتج', exact: true })
      .waitFor();
    assert.match(await shopper.title(), /قميص أزرق/);
    assert.match(
      await shopper.locator('link[rel="canonical"]').getAttribute('href'),
      /\/products\/blue-shirt$/,
    );
    assert.equal(
      await shopper
        .locator('script')
        .evaluateAll((scripts) =>
          scripts.some((script) => script.textContent?.trim() === 'نص عادي'),
        ),
      false,
      'Description HTML is rendered as plain text',
    );
    await shopper.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await shopper.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      'Public product fits mobile viewport',
    );
    await shopper.screenshot({
      path: artifacts + '/storefront-product-mobile.png',
      fullPage: true,
    });
    for (const suffix of [
      '/products/hidden-public-0',
      '/products/hidden-public-1',
      '/products/missing-product',
    ]) {
      await shopper.goto(publicHome + suffix);
      await shopper
        .getByRole('heading', { name: 'الرابط غير متاح', exact: true })
        .waitFor();
    }
    await shopper.goto(origin + '/store/missing-store');
    await shopper
      .getByRole('heading', { name: 'الرابط غير متاح', exact: true })
      .waitFor();
    console.log(
      'PASS: anonymous real-browser storefront, active-only catalog, category/search/EGP filters, details, escaped description, metadata, image display, 404, RTL and mobile/desktop layouts.',
    );
  } finally {
    await shopperContext.close();
    activePage = page;
    await connection.db
      .collection('products')
      .deleteMany({ _id: { $in: hiddenProducts.map((p) => p._id) } });
  }
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'التصنيفات', exact: true }).click();
  await page
    .getByRole('button', { name: 'حذف ملابس مصرية', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد حذف التصنيف', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: 'التصنيف مستخدم' }).waitFor();
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'المنتجات', exact: true }).click();
  await page
    .getByRole('link', { name: 'تعديل قميص أزرق', exact: true })
    .click();
  assert.equal(
    await page.getByLabel('وصف المنتج').inputValue(),
    '<script>نص عادي</script> قميص قطني',
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    'Product form fits mobile viewport',
  );
  await page.screenshot({
    path: artifacts + '/product-form-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'أرشفة المنتج', exact: true }).click();
  await page
    .getByRole('button', { name: 'تأكيد الأرشفة', exact: true })
    .click();
  await page.waitForURL(origin + '/dashboard/products?status=ARCHIVED');
  const archivedPublicResponse = await fetch(
    publicHome + '/products/blue-shirt',
  );
  const archivedPublicHTML = await archivedPublicResponse.text();
  assert.match(
    archivedPublicHTML,
    /الرابط غير متاح/,
    'Archived product renders Not Found',
  );
  assert.match(
    archivedPublicHTML,
    /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/,
    'Streamed Not Found is not indexed',
  );
  await page
    .getByRole('link', { name: 'تعديل قميص أزرق', exact: true })
    .click();
  await page.getByLabel('التصنيف', { exact: true }).selectOption('none');
  assert.equal(
    await page.getByLabel('التصنيف', { exact: true }).inputValue(),
    'none',
    'Category cleared before status update',
  );
  await page.getByLabel('حالة المنتج').selectOption('ACTIVE');
  assert.equal(
    await page.getByLabel('التصنيف', { exact: true }).inputValue(),
    'none',
    'Category retained after status update',
  );
  await page.getByRole('checkbox').uncheck();
  assert.equal(
    await page.getByLabel('التصنيف', { exact: true }).inputValue(),
    'none',
    'Category retained after image change',
  );
  const detachResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/merchant/products/'),
  );
  await page
    .getByRole('button', { name: 'حفظ التعديلات', exact: true })
    .click();
  const detached = await detachResponse;
  assert.equal(detached.status(), 200);
  assert.equal(
    (await detached.json()).product.categoryId,
    null,
    'UI saves category detachment',
  );
  assert.equal(
    (await detached.json()).product.status,
    'ACTIVE',
    'Archived product can be restored while changing image selection',
  );
  await page.waitForURL(origin + '/dashboard/products');
  await page
    .getByRole('link', { name: 'تعديل قميص أزرق', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'حذف من المكتبة', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد حذف الصورة', exact: true })
    .click();
  await page.getByRole('status').filter({ hasText: 'تم حذف الصورة' }).waitFor();
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'التصنيفات', exact: true }).click();
  await page
    .getByRole('button', { name: 'حذف ملابس مصرية', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'تأكيد حذف التصنيف', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'لا توجد تصنيفات بعد', exact: true })
    .waitFor();
  assert.deepEqual(errors, [], 'Catalog has no browser JavaScript errors');
  // Real guest purchase and merchant cancellation, with a lost checkout response recovery.
  await page.goto(origin + '/dashboard/shipping');
  await page.getByLabel('رسوم الشحن (EGP)', { exact: true }).fill('35.00');
  let releaseShipping;
  const shippingGate = new Promise((resolve) => {
    releaseShipping = resolve;
  });
  await page.route('**/api/v1/merchant/shipping', async (route) => {
    if (route.request().method() === 'PATCH') await shippingGate;
    await route.continue();
  });
  await page
    .getByRole('button', { name: 'حفظ رسوم الشحن', exact: true })
    .click();
  await page.getByTestId('activity-indicator').waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'حفظ رسوم الشحن', exact: true })
      .getAttribute('aria-busy'),
    'true',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'حفظ رسوم الشحن', exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: artifacts + '/action-loading.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .getByTestId('activity-indicator')
      .locator('circle')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  assert.ok(
    await page
      .getByTestId('activity-indicator')
      .locator('circle')
      .first()
      .evaluate(
        (el) => parseFloat(getComputedStyle(el).animationDuration) < 0.001,
      ),
    'Reduced motion disables loader animation',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  releaseShipping();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ رسوم الشحن' })
    .waitFor();
  await page.getByTestId('activity-indicator').waitFor({ state: 'hidden' });
  await page.unroute('**/api/v1/merchant/shipping');
  const buyerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    buyer = await buyerContext.newPage();
  activePage = buyer;
  buyer.on('pageerror', (e) => errors.push(e.message));
  const cartPath = '/store/' + uiStore.slug + '/cart',
    checkoutPath = '/store/' + uiStore.slug + '/checkout';
  async function fillCheckout() {
    await buyer
      .getByLabel('الاسم الكامل', { exact: true })
      .fill('عميل طلب الواجهة');
    await buyer
      .getByLabel('رقم الموبايل المصري', { exact: true })
      .fill('01012345678');
    await buyer
      .getByLabel('المدينة أو المنطقة', { exact: true })
      .fill('مدينة نصر');
    await buyer.getByLabel('المحافظة', { exact: true }).selectOption('القاهرة');
    await buyer
      .getByLabel('العنوان بالتفصيل', { exact: true })
      .fill('شارع الاختبار رقم 10 شقة 2');
    await buyer
      .getByLabel('ملاحظات (اختياري)', { exact: true })
      .fill('ملاحظة خاصة لا تظهر للعامة');
  }
  await buyer.goto(origin + '/store/' + uiStore.slug + '/products/blue-shirt');
  await buyer
    .getByRole('button', { name: 'أضف إلى السلة', exact: true })
    .click();
  await buyer.goto(origin + cartPath);
  await buyer.getByRole('link', { name: 'قميص أزرق', exact: true }).waitFor();
  await buyer
    .getByRole('button', { name: 'زيادة الكمية', exact: true })
    .click();
  await buyer.reload();
  assert.equal(
    await buyer.evaluate(
      (slug) =>
        JSON.parse(localStorage.getItem('sallty:cart:v1:' + slug))[0].quantity,
      uiStore.slug,
    ),
    2,
  );
  await buyer
    .getByRole('button', { name: 'تقليل الكمية', exact: true })
    .click();
  const otherStore = await connection.db
    .collection('stores')
    .findOne({ ownerId: { $ne: uiUser._id } });
  assert.ok(otherStore);
  await buyer.goto(origin + '/store/' + otherStore.slug + '/cart');
  await buyer
    .getByRole('heading', { name: 'السلة فارغة', exact: true })
    .waitFor();
  await buyer.goto(origin + cartPath);
  await buyer
    .getByRole('link', { name: 'متابعة لإتمام الطلب', exact: true })
    .click();
  await fillCheckout();
  await buyer.waitForFunction(
    () => !document.querySelector('button[type="submit"]')?.disabled,
  );
  assert.equal(
    await buyer.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    'Checkout fits mobile',
  );
  await buyer.screenshot({
    path: artifacts + '/checkout-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await buyer
    .getByRole('button', { name: 'تبديل المظهر', exact: true })
    .click();
  await buyer.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
  );
  await buyer.screenshot({
    path: artifacts + '/checkout-mobile-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await buyer
    .getByRole('button', { name: 'تبديل المظهر', exact: true })
    .click();
  await buyer.waitForFunction(
    () => document.documentElement.dataset.theme === 'light',
  );
  const beforeOrders = await connection.db
    .collection('orders')
    .countDocuments({ storeId: uiStore._id });
  await buyer
    .getByRole('button', {
      name: 'تأكيد الطلب — الدفع عند الاستلام',
      exact: true,
    })
    .click();
  await buyer.waitForURL(origin + '/store/' + uiStore.slug + '/confirmation*');
  await buyer.getByText('تم استلام طلبك بنجاح.', { exact: true }).waitFor();
  assert.match(
    await buyer.evaluate(
      (slug) => sessionStorage.getItem('sallty:receipt:' + slug),
      uiStore.slug,
    ),
    /^[A-Za-z0-9_-]{43}$/,
    'Receipt capability is retained across internal navigation without customer data',
  );
  await buyer.reload();
  await buyer.getByText('تم استلام طلبك بنجاح.', { exact: true }).waitFor();
  assert.doesNotMatch(
    await buyer.locator('body').innerText(),
    /01012345678|شارع الاختبار|ملاحظة خاصة/,
  );
  assert.equal(new URL(buyer.url()).hash, '');
  const placedOrder = await connection.db
    .collection('orders')
    .findOne({ storeId: uiStore._id }, { sort: { createdAt: -1 } });
  assert.equal(
    await connection.db
      .collection('orders')
      .countDocuments({ storeId: uiStore._id }),
    beforeOrders + 1,
  );
  assert.equal(placedOrder.totalPiastres, 12999 + 3500);
  assert.equal(
    await buyer.evaluate(
      (slug) =>
        JSON.parse(localStorage.getItem('sallty:cart:v1:' + slug)).length,
      uiStore.slug,
    ),
    0,
  );
  await page.goto(origin + '/dashboard/orders');
  await page
    .getByRole('link', { name: 'تفاصيل الطلب', exact: true })
    .first()
    .click();
  await page.getByText('عميل طلب الواجهة', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ملغي', exact: true }).click();
  await page
    .getByRole('button', { name: 'تأكيد إلغاء الطلب', exact: true })
    .click();
  await page
    .getByText('هذه حالة نهائية؛ لا توجد انتقالات أخرى.', { exact: true })
    .waitFor();
  assert.equal(
    (await connection.db.collection('orders').findOne({ _id: placedOrder._id }))
      .status,
    'CANCELLED',
  );
  await buyer.goto(origin + '/store/' + uiStore.slug + '/products/blue-shirt');
  await buyer
    .getByRole('button', { name: 'أضف إلى السلة', exact: true })
    .click();
  await buyer.goto(origin + checkoutPath);
  await fillCheckout();
  let dropped = false;
  await buyer.route(
    '**/api/v1/public/stores/' + uiStore.slug + '/checkout',
    async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      dropped = true;
      await route.abort('failed');
    },
  );
  await buyer
    .getByRole('button', {
      name: 'تأكيد الطلب — الدفع عند الاستلام',
      exact: true,
    })
    .click();
  await buyer
    .getByRole('alert')
    .filter({ hasText: /تعذر|الاتصال/ })
    .waitFor();
  assert.equal(dropped, true);
  await buyer.unroute('**/api/v1/public/stores/' + uiStore.slug + '/checkout');
  await buyer.reload();
  await buyer.waitForURL(origin + '/store/' + uiStore.slug + '/confirmation*');
  await buyer.getByText('تم استلام طلبك بنجاح.', { exact: true }).waitFor();
  assert.equal(
    await connection.db
      .collection('orders')
      .countDocuments({ storeId: uiStore._id }),
    beforeOrders + 2,
    'Lost response refresh recovers order without duplicate',
  );
  const secondOrder = await connection.db
    .collection('orders')
    .findOne({ storeId: uiStore._id, status: 'PENDING' });
  await page.goto(origin + '/dashboard/orders/' + secondOrder._id);
  for (const label of ['مؤكد', 'قيد التجهيز', 'تم الشحن', 'تم التسليم']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(
      (label) =>
        !Array.from(document.querySelectorAll('button')).some(
          (button) => button.textContent.trim() === label,
        ),
      label,
    );
  }
  await page
    .getByText('هذه حالة نهائية؛ لا توجد انتقالات أخرى.', { exact: true })
    .waitFor();
  assert.equal(
    (await connection.db.collection('orders').findOne({ _id: secondOrder._id }))
      .status,
    'DELIVERED',
  );
  await buyerContext.close();
  activePage = page;
  await page.goto(origin + '/dashboard/products/new');
  await page.getByLabel('اسم المنتج', { exact: true }).fill('كتاب رقمي');
  await page.getByLabel('معرّف رابط المنتج (Slug)').fill('digital-guide');
  await page.getByLabel('وصف المنتج').fill('دليل رقمي للاختبار');
  await page.getByLabel('السعر (EGP)', { exact: true }).fill('50');
  await page.getByLabel('عدد القطع المتاحة').fill('10');
  await page.getByLabel('نوع المنتج').selectOption('DIGITAL');
  await page
    .getByLabel('رابط تسليم المنتج (خاص)')
    .fill('https://example.test/private-guide');
  await page.getByLabel('حالة المنتج').selectOption('ACTIVE');
  await page.getByRole('button', { name: 'إضافة المنتج', exact: true }).click();
  await page.waitForURL(origin + '/dashboard/products');
  await page.getByRole('heading', { name: 'كتاب رقمي', exact: true }).waitFor();
  const digitalContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const digitalBuyer = await digitalContext.newPage();
  activePage = digitalBuyer;
  digitalBuyer.on('pageerror', (error) => errors.push(error.message));
  await digitalBuyer.goto(
    origin + '/store/' + uiStore.slug + '/products/digital-guide',
  );
  await digitalBuyer
    .getByRole('button', { name: 'أضف إلى السلة', exact: true })
    .click();
  await digitalBuyer.goto(origin + '/store/' + uiStore.slug + '/checkout');
  await digitalBuyer
    .getByRole('button', {
      name: 'تأكيد الطلب — تأكيد الدفع يدويًا',
      exact: true,
    })
    .waitFor();
  assert.equal(await digitalBuyer.getByLabel('العنوان بالتفصيل').count(), 0);
  assert.equal(await digitalBuyer.getByLabel('المحافظة').count(), 0);
  await digitalBuyer.getByLabel('الاسم الكامل').fill('عميل رقمي');
  await digitalBuyer.getByLabel('رقم الموبايل المصري').fill('01012345678');
  await digitalBuyer
    .getByRole('button', {
      name: 'تأكيد الطلب — تأكيد الدفع يدويًا',
      exact: true,
    })
    .click();
  await digitalBuyer.waitForURL('**/confirmation**');
  await digitalBuyer
    .getByText(
      'بانتظار تأكيد التاجر لاستلام المبلغ. احتفظ بصفحة التأكيد الخاصة بك.',
    )
    .waitFor();
  assert.equal(
    await digitalBuyer
      .getByRole('button', { name: 'استلام المنتج الرقمي', exact: true })
      .count(),
    0,
  );
  const digitalOrder = await connection.db
    .collection('orders')
    .findOne({ storeId: uiStore._id, 'customer.name': 'عميل رقمي' });
  assert.ok(digitalOrder);
  assert.equal(digitalOrder.shippingFeePiastres, 0);
  assert.equal(digitalOrder.customer.address, undefined);
  activePage = page;
  await page.goto(origin + '/dashboard/orders/' + digitalOrder._id);
  await page
    .getByRole('button', { name: 'تأكيد استلام المبلغ', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'نعم، استلمت المبلغ كاملًا', exact: true })
    .click();
  await page.getByText('تم تأكيد استلام المبلغ', { exact: true }).waitFor();
  await digitalBuyer
    .getByRole('button', { name: 'تحديث حالة التسليم', exact: true })
    .click();
  await digitalBuyer
    .getByRole('button', { name: 'استلام المنتج الرقمي', exact: true })
    .click();
  assert.equal(
    await digitalBuyer
      .getByRole('link', { name: 'فتح المنتج الرقمي', exact: true })
      .getAttribute('href'),
    'https://example.test/private-guide',
  );
  await digitalBuyer.screenshot({
    path: artifacts + '/digital-confirmation-mobile.png',
    fullPage: true,
  });
  await digitalContext.close();
  activePage = page;
  await page.goto(origin + '/dashboard/design');
  await page
    .getByRole('heading', { name: 'تصميم المتجر', exact: true })
    .waitFor();
  assert.equal(await page.locator('button[data-theme-choice]').count(), 10);
  await page
    .locator('summary')
    .filter({ hasText: 'اختيار الثيم — 10 ثيمات جاهزة' })
    .click();
  await page.getByRole('button', { name: 'تقنية', exact: true }).click();
  await page.getByLabel('العنوان الرئيسي').fill('متجرك، بطابع جديد');
  await page
    .getByLabel('Instagram', { exact: true })
    .fill('https://www.instagram.com/example/');
  await page
    .getByRole('button', { name: 'حفظ التصميم وتطبيقه', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ تصميم المتجر ونشره.' })
    .waitFor();
  await page.screenshot({
    path: artifacts + '/design-editor-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    'Design editor fits mobile',
  );
  await page.goto(origin + '/store/' + uiStore.slug);
  await page
    .getByRole('heading', { name: 'متجرك، بطابع جديد', exact: true })
    .waitFor();
  assert.equal(
    await page.locator('[data-store-theme]').getAttribute('data-store-theme'),
    'tech',
  );
  assert.equal(
    await page.getByRole('link', { name: 'Instagram', exact: true }).count(),
    1,
  );
  await page.screenshot({
    path: artifacts + '/custom-store-mobile.png',
    fullPage: true,
  });
  await page.goto(origin + '/dashboard/design');
  await page.getByRole('button', { name: 'إضافة قسم', exact: true }).click();
  const liveFrame = page.frameLocator(
    'iframe[title="المتجر الفعلي — معاينة مباشرة"]',
  );
  await page
    .getByLabel('عنوان القسم', { exact: true })
    .fill('إعلان خاص في المسودة');
  await page
    .getByLabel('محتوى القسم', { exact: true })
    .fill('<script>window.builderXss = true</script> محتوى نصي');
  await liveFrame
    .getByRole('heading', { name: 'إعلان خاص في المسودة', exact: true })
    .waitFor();
  assert.equal(
    await liveFrame.locator('body').evaluate(() => window.builderXss === true),
    false,
  );
  await liveFrame
    .getByRole('button', { name: 'تعديل قسم القسم الرئيسي', exact: true })
    .click();
  await page
    .getByLabel('عنوان القسم', { exact: true })
    .fill('عنوان مباشر من الموقع الفعلي');
  await liveFrame
    .getByRole('heading', { name: 'عنوان مباشر من الموقع الفعلي', exact: true })
    .waitFor();
  await liveFrame
    .getByRole('button', { name: 'تعديل قسم إعلان ترويجي', exact: true })
    .click();
  await page.getByRole('button', { name: 'موبايل', exact: true }).click();
  assert.equal(
    await page
      .locator('[data-preview-viewport]')
      .getAttribute('data-preview-viewport'),
    'mobile',
  );
  await page.getByRole('button', { name: 'حفظ مسودة', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ المسودة؛ المتجر العام لم يتغير.' })
    .waitFor();
  const visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(origin + '/store/' + uiStore.slug);
  assert.equal(
    await visitor
      .getByRole('heading', { name: 'إعلان خاص في المسودة', exact: true })
      .count(),
    0,
  );
  const privatePreview = await page.context().newPage();
  await privatePreview.goto(origin + '/dashboard/design/preview');
  await privatePreview
    .getByRole('heading', { name: 'إعلان خاص في المسودة', exact: true })
    .waitFor();
  assert.equal(
    await privatePreview.evaluate(() => window.builderXss === true),
    false,
  );
  await privatePreview.close();
  await visitor.goto(origin + '/dashboard/design/preview');
  await visitor.waitForURL(origin + '/login');
  const promoRow = page
    .getByTestId('section-list')
    .getByRole('listitem')
    .filter({ hasText: 'إعلان ترويجي' });
  await promoRow
    .getByRole('button', { name: 'نقل القسم لأعلى', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'حفظ التصميم وتطبيقه', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ تصميم المتجر ونشره.' })
    .waitFor();
  await visitor.goto(origin + '/store/' + uiStore.slug);
  await visitor
    .getByRole('heading', { name: 'إعلان خاص في المسودة', exact: true })
    .waitFor();
  const positions = await visitor
    .getByRole('heading')
    .evaluateAll((headings) => headings.map((heading) => heading.textContent));
  assert.ok(
    positions.indexOf('إعلان خاص في المسودة') < positions.indexOf('منتجاتنا'),
    'Published section order matches editor',
  );
  await page.getByLabel('إظهار القسم', { exact: true }).uncheck();
  await page
    .getByRole('button', { name: 'حفظ التصميم وتطبيقه', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ تصميم المتجر ونشره.' })
    .waitFor();
  await visitor.reload();
  assert.equal(
    await visitor
      .getByRole('heading', { name: 'إعلان خاص في المسودة', exact: true })
      .count(),
    0,
  );
  await page.screenshot({
    path: artifacts + '/visual-builder-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'كمبيوتر', exact: true }).click();
  await page.screenshot({
    path: artifacts + '/visual-builder-desktop.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('link', { name: 'فتح المحرّر بملء الشاشة', exact: true })
    .click();
  await page.getByTestId('fullscreen-editor').waitFor();
  const fullscreenFrame = page.frameLocator(
    'iframe[title="المتجر الفعلي — معاينة مباشرة"]',
  );
  await fullscreenFrame
    .getByRole('heading', { name: 'عنوان مباشر من الموقع الفعلي', exact: true })
    .waitFor();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page
      .locator('iframe[title="المتجر الفعلي — معاينة مباشرة"]')
      .evaluate((frame) => ({
        width: frame.getBoundingClientRect().width,
        height: frame.getBoundingClientRect().height,
        transform: getComputedStyle(frame).transform,
        viewport: innerWidth,
      }));
    assert.equal(geometry.width, viewport.width);
    assert.equal(geometry.transform, 'none');
    assert.ok(geometry.height > viewport.height * 0.65);
    assert.equal(
      await fullscreenFrame.locator('body').evaluate(() => innerWidth),
      viewport.width,
    );
    await page.screenshot({
      path: artifacts + `/fullscreen-editor-${viewport.width}.png`,
    });
  }
  await fullscreenFrame
    .getByRole('button', { name: 'تعديل قسم القسم الرئيسي', exact: true })
    .click();
  await page
    .getByLabel('عنوان القسم', { exact: true })
    .fill('تعديل مباشر بملء الشاشة');
  await fullscreenFrame
    .getByRole('heading', { name: 'تعديل مباشر بملء الشاشة', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'إغلاق الأدوات', exact: true })
    .click();
  assert.equal(
    await page.locator('#fullscreen-design-tools').isVisible(),
    false,
  );
  await page.getByRole('button', { name: 'حفظ مسودة', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'تم حفظ المسودة؛ المتجر العام لم يتغير.' })
    .waitFor();
  await visitor.reload();
  assert.equal(
    await visitor
      .getByRole('heading', { name: 'تعديل مباشر بملء الشاشة', exact: true })
      .count(),
    0,
  );
  await page
    .getByRole('link', { name: 'العودة إلى Dashboard', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'تصميم المتجر', exact: true })
    .waitFor();
  console.log(
    'PASS: fullscreen editor at native desktop/mobile widths, section selection, instant edits, collapsible tools and private draft saving.',
  );
  await visitorContext.close();
  console.log(
    'PASS: visual section editor, private actual-store draft preview, publishing/reordering/hiding, escaped promotion text, mobile/desktop preview and anonymous preview denial.',
  );
  await page.goto(origin + '/dashboard');
  console.log(
    'PASS: real mobile digital product creation, address-free checkout, owner payment confirmation, private automatic delivery and ten-theme editor with persisted public customization.',
  );
  console.log(
    'PASS: guest mobile cart persistence and store isolation, shipping setup, real COD purchase, private confirmation refresh, cancellation, lost-response recovery without duplicates, and merchant full order lifecycle.',
  );
  await page
    .getByRole('button', { name: 'تغيير اللغة إلى الإنجليزية', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.documentElement.lang === 'en' &&
      document.documentElement.dir === 'ltr',
  );
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
  );
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.goto(origin + '/dashboard');
  await openMerchantMenu(page);
  await page.getByRole('link', { name: 'Orders', exact: true }).click();
  await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
  await page.goto(origin + '/dashboard/settings');
  const darkInput = await page
    .locator('input')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(
    darkInput,
    'rgb(255, 255, 255)',
    'Dark form uses theme background',
  );
  await page.screenshot({
    path: artifacts + '/dashboard-dark-en.png',
    fullPage: true,
  });
  await page.goto(origin + '/admin');
  await page.waitForURL(origin + '/dashboard');
  assert.equal(page.url(), origin + '/dashboard');
  const recoveryContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const recoveryPage = await recoveryContext.newPage();
  activePage = recoveryPage;
  recoveryPage.on('pageerror', (error) => errors.push(error.message));
  await recoveryPage.goto(origin + '/login');
  await recoveryPage
    .getByRole('link', { name: 'نسيت كلمة المرور؟', exact: true })
    .click();
  await recoveryPage.waitForURL(origin + '/forgot-password');
  await recoveryPage
    .getByLabel('البريد الإلكتروني', { exact: true })
    .fill(uiEmail);
  await recoveryPage
    .getByRole('button', { name: 'إرسال رابط الاستعادة', exact: true })
    .click();
  await recoveryPage
    .getByRole('status')
    .filter({ hasText: 'إذا كان البريد الإلكتروني مسجلًا' })
    .waitFor();
  for (let i = 0; i < 100 && !recoveryTokens.has(uiEmail); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.match(recoveryTokens.get(uiEmail), /^[A-Za-z0-9_-]{43}$/);
  await recoveryPage.goto(
    origin + '/reset-password#token=' + recoveryTokens.get(uiEmail),
  );
  await recoveryPage
    .getByLabel('كلمة المرور الجديدة', { exact: true })
    .fill(password + 'New');
  await recoveryPage
    .getByLabel('تأكيد كلمة المرور', { exact: true })
    .fill(password + 'Wrong');
  await recoveryPage
    .getByRole('button', { name: 'حفظ كلمة المرور', exact: true })
    .click();
  await recoveryPage
    .getByRole('alert')
    .filter({ hasText: 'كلمتا المرور غير متطابقتين' })
    .waitFor();
  assert.equal(new URL(recoveryPage.url()).hash, '');
  await recoveryPage
    .getByRole('button', { name: 'تغيير اللغة إلى الإنجليزية', exact: true })
    .click();
  await recoveryPage
    .getByLabel('Confirm password', { exact: true })
    .fill(password + 'New');
  await recoveryPage
    .getByRole('button', { name: 'Save password', exact: true })
    .click();
  await recoveryPage
    .getByRole('status')
    .filter({ hasText: 'Password changed' })
    .waitFor();
  await page.goto(origin + '/dashboard');
  await page.waitForURL(origin + '/login');
  await recoveryPage
    .getByRole('link', { name: 'Back to sign in', exact: true })
    .click();
  await recoveryPage.waitForURL(origin + '/login');
  await recoveryPage.getByLabel('Email', { exact: true }).fill(uiEmail);
  await recoveryPage
    .getByLabel('Password', { exact: true })
    .fill(password + 'New');
  await recoveryPage
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await recoveryPage.waitForURL(origin + '/dashboard');
  assert.equal(await recoveryPage.evaluate(() => localStorage.length), 0);
  assert.deepEqual(
    errors,
    [],
    'Recovery, translation and theme have no browser errors',
  );
  await recoveryContext.close();
  console.log(
    'PASS: Arabic/English RTL/LTR, persisted dark mode, dark inputs, planned sidebar, merchant admin denial, local SMTP recovery, confirmation, language change preserves token and revokes old sessions.',
  );
  console.log(
    'PASS: real browser category CRUD, product create/edit/archive, exact EGP, upload and private image display, search empty state, safe referenced category rejection, detach and image deletion, mobile layouts.',
  );
  console.log(
    'PASS: real Edge browser mobile registration, onboarding, edit, logout, wrong password, login, hidden cookies, no localStorage tokens and no horizontal overflow.',
  );
} catch (error) {
  if (activePage) {
    const folder = fileURLToPath(new URL('.local/test-artifacts/', root));
    await mkdir(folder, { recursive: true });
    await activePage
      .screenshot({ path: folder + '/failure.png', fullPage: true })
      .catch(() => undefined);
    console.error('Failed browser page:', activePage.url());
    console.error(
      'Page messages:',
      await activePage
        .locator('[role="alert"], [role="status"]')
        .allTextContents()
        .catch(() => []),
    );
    console.error(
      'Test product category links:',
      await connection?.db
        .collection('products')
        .find({}, { projection: { name: 1, categoryId: 1, status: 1 } })
        .toArray(),
    );
  }
  console.error(
    error instanceof Error ? error.message : 'Web integration failed',
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (smtpStarted) await new Promise((resolve) => smtp.close(resolve));
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32')
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    else child.kill('SIGTERM');
  }
  if (originalNextEnv !== null) await writeFile(nextEnvPath, originalNextEnv);
  if (connection) {
    if (
      connection.readyState === 1 &&
      connection.name === dbName &&
      /^sallty_web_test_[a-f0-9]{32}$/.test(dbName)
    )
      await connection.dropDatabase();
    await connection.close();
  }
  assert.ok(
    uploads.startsWith(resolve(fileURLToPath(root), '.local') + sep) &&
      uploads.endsWith(dbName),
  );
  await rm(uploads, { recursive: true, force: true });
}
