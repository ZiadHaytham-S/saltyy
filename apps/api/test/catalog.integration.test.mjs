import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';
const dbName = 'sallty_catalog_test_' + randomUUID().replaceAll('-', '');
const mongo = new URL(
  process.env.MONGODB_URI ??
    'mongodb://127.0.0.1:27017/sallty?replicaSet=rs0&directConnection=true',
);
mongo.pathname = '/' + dbName;
const workspace = resolve('../..');
const uploadRoot = resolve(workspace, '.local', dbName);
const origin = 'http://127.0.0.1:3100';
const secret = randomBytes(32).toString('hex');
let port;
async function freePort() {
  const socket = createServer();
  await new Promise((r, j) => {
    socket.once('error', j);
    socket.listen(0, '127.0.0.1', r);
  });
  const { port } = socket.address();
  await new Promise((r) => socket.close(r));
  return port;
}
class Client {
  jar = new Map();
  get cookie() {
    return [...this.jar].map(([k, v]) => k + '=' + v).join('; ');
  }
  async request(path, method = 'GET', body, extra = {}) {
    const form = body instanceof FormData;
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(body !== undefined && !form
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...extra,
      },
      ...(body !== undefined
        ? { body: form ? body : JSON.stringify(body) }
        : {}),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0],
        at = pair.indexOf('=');
      this.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return {
      status: response.status,
      response,
      body: response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
    };
  }
  async write(path, body, method = 'POST', extra = {}) {
    const csrf = await this.request('/auth/csrf');
    assert.equal(csrf.status, 200);
    return this.request(path, method, body, {
      Origin: origin,
      'X-CSRF-Token': csrf.body.csrfToken,
      ...extra,
    });
  }
  async upload(buffer, type = 'image/png', name = 'test.png', extra = {}) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), name);
    return this.write('/merchant/media', form, 'POST', extra);
  }
}
const input = (patch = {}) => ({
  name: 'قميص أزرق',
  slug: 'blue-shirt',
  description: 'وصف تجريبي',
  pricePiastres: 12550,
  compareAtPricePiastres: 15000,
  sku: null,
  stockQuantity: 7,
  categoryId: null,
  imageIds: [],
  status: 'DRAFT',
  ...patch,
});
test(
  'Catalog isolation, validation, transactions and real local image storage',
  { timeout: 120000 },
  async (t) => {
    let child;
    let output = '';
    const connection = mongoose.createConnection(mongo.toString(), {
      serverSelectionTimeoutMS: 5000,
    });
    const a = new Client(),
      b = new Client(),
      unverified = new Client();
    let storeA, storeB, categoryA, categoryB, productA, imageA, imageB;
    try {
      await connection.asPromise();
      const db = connection.db;
      assert.equal((await db.admin().command({ hello: 1 })).setName, 'rs0');
      for (const [client, suffix, verified] of [
        [a, 'alpha', true],
        [b, 'beta', true],
        [unverified, 'unverified', false],
      ]) {
        const userId = new mongoose.Types.ObjectId(),
          storeId = new mongoose.Types.ObjectId(),
          token = randomBytes(32).toString('base64url');
        await db.collection('users').insertOne({
          _id: userId,
          name: 'تاجر اختبار',
          email: suffix + '@example.test',
          phone: '+201012345678',
          passwordHash: 'fixture-not-used-for-login',
          emailVerifiedAt: verified ? new Date() : null,
        });
        await db.collection('sessions').insertOne({
          userId,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 3600000),
          lastSeenAt: new Date(),
        });
        await db.collection('stores').insertOne({
          _id: storeId,
          ownerId: userId,
          name: 'متجر اختبار',
          slug: suffix,
          catalogRevision: 0,
        });
        client.jar.set('sallty_session', token);
        if (client === a) storeA = storeId;
        if (client === b) storeB = storeId;
      }
      port = await freePort();
      child = spawn(process.execPath, ['dist/main.js'], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          API_HOST: '127.0.0.1',
          API_PORT: String(port),
          APP_ORIGIN: origin,
          CSRF_SECRET: secret,
          MONGODB_URI: mongo.toString(),
          LOCAL_UPLOAD_ROOT: uploadRoot,
          APPLICATION_PASSWORD: '',
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk) => {
          output = (output + chunk).slice(-3000);
        });
      let ready = false;
      for (let n = 0; n < 100; n++) {
        if (child.exitCode !== null) throw new Error(output);
        try {
          if ((await fetch('http://127.0.0.1:' + port + '/ready')).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(ready, output);
      const png = await sharp({
        create: { width: 12, height: 10, channels: 3, background: 'blue' },
      })
        .png()
        .toBuffer();
      await t.test(
        'authentication, verification, origin and CSRF guards apply to catalog and uploads',
        async () => {
          for (const path of [
            '/merchant/products',
            '/merchant/categories',
            '/merchant/media',
          ]) {
            assert.equal((await new Client().request(path)).status, 401);
            assert.equal((await unverified.request(path)).status, 403);
          }
          assert.equal(
            (
              await a.request('/merchant/products', 'POST', input(), {
                Origin: origin,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await a.write('/merchant/products', input(), 'POST', {
                Origin: 'https://evil.test',
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await a.upload(png, 'image/png', 'x.png', {
                Origin: 'https://evil.test',
              })
            ).status,
            403,
          );
          const form = new FormData();
          form.append('file', new Blob([png], { type: 'image/png' }), 'x.png');
          assert.equal(
            (
              await a.request('/merchant/media', 'POST', form, {
                Origin: origin,
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        'category CRUD and store-scoped unique indexes',
        async () => {
          const created = await a.write('/merchant/categories', {
            name: 'ملابس',
            slug: 'clothes',
          });
          assert.equal(created.status, 201);
          categoryA = created.body.category;
          assert.equal(
            (
              await a.write('/merchant/categories', {
                name: 'ملابس ثانية',
                slug: 'clothes',
              })
            ).status,
            409,
          );
          const other = await b.write('/merchant/categories', {
            name: 'ملابس تاجر تاني',
            slug: 'clothes',
          });
          assert.equal(other.status, 201);
          categoryB = other.body.category;
          const edited = await a.write(
            '/merchant/categories/' + categoryA.id,
            {
              name: 'ملابس مصرية',
              slug: 'clothes',
              version: categoryA.version,
            },
            'PATCH',
          );
          assert.equal(edited.status, 200);
          categoryA = edited.body.category;
          assert.equal(
            (
              await b.write(
                '/merchant/categories/' + categoryA.id,
                {
                  name: 'تغيير ممنوع',
                  slug: 'changed',
                  version: categoryA.version,
                },
                'PATCH',
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/categories/' + categoryA.id,
                { version: categoryA.version },
                'DELETE',
              )
            ).status,
            404,
          );
          assert.equal(
            (await b.request('/merchant/categories')).body.items.length,
            1,
          );
        },
      );
      await t.test(
        'image upload validates actual content, strips metadata and keeps reads private',
        async () => {
          const uploaded = await a.upload(png);
          assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
          imageA = uploaded.body.media;
          const other = await b.upload(png);
          assert.equal(other.status, 201);
          imageB = other.body.media;
          const image = await a.request('/merchant/media/' + imageA.id);
          assert.equal(image.status, 200);
          assert.equal(
            image.response.headers.get('content-type'),
            'image/webp',
          );
          assert.equal((await sharp(image.body).metadata()).format, 'webp');
          assert.equal(
            image.response.headers.get('x-content-type-options'),
            'nosniff',
          );
          assert.equal(
            (await b.request('/merchant/media/' + imageA.id)).status,
            404,
          );
          assert.equal(
            (await new Client().request('/merchant/media/' + imageA.id)).status,
            401,
          );
          assert.equal(
            (await b.write('/merchant/media/' + imageA.id, {}, 'DELETE'))
              .status,
            404,
          );
          for (const [buffer, type, name] of [
            [Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg'],
            [png, 'image/jpeg', 'x.jpg'],
            [png, 'image/png', 'x.html'],
            [png.subarray(0, 24), 'image/png', 'x.png'],
          ])
            assert.equal((await a.upload(buffer, type, name)).status, 400);
          assert.equal(
            (await a.upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status,
            413,
          );
          assert.equal(
            (await a.request('/merchant/media')).body.items.length,
            1,
          );
          assert.doesNotMatch(
            JSON.stringify(uploaded.body),
            /key|storeId|ownerId/,
          );
        },
      );
      await t.test(
        'product CRUD stores exact prices and same-transaction stock audit',
        async () => {
          const created = await a.write(
            '/merchant/products',
            input({
              categoryId: categoryA.id,
              imageIds: [imageA.id],
              sku: 'sku-1',
            }),
          );
          assert.equal(created.status, 201);
          productA = created.body.product;
          assert.equal(productA.pricePiastres, 12550);
          assert.equal(productA.sku, 'SKU-1');
          assert.equal(productA.images.length, 1);
          const movement = await db.collection('stockMovements').findOne({
            productId: new mongoose.Types.ObjectId(productA.id),
            storeId: storeA,
          });
          assert.equal(movement.delta, 7);
          assert.doesNotMatch(
            JSON.stringify(productA),
            /storeId|ownerId|key|actorId/,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/products',
                input({ slug: 'another', sku: 'SKU-1' }),
              )
            ).status,
            409,
          );
          assert.equal(
            (await b.write('/merchant/products', input({ sku: 'SKU-1' })))
              .status,
            201,
          );
          const edited = await a.write(
            '/merchant/products/' + productA.id,
            {
              ...input({
                stockQuantity: 9,
                categoryId: categoryA.id,
                imageIds: [imageA.id],
                status: 'ACTIVE',
              }),
              version: productA.version,
            },
            'PATCH',
          );
          assert.equal(edited.status, 200);
          productA = edited.body.product;
          assert.equal(
            await db.collection('stockMovements').countDocuments({
              productId: new mongoose.Types.ObjectId(productA.id),
            }),
            2,
          );
        },
      );
      await t.test(
        'forged IDs, associations, operators and query parameters cannot cross stores',
        async () => {
          assert.equal(
            (await b.request('/merchant/products/' + productA.id)).status,
            404,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/products/' + productA.id,
                { ...input(), version: productA.version },
                'PATCH',
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/products/' + productA.id,
                { version: productA.version },
                'DELETE',
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/products',
                input({ slug: 'bad-category', categoryId: categoryB.id }),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/products',
                input({ slug: 'bad-image', imageIds: [imageB.id] }),
              )
            ).status,
            400,
          );
          for (const patch of [
            { storeId: String(storeB) },
            { pricePiastres: 1.5 },
            { name: { $ne: null } },
            { stockQuantity: -1 },
            { $set: { pricePiastres: 1 } },
          ])
            assert.equal(
              (await a.write('/merchant/products', input(patch))).status,
              400,
            );
          for (const query of [
            'storeId=' + storeB,
            'q[$ne]=x',
            'status=ACTIVE&status=DRAFT',
            'pageSize=51',
            'page=0',
            '$where=true',
          ])
            assert.equal(
              (await a.request('/merchant/products?' + query)).status,
              400,
            );
          const foreignFilter = await a.request(
            '/merchant/products?categoryId=' + categoryB.id,
          );
          assert.equal(foreignFilter.status, 200);
          assert.equal(foreignFilter.body.total, 0);
        },
      );
      await t.test(
        'literal search, filters and pagination remain tenant scoped',
        async () => {
          for (let n = 0; n < 3; n++)
            assert.equal(
              (
                await a.write(
                  '/merchant/products',
                  input({
                    name: n === 0 ? 'منتج .* حرفي' : 'منتج صفحة ' + n,
                    slug: 'page-' + n,
                  }),
                )
              ).status,
              201,
            );
          const page = await a.request('/merchant/products?page=2&pageSize=2');
          assert.equal(page.body.items.length, 2);
          assert.equal(page.body.total, 4);
          const search = await a.request(
            '/merchant/products?q=' + encodeURIComponent('.*'),
          );
          assert.equal(search.body.total, 1);
          assert.equal(
            (
              await a.request(
                '/merchant/products?status=ACTIVE&categoryId=' + categoryA.id,
              )
            ).body.total,
            1,
          );
          assert.equal((await b.request('/merchant/products')).body.total, 1);
        },
      );
      await t.test(
        'unique races and optimistic versions roll back losing stock changes',
        async () => {
          const twins = await Promise.all([
            a.write('/merchant/products', input({ slug: 'concurrent' })),
            a.write('/merchant/products', input({ slug: 'concurrent' })),
          ]);
          assert.deepEqual(twins.map((r) => r.status).sort(), [201, 409]);
          assert.equal(
            await db
              .collection('products')
              .countDocuments({ storeId: storeA, slug: 'concurrent' }),
            1,
          );
          const before = await db.collection('stockMovements').countDocuments({
            productId: new mongoose.Types.ObjectId(productA.id),
          });
          const updates = await Promise.all([
            a.write(
              '/merchant/products/' + productA.id,
              {
                ...input({
                  stockQuantity: 10,
                  categoryId: categoryA.id,
                  imageIds: [imageA.id],
                }),
                version: productA.version,
              },
              'PATCH',
            ),
            a.write(
              '/merchant/products/' + productA.id,
              {
                ...input({
                  stockQuantity: 11,
                  categoryId: categoryA.id,
                  imageIds: [imageA.id],
                }),
                version: productA.version,
              },
              'PATCH',
            ),
          ]);
          assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
          productA = updates.find((r) => r.status === 200).body.product;
          assert.equal(
            await db.collection('stockMovements').countDocuments({
              productId: new mongoose.Types.ObjectId(productA.id),
            }),
            before + 1,
          );
        },
      );
      await t.test(
        'archive retains data; referenced categories and images cannot be deleted',
        async () => {
          const archived = await a.write(
            '/merchant/products/' + productA.id,
            { version: productA.version },
            'DELETE',
          );
          assert.equal(archived.status, 200);
          productA = archived.body.product;
          assert.equal(productA.status, 'ARCHIVED');
          assert.equal(
            (
              await a.write(
                '/merchant/categories/' + categoryA.id,
                { version: categoryA.version },
                'DELETE',
              )
            ).status,
            409,
          );
          assert.equal(
            (await a.write('/merchant/media/' + imageA.id, {}, 'DELETE'))
              .status,
            409,
          );
          const detached = await a.write(
            '/merchant/products/' + productA.id,
            {
              ...input({
                status: 'ARCHIVED',
                stockQuantity: productA.stockQuantity,
              }),
              version: productA.version,
            },
            'PATCH',
          );
          assert.equal(detached.status, 200);
          productA = detached.body.product;
          assert.equal(
            (
              await a.write(
                '/merchant/categories/' + categoryA.id,
                { version: categoryA.version },
                'DELETE',
              )
            ).status,
            200,
          );
          assert.equal(
            (await a.write('/merchant/media/' + imageA.id, {}, 'DELETE'))
              .status,
            200,
          );
          assert.equal(
            (await a.request('/merchant/media/' + imageA.id)).status,
            404,
          );
          const files = await readdir(resolve(uploadRoot, String(storeA)));
          assert.equal(files.length, 0);
        },
      );
      await t.test(
        'a failed stock audit rolls back product, version and store revision',
        async () => {
          const before = await db
            .collection('products')
            .findOne({ _id: new mongoose.Types.ObjectId(productA.id) });
          const store = await db.collection('stores').findOne({ _id: storeA });
          const count = await db
            .collection('stockMovements')
            .countDocuments({ productId: before._id });
          await db.command({
            collMod: 'stockMovements',
            validator: { delta: { $ne: 13 } },
            validationAction: 'error',
          });
          try {
            const failed = await a.write(
              '/merchant/products/' + productA.id,
              {
                ...input({
                  stockQuantity: before.stockQuantity + 13,
                  pricePiastres: 11111,
                  status: 'ARCHIVED',
                }),
                version: before.version,
              },
              'PATCH',
            );
            assert.equal(failed.status, 503);
            const after = await db
              .collection('products')
              .findOne({ _id: before._id });
            assert.equal(after.stockQuantity, before.stockQuantity);
            assert.equal(after.pricePiastres, before.pricePiastres);
            assert.equal(after.version, before.version);
            assert.equal(
              (await db.collection('stores').findOne({ _id: storeA }))
                .catalogRevision,
              store.catalogRevision,
            );
            assert.equal(
              await db
                .collection('stockMovements')
                .countDocuments({ productId: before._id }),
              count,
            );
          } finally {
            await db.command({ collMod: 'stockMovements', validator: {} });
          }
        },
      );
      await t.test(
        'concurrent category/media deletion and product attachment never leave dangling references',
        async () => {
          const category = (
            await a.write('/merchant/categories', {
              name: 'تصنيف سباق',
              slug: 'race-category',
            })
          ).body.category;
          const image = (await a.upload(png)).body.media;
          const results = await Promise.all([
            a.write(
              '/merchant/products',
              input({
                slug: 'relation-race',
                categoryId: category.id,
                imageIds: [image.id],
              }),
            ),
            a.write(
              '/merchant/categories/' + category.id,
              { version: 0 },
              'DELETE',
            ),
            a.write('/merchant/media/' + image.id, {}, 'DELETE'),
          ]);
          const product = await db
            .collection('products')
            .findOne({ storeId: storeA, slug: 'relation-race' });
          if (product) {
            assert.ok(
              await db
                .collection('categories')
                .findOne({ _id: product.categoryId, storeId: storeA }),
            );
            assert.ok(
              await db.collection('mediaAssets').findOne({
                _id: product.imageIds[0],
                storeId: storeA,
                state: 'READY',
              }),
            );
            assert.equal(results[1].status, 409);
            assert.equal(results[2].status, 409);
          } else {
            assert.equal(results[0].status, 400);
          }
        },
      );
      await t.test(
        'image quota and upload rate limit are enforced by backend',
        async () => {
          const count = await db
            .collection('mediaAssets')
            .countDocuments({ storeId: storeB });
          await db.collection('mediaAssets').insertMany(
            Array.from({ length: 50 - count }, () => ({
              storeId: storeB,
              key:
                String(storeB) +
                '/' +
                randomBytes(16).toString('hex') +
                '.webp',
              state: 'READY',
              bytes: 1,
              width: 1,
              height: 1,
            })),
          );
          assert.equal((await b.upload(png)).status, 409);
          assert.equal(
            await db
              .collection('mediaAssets')
              .countDocuments({ storeId: storeB }),
            50,
          );
          const key = createHmac('sha256', Buffer.from(secret, 'hex'))
            .update(
              'image-upload:' + storeA + ':' + Math.floor(Date.now() / 3600000),
            )
            .digest('hex');
          await db.collection('rateLimitBuckets').updateOne(
            { key },
            {
              $set: { count: 30, expiresAt: new Date(Date.now() + 3600000) },
            },
            { upsert: true },
          );
          assert.equal((await a.upload(png)).status, 429);
        },
      );
      await t.test(
        'DELETING media stays unavailable and can be safely retried',
        async () => {
          await db
            .collection('mediaAssets')
            .updateOne(
              { _id: new mongoose.Types.ObjectId(imageB.id), storeId: storeB },
              { $set: { state: 'DELETING' } },
            );
          assert.equal(
            (await b.request('/merchant/media/' + imageB.id)).status,
            404,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/products',
                input({ slug: 'deleting-image', imageIds: [imageB.id] }),
              )
            ).status,
            400,
          );
          assert.equal(
            (await b.write('/merchant/media/' + imageB.id, {}, 'DELETE'))
              .status,
            200,
          );
          assert.equal(
            await db
              .collection('mediaAssets')
              .countDocuments({ _id: new mongoose.Types.ObjectId(imageB.id) }),
            0,
          );
        },
      );
      await t.test(
        'public storefront scopes active products, filters, pagination, DTOs and image access',
        async () => {
          const guest = new Client();
          const category = {
            _id: new mongoose.Types.ObjectId(),
            storeId: storeA,
            name: 'تصنيف الجمهور',
            slug: 'public-category',
            version: 0,
          };
          await db.collection('categories').insertOne(category);
          const mediaId = new mongoose.Types.ObjectId();
          const publicPhoto = await sharp(png).webp().toBuffer();
          const mediaKey =
            storeA + '/' + randomBytes(16).toString('hex') + '.webp';
          await mkdir(resolve(uploadRoot, String(storeA)), { recursive: true });
          await writeFile(resolve(uploadRoot, mediaKey), publicPhoto);
          await db.collection('mediaAssets').insertOne({
            _id: mediaId,
            storeId: storeA,
            key: mediaKey,
            bytes: publicPhoto.length,
            width: 12,
            height: 10,
            state: 'READY',
          });
          const fixtures = Array.from({ length: 15 }, (_, n) => ({
            _id: new mongoose.Types.ObjectId(),
            storeId: storeA,
            ...input({
              name: 'منتج الجمهور ' + n,
              slug: 'public-' + n,
              status: n === 13 ? 'DRAFT' : n === 14 ? 'ARCHIVED' : 'ACTIVE',
              categoryId: category._id,
              pricePiastres: 10000 + n * 100,
              stockQuantity: n === 0 ? 0 : 7,
              imageIds: n === 0 || n >= 13 ? [mediaId] : [],
            }),
            version: 0,
          }));
          const foreign = {
            _id: new mongoose.Types.ObjectId(),
            storeId: storeB,
            ...input({ slug: 'foreign-public', status: 'ACTIVE' }),
            version: 0,
          };
          await db.collection('products').insertMany([...fixtures, foreign]);
          try {
            const store = await guest.request('/public/stores/alpha');
            assert.equal(store.status, 200);
            assert.deepEqual(Object.keys(store.body.store).sort(), [
              'branding',
              'country',
              'currency',
              'design',
              'name',
              'slug',
            ]);
            assert.equal(
              (await guest.request('/public/stores/unknown-store')).status,
              404,
            );
            const list = await guest.request(
              '/public/stores/alpha/products?category=public-category&sort=price-asc',
            );
            assert.equal(list.status, 200);
            assert.equal(list.body.total, 13);
            assert.equal(list.body.items.length, 12);
            assert.equal(list.body.items[0].slug, 'public-0');
            assert.equal(list.body.items[0].inStock, false);
            assert.equal(list.body.items[0].pricePiastres, 10000);
            assert.deepEqual(Object.keys(list.body.items[0]).sort(), [
              'category',
              'compareAtPricePiastres',
              'description',
              'images',
              'inStock',
              'name',
              'pricePiastres',
              'slug',
              'type',
            ]);
            const second = await guest.request(
              '/public/stores/alpha/products?category=public-category&sort=price-asc&page=2',
            );
            assert.equal(second.body.items.length, 1);
            assert.equal(second.body.items[0].slug, 'public-12');
            const filtered = await guest.request(
              '/public/stores/alpha/products?category=public-category&minPrice=10100&maxPrice=10300&sort=price-desc',
            );
            assert.deepEqual(
              filtered.body.items.map((p) => p.slug),
              ['public-3', 'public-2', 'public-1'],
            );
            const search = await guest.request(
              '/public/stores/alpha/products?category=public-category&q=' +
                encodeURIComponent('منتج الجمهور 12'),
            );
            assert.equal(search.body.total, 1);
            const literal = await guest.request(
              '/public/stores/alpha/products?q=' + encodeURIComponent('.*'),
            );
            assert.equal(literal.body.total, 0);
            for (const slug of [
              'public-13',
              'public-14',
              'foreign-public',
              'unknown-product',
            ])
              assert.equal(
                (await guest.request('/public/stores/alpha/products/' + slug))
                  .status,
                404,
              );
            assert.equal(
              (await guest.request('/public/stores/beta/products/public-0'))
                .status,
              404,
            );
            assert.equal(
              (
                await guest.request(
                  '/public/stores/beta/products?category=public-category',
                )
              ).status,
              404,
            );
            assert.equal(
              (await guest.request('/public/stores/alpha/products/public-0'))
                .status,
              200,
            );
            for (const query of [
              'storeId=' + storeB,
              'status=DRAFT',
              'q[$ne]=x',
              'page=101',
              'page=0',
              'sort=invalid',
              'minPrice=5&maxPrice=1',
              'minPrice=1.5',
              'category[$ne]=x',
            ])
              assert.equal(
                (await guest.request('/public/stores/alpha/products?' + query))
                  .status,
                400,
                query,
              );
            const imageUrl =
              '/public/stores/alpha/products/public-0/images/' + mediaId;
            const publicImage = await guest.request(imageUrl);
            assert.equal(publicImage.status, 200);
            assert.equal(
              publicImage.response.headers.get('content-type'),
              'image/webp',
            );
            for (const path of [
              '/public/stores/beta/products/public-0/images/' + mediaId,
              '/public/stores/alpha/products/public-13/images/' + mediaId,
              '/public/stores/alpha/products/public-1/images/' + mediaId,
            ])
              assert.equal((await guest.request(path)).status, 404);
            await db
              .collection('products')
              .updateOne(
                { _id: fixtures[0]._id },
                { $set: { status: 'DRAFT' } },
              );
            assert.equal((await guest.request(imageUrl)).status, 404);
            assert.equal(
              (await guest.request('/public/stores/alpha/products/public-0'))
                .status,
              404,
            );
          } finally {
            await db.collection('products').deleteMany({
              _id: { $in: [...fixtures, foreign].map((p) => p._id) },
            });
            await db.collection('categories').deleteOne({ _id: category._id });
            await a.write('/merchant/media/' + mediaId, {}, 'DELETE');
          }
        },
      );
      await t.test(
        'per-store catalog quotas reject additions without partial writes',
        async () => {
          const products = await db
            .collection('products')
            .countDocuments({ storeId: storeB });
          await db.collection('products').insertMany(
            Array.from({ length: 1000 - products }, (_, n) => ({
              storeId: storeB,
              ...input({ slug: 'quota-' + n }),
              version: 0,
            })),
          );
          const categories = await db
            .collection('categories')
            .countDocuments({ storeId: storeB });
          await db.collection('categories').insertMany(
            Array.from({ length: 200 - categories }, (_, n) => ({
              storeId: storeB,
              name: 'تصنيف حد ' + n,
              slug: 'quota-' + n,
              version: 0,
            })),
          );
          assert.equal(
            (await b.write('/merchant/products', input({ slug: 'over-quota' })))
              .status,
            409,
          );
          assert.equal(
            (
              await b.write('/merchant/categories', {
                name: 'تصنيف زائد',
                slug: 'over-quota',
              })
            ).status,
            409,
          );
          assert.equal(
            await db.collection('products').countDocuments({ storeId: storeB }),
            1000,
          );
          assert.equal(
            await db
              .collection('categories')
              .countDocuments({ storeId: storeB }),
            200,
          );
        },
      );
      await t.test(
        'local MP4 upload checks container, store ownership, public publishing and byte ranges',
        async () => {
          const { defaultDesign } = await import('@sallty/contracts');
          await db.collection('rateLimitBuckets').deleteMany({});
          const box = (type, payload = Buffer.alloc(0)) => {
            const size = Buffer.alloc(4);
            size.writeUInt32BE(payload.length + 8);
            return Buffer.concat([size, Buffer.from(type), payload]);
          };
          const content = Buffer.concat([
            box('ftyp', Buffer.from('isom0000')),
            box('moov'),
            box('mdat'),
          ]);
          const form = (buffer, name = 'store.mp4') => {
            const body = new FormData();
            body.append(
              'file',
              new Blob([buffer], { type: 'video/mp4' }),
              name,
            );
            return body;
          };
          assert.equal(
            (
              await a.write(
                '/merchant/videos',
                form(Buffer.from('<script>bad</script>')),
              )
            ).status,
            400,
          );
          const uploaded = await a.write('/merchant/videos', form(content));
          assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
          const id = uploaded.body.id;
          assert.equal((await b.request('/merchant/videos/' + id)).status, 404);
          const guest = new Client();
          assert.equal(
            (await guest.request('/public/stores/alpha/video/' + id)).status,
            404,
          );
          const current = await a.request('/merchant/design');
          const design = {
            ...defaultDesign(),
            videoType: 'upload',
            videoAssetId: id,
          };
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                { design, version: current.body.version },
                'PATCH',
              )
            ).status,
            200,
          );
          assert.equal(
            (await b.write('/merchant/design', { design, version: 0 }, 'PATCH'))
              .status,
            400,
          );
          const published = await guest.request('/public/stores/alpha');
          assert.equal(
            published.body.store.design.videoUrl,
            '/api/v1/public/stores/alpha/video/' + id,
          );
          assert.equal('videoAssetId' in published.body.store.design, false);
          const range = await guest.request(
            '/public/stores/alpha/video/' + id,
            'GET',
            undefined,
            { Range: 'bytes=0-7' },
          );
          assert.equal(range.status, 206);
          assert.deepEqual(range.body, content.subarray(0, 8));
          assert.equal(range.response.headers.get('content-type'), 'video/mp4');
          assert.equal(
            (await guest.request('/public/stores/beta/video/' + id)).status,
            404,
          );
          assert.equal(
            (await a.write('/merchant/videos/' + id, {}, 'DELETE')).status,
            409,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                { design: defaultDesign(), version: current.body.version + 1 },
                'PATCH',
              )
            ).status,
            200,
          );
          assert.equal(
            (await a.write('/merchant/videos/' + id, {}, 'DELETE')).status,
            200,
          );
          assert.equal((await a.request('/merchant/videos/' + id)).status, 404);
        },
      );
    } finally {
      if (child?.pid && child.exitCode === null) {
        if (process.platform === 'win32')
          spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else child.kill('SIGTERM');
      }
      if (
        connection.readyState === 1 &&
        connection.name === dbName &&
        /^sallty_catalog_test_[a-f\d]{32}$/.test(dbName)
      )
        await connection.dropDatabase();
      await connection.close();
      assert.ok(
        uploadRoot.startsWith(resolve(workspace, '.local') + sep) &&
          uploadRoot.endsWith(dbName),
      );
      await rm(uploadRoot, { recursive: true, force: true });
    }
  },
);
