import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import mongoose from 'mongoose';
const dbName = 'sallty_orders_test_' + randomUUID().replaceAll('-', ''),
  mongo = new URL(
    process.env.MONGODB_URI ??
      'mongodb://127.0.0.1:27017/sallty?replicaSet=rs0&directConnection=true',
  );
mongo.pathname = '/' + dbName;
const origin = 'http://127.0.0.1:3100',
  secret = randomBytes(32).toString('hex'),
  hash = (v) => createHash('sha256').update(v).digest('hex'),
  key = () => randomBytes(32).toString('base64url');
let port;
class Client {
  jar = new Map();
  async request(path, method = 'GET', body, headers = {}) {
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method,
      headers: {
        Cookie: [...this.jar].map(([k, v]) => k + '=' + v).join('; '),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0],
        at = pair.indexOf('=');
      this.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return { status: response.status, body: await response.json() };
  }
  async write(path, body, method = 'POST', headers = {}) {
    const csrf = await this.request('/auth/csrf');
    assert.equal(csrf.status, 200);
    return this.request(path, method, body, {
      Origin: origin,
      'X-CSRF-Token': csrf.body.csrfToken,
      ...headers,
    });
  }
}
const customer = {
  name: 'عميل الاختبار',
  phone: '01012345678',
  governorate: 'القاهرة',
  city: 'مدينة نصر',
  address: 'شارع الاختبار رقم 10',
  notes: 'ملاحظة خاصة',
};
test(
  'Orders: real replica-set financial integrity, isolation, retries and privacy',
  { timeout: 180000 },
  async (t) => {
    const connection = mongoose.createConnection(mongo.toString(), {
      serverSelectionTimeoutMS: 5000,
    });
    let child,
      output = '';
    try {
      await connection.asPromise();
      const db = connection.db;
      assert.equal((await db.admin().command({ hello: 1 })).setName, 'rs0');
      const a = new Client(),
        b = new Client(),
        guest = new Client(),
        storeA = new mongoose.Types.ObjectId(),
        storeB = new mongoose.Types.ObjectId();
      for (const [client, storeId, slug] of [
        [a, storeA, 'alpha'],
        [b, storeB, 'beta'],
      ]) {
        const userId = new mongoose.Types.ObjectId(),
          token = key();
        await db.collection('users').insertOne({
          _id: userId,
          name: 'Merchant',
          email: slug + '@example.test',
          phone: '+201012345678',
          passwordHash: 'unused',
          emailVerifiedAt: new Date(),
        });
        await db.collection('sessions').insertOne({
          userId,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 3600000),
          lastSeenAt: new Date(),
        });
        await db.collection('stores').insertOne({
          _id: storeId,
          ownerId: userId,
          name: 'متجر ' + slug,
          slug,
          country: 'EG',
          currency: 'EGP',
          catalogRevision: 0,
        });
        client.jar.set('sallty_session', token);
      }
      const server = createServer();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      port = server.address().port;
      await new Promise((r) => server.close(r));
      child = spawn(process.execPath, ['dist/main.js'], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          API_PORT: String(port),
          API_HOST: '127.0.0.1',
          APP_ORIGIN: origin,
          CSRF_SECRET: secret,
          MONGODB_URI: mongo.toString(),
          APPLICATION_PASSWORD: '',
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (v) => {
          output = (output + v).slice(-2500);
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
      async function product(
        slug,
        stock = 10,
        status = 'ACTIVE',
        storeId = storeA,
      ) {
        const id = new mongoose.Types.ObjectId();
        await db.collection('products').insertOne({
          _id: id,
          storeId,
          name: 'منتج ' + slug,
          slug,
          description: '',
          pricePiastres: 12550,
          compareAtPricePiastres: null,
          stockQuantity: stock,
          status,
          categoryId: null,
          imageIds: [],
          version: 0,
        });
        return id;
      }
      async function quote(items, slug = 'alpha') {
        return await guest.write('/public/stores/' + slug + '/cart/quote', {
          items,
        });
      }
      async function order(
        items,
        token = key(),
        patch = {},
        slug = 'alpha',
        client = guest,
      ) {
        const q = await quote(items, slug);
        assert.equal(q.status, 201);
        return await client.write(
          '/public/stores/' + slug + '/checkout',
          {
            items,
            customer,
            paymentMethod: 'COD',
            quoteToken: q.body.quoteToken ?? 'a'.repeat(43),
            ...patch,
          },
          'POST',
          { 'Idempotency-Key': token },
        );
      }
      let main;
      await t.test(
        'shipping requires explicit setting and ownership; Egyptian checkout only',
        async () => {
          const id = await product('initial');
          const items = [{ slug: 'initial', quantity: 1 }];
          assert.equal((await quote(items)).body.checkoutEnabled, false);
          assert.equal((await order(items)).status, 409);
          assert.equal(
            (await db.collection('products').findOne({ _id: id }))
              .stockQuantity,
            10,
          );
          assert.equal(
            (await new Client().request('/merchant/shipping')).status,
            401,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/shipping',
                { shippingFeePiastres: 3500 },
                'PATCH',
              )
            ).status,
            200,
          );
          assert.equal(
            (await b.request('/merchant/shipping')).body.shippingFeePiastres,
            null,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/shipping',
                { shippingFeePiastres: 0, storeId: String(storeB) },
                'PATCH',
              )
            ).status,
            400,
          );
          await db.collection('stores').updateOne(
            { _id: storeB },
            {
              $set: {
                country: 'SA',
                currency: 'SAR',
                shippingFeePiastres: 0,
              },
            },
          );
          await product('saudi-only', 10, 'ACTIVE', storeB);
          assert.equal(
            (
              await order(
                [{ slug: 'saudi-only', quantity: 1 }],
                key(),
                {},
                'beta',
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        'active products and associations must belong to target store; forged prices and quantities rejected',
        async () => {
          await product('hidden-draft', 10, 'DRAFT');
          await product('hidden-archived', 10, 'ARCHIVED');
          await product('empty-stock', 0);
          for (const slug of [
            'hidden-draft',
            'hidden-archived',
            'empty-stock',
            'saudi-only',
            'not-real',
          ])
            assert.equal((await order([{ slug, quantity: 1 }])).status, 409);
          const items = [{ slug: 'initial', quantity: 1 }];
          assert.equal(
            (await order(items, key(), { totalPiastres: 1 })).status,
            400,
          );
          assert.equal(
            (await order(items, key(), { paymentMethod: 'CARD' })).status,
            400,
          );
          const q = await quote(items);
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/checkout',
                {
                  items: [{ slug: 'initial', quantity: 1, pricePiastres: 1 }],
                  customer,
                  paymentMethod: 'COD',
                  quoteToken: q.body.quoteToken,
                },
                'POST',
                { 'Idempotency-Key': key() },
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await new Client().request(
                '/public/stores/alpha/checkout',
                'POST',
                {
                  items,
                  customer,
                  paymentMethod: 'COD',
                  quoteToken: q.body.quoteToken,
                },
                { Origin: origin, 'Idempotency-Key': key() },
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/cart/quote', {
                items: [{ slug: { $ne: null }, quantity: 1 }],
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        'changed product price or shipping requires renewed customer consent',
        async () => {
          const items = [{ slug: 'initial', quantity: 1 }],
            q = await quote(items);
          await db
            .collection('products')
            .updateOne(
              { storeId: storeA, slug: 'initial' },
              { $set: { pricePiastres: 12999 } },
            );
          const attempt = await guest.write(
            '/public/stores/alpha/checkout',
            {
              items,
              customer,
              paymentMethod: 'COD',
              quoteToken: q.body.quoteToken,
            },
            'POST',
            { 'Idempotency-Key': key() },
          );
          assert.equal(attempt.status, 409);
          assert.equal(attempt.body.code, 'QUOTE_CHANGED');
          const q2 = await quote(items);
          await a.write(
            '/merchant/shipping',
            { shippingFeePiastres: 4000 },
            'PATCH',
          );
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/checkout',
                {
                  items,
                  customer,
                  paymentMethod: 'COD',
                  quoteToken: q2.body.quoteToken,
                },
                'POST',
                { 'Idempotency-Key': key() },
              )
            ).status,
            409,
          );
          await a.write(
            '/merchant/shipping',
            { shippingFeePiastres: 3500 },
            'PATCH',
          );
        },
      );
      await t.test(
        'concurrent identical requests commit one order and stock movement, immutable exact snapshots',
        async () => {
          const items = [{ slug: 'initial', quantity: 2 }],
            token = key(),
            q = await quote(items);
          const clients = Array.from({ length: 5 }, () => new Client()),
            results = await Promise.all(
              clients.map((client) =>
                client.write(
                  '/public/stores/alpha/checkout',
                  {
                    items,
                    customer,
                    paymentMethod: 'COD',
                    quoteToken: q.body.quoteToken,
                  },
                  'POST',
                  { 'Idempotency-Key': token },
                ),
              ),
            );
          assert.ok(
            results.every((r) => r.status === 201),
            JSON.stringify(results.map((r) => r.body.code)),
          );
          assert.equal(new Set(results.map((r) => r.body.orderNumber)).size, 1);
          main = await db
            .collection('orders')
            .findOne({ storeId: storeA, idempotencyHash: hash(token) });
          assert.equal(main.totalPiastres, 12999 * 2 + 3500);
          assert.equal(main.customer.phone, '+201012345678');
          assert.equal(main.items[0].unitPricePiastres, 12999);
          assert.equal(
            (
              await db
                .collection('products')
                .findOne({ storeId: storeA, slug: 'initial' })
            ).stockQuantity,
            8,
          );
          assert.equal(
            await db
              .collection('orderMovements')
              .countDocuments({ orderId: main._id, kind: 'RESERVE' }),
            1,
          );
          assert.equal(
            await db.collection('orders').countDocuments({ storeId: storeA }),
            1,
          );
          assert.equal(
            (
              await order(items, token, {
                customer: { ...customer, name: 'Different' },
              })
            ).status,
            409,
          );
          assert.deepEqual(Object.keys(results[0].body).sort(), [
            'orderNumber',
            'receiptToken',
          ]);
          assert.doesNotMatch(
            JSON.stringify(results[0].body),
            /phone|customer|address|requestHash|storeId/,
          );
          const recovered = await guest.write(
            '/public/stores/alpha/checkout/recover',
            { token },
          );
          assert.equal(recovered.body.orderNumber, main.orderNumber);
          const receipt = await guest.write('/public/stores/alpha/receipt', {
            token: recovered.body.receiptToken,
          });
          assert.equal(receipt.status, 201);
          assert.deepEqual(Object.keys(receipt.body).sort(), [
            'orderNumber',
            'status',
          ]);
          assert.equal(
            (
              await guest.write('/public/stores/beta/receipt', {
                token: recovered.body.receiptToken,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/receipt', {
                token: key(),
              })
            ).status,
            404,
          );
          assert.equal(
            (await new Client().request('/merchant/orders/' + main._id)).status,
            401,
          );
          assert.equal(
            (await guest.request('/public/stores/alpha/orders/' + main._id))
              .status,
            404,
          );
          await db
            .collection('orders')
            .updateOne(
              { _id: main._id },
              { $set: { receiptExpiresAt: new Date(Date.now() - 1) } },
            );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/receipt', {
                token: recovered.body.receiptToken,
              })
            ).status,
            404,
          );
        },
      );
      await t.test(
        'merchant B cannot list, read or mutate merchant A orders; query allowlist and pagination',
        async () => {
          assert.equal((await b.request('/merchant/orders')).body.total, 0);
          assert.equal(
            (await b.request('/merchant/orders/' + main._id)).status,
            404,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/orders/' + main._id,
                { status: 'CANCELLED', version: 0 },
                'PATCH',
              )
            ).status,
            404,
          );
          assert.equal(
            (await a.request('/merchant/orders?storeId=' + storeB)).status,
            400,
          );
          assert.equal(
            (await a.request('/merchant/orders?q[$ne]=x')).status,
            400,
          );
          const list = await a.request(
            '/merchant/orders?q=' + main.orderNumber + '&pageSize=1',
          );
          assert.equal(list.status, 200);
          assert.equal(list.body.total, 1);
          assert.doesNotMatch(
            JSON.stringify(list.body),
            /customer|phone|address|receiptHash/,
          );
          assert.equal(
            (await a.request('/merchant/orders/' + main._id)).body.order
              .customer.address,
            customer.address,
          );
        },
      );
      await t.test(
        'overselling prevented when six customers race for one final unit',
        async () => {
          const productId = await product('last-piece', 1),
            items = [{ slug: 'last-piece', quantity: 1 }],
            q = await quote(items);
          const results = await Promise.all(
            Array.from({ length: 6 }, () =>
              new Client().write(
                '/public/stores/alpha/checkout',
                {
                  items,
                  customer,
                  paymentMethod: 'COD',
                  quoteToken: q.body.quoteToken,
                },
                'POST',
                { 'Idempotency-Key': key() },
              ),
            ),
          );
          assert.equal(results.filter((r) => r.status === 201).length, 1);
          assert.ok(
            results
              .filter((r) => r.status !== 201)
              .every((r) => r.status === 409),
          );
          assert.equal(
            (await db.collection('products').findOne({ _id: productId }))
              .stockQuantity,
            0,
          );
          assert.equal(
            await db
              .collection('orders')
              .countDocuments({ 'items.productId': productId }),
            1,
          );
        },
      );
      await t.test(
        'database write failure rolls back order, stock and audit; same key can safely retry',
        async () => {
          const productId = await product('rollback-check', 2),
            items = [{ slug: 'rollback-check', quantity: 1 }],
            token = key();
          await db.command({
            collMod: 'orders',
            validator: { 'customer.name': { $ne: 'رفض تجريبي' } },
            validationLevel: 'strict',
            validationAction: 'error',
          });
          const result = await order(items, token, {
            customer: { ...customer, name: 'رفض تجريبي' },
          });
          assert.equal(result.status, 503);
          assert.equal(
            (await db.collection('products').findOne({ _id: productId }))
              .stockQuantity,
            2,
          );
          assert.equal(
            await db
              .collection('orders')
              .countDocuments({ idempotencyHash: hash(token) }),
            0,
          );
          assert.equal(
            await db.collection('orderMovements').countDocuments({ productId }),
            0,
          );
          await db.command({
            collMod: 'orders',
            validator: {},
            validationLevel: 'strict',
          });
          assert.equal((await order(items, token)).status, 201);
        },
      );
      await t.test(
        'invalid transitions rejected; concurrent cancellation restores once even archived products',
        async () => {
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + main._id,
                { status: 'DELIVERED', version: 0 },
                'PATCH',
              )
            ).status,
            409,
          );
          await db.collection('products').updateOne(
            { storeId: storeA, slug: 'initial' },
            {
              $set: {
                status: 'ARCHIVED',
                name: 'اسم جديد',
                pricePiastres: 20000,
              },
            },
          );
          assert.equal(
            (await a.request('/merchant/orders/' + main._id)).body.order
              .items[0].name,
            main.items[0].name,
          );
          const results = await Promise.all([
            a.write(
              '/merchant/orders/' + main._id,
              { status: 'CANCELLED', version: 0 },
              'PATCH',
            ),
            a.write(
              '/merchant/orders/' + main._id,
              { status: 'CANCELLED', version: 0 },
              'PATCH',
            ),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          assert.equal(
            (
              await db
                .collection('products')
                .findOne({ storeId: storeA, slug: 'initial' })
            ).stockQuantity,
            10,
          );
          assert.equal(
            await db
              .collection('orderMovements')
              .countDocuments({ orderId: main._id, kind: 'RESTORE' }),
            1,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + main._id,
                { status: 'CANCELLED', version: 1 },
                'PATCH',
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        'full lifecycle and shipped/delivered terminal rules; shipping snapshots stay fixed',
        async () => {
          const orderRecord = await db
            .collection('orders')
            .findOne({ 'items.slug': 'rollback-check' });
          let version = 0;
          for (const status of [
            'CONFIRMED',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
          ]) {
            const result = await a.write(
              '/merchant/orders/' + orderRecord._id,
              { status, version },
              'PATCH',
            );
            assert.equal(result.status, 200);
            version++;
            assert.equal(result.body.order.version, version);
          }
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + orderRecord._id,
                { status: 'CANCELLED', version },
                'PATCH',
              )
            ).status,
            409,
          );
          await a.write(
            '/merchant/shipping',
            { shippingFeePiastres: 0 },
            'PATCH',
          );
          assert.equal(
            (await a.request('/merchant/orders/' + orderRecord._id)).body.order
              .shippingFeePiastres,
            3500,
          );
        },
      );
      await t.test(
        'multi-product cancellation failure rolls back all restored stock and audit writes',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          const first = await product('atomic-first', 3);
          const second = await product('atomic-second', 3);
          const result = await order([
            { slug: 'atomic-first', quantity: 1 },
            { slug: 'atomic-second', quantity: 1 },
          ]);
          assert.equal(result.status, 201);
          const saved = await db
            .collection('orders')
            .findOne({ orderNumber: result.body.orderNumber });
          assert.equal(
            saved.shippingFeePiastres,
            0,
            'Explicit zero enables free shipping',
          );
          await db
            .collection('products')
            .updateOne({ _id: second }, { $set: { stockQuantity: 1_000_000 } });
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + saved._id,
                { status: 'CANCELLED', version: 0 },
                'PATCH',
              )
            ).status,
            409,
          );
          assert.equal(
            (await db.collection('products').findOne({ _id: first }))
              .stockQuantity,
            2,
            'First restoration must roll back when the second product fails',
          );
          assert.equal(
            await db
              .collection('orderMovements')
              .countDocuments({ orderId: saved._id, kind: 'RESTORE' }),
            0,
          );
          const unchanged = await db
            .collection('orders')
            .findOne({ _id: saved._id });
          assert.equal(unchanged.status, 'PENDING');
          assert.equal(unchanged.version, 0);
          assert.equal(unchanged.stockRestored, false);
          await db
            .collection('products')
            .updateOne({ _id: second }, { $set: { stockQuantity: 2 } });
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + saved._id,
                { status: 'CANCELLED', version: 0 },
                'PATCH',
              )
            ).status,
            200,
          );
          for (const id of [first, second])
            assert.equal(
              (await db.collection('products').findOne({ _id: id }))
                .stockQuantity,
              3,
            );
          assert.equal(
            await db
              .collection('orderMovements')
              .countDocuments({ orderId: saved._id, kind: 'RESTORE' }),
            2,
          );
        },
      );
      await t.test(
        'checkout IP rate limit cannot be bypassed using forwarded headers',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          const items = [{ slug: 'rollback-check', quantity: 1 }],
            q = await quote(items),
            csrf = await guest.request('/auth/csrf');
          for (let n = 0; n < 30; n++) {
            const result = await guest.request(
              '/public/stores/alpha/checkout',
              'POST',
              { invalid: true },
              {
                Origin: origin,
                'X-CSRF-Token': csrf.body.csrfToken,
                'Idempotency-Key': key(),
                'X-Forwarded-For': '192.0.2.' + n,
              },
            );
            assert.equal(result.status, 400);
          }
          assert.equal(
            (
              await guest.request(
                '/public/stores/alpha/checkout',
                'POST',
                {
                  items,
                  customer,
                  paymentMethod: 'COD',
                  quoteToken: q.body.quoteToken,
                },
                {
                  Origin: origin,
                  'X-CSRF-Token': csrf.body.csrfToken,
                  'Idempotency-Key': key(),
                  'X-Forwarded-For': '192.0.2.250',
                },
              )
            ).status,
            429,
          );
        },
      );
      await t.test(
        'digital checkout has no address or shipping; payment and delivery are private, immutable and tenant-scoped',
        async () => {
          await db.collection('rateLimitBuckets').deleteMany({});
          const digitalId = await product('digital-book');
          await db.collection('products').updateOne(
            { _id: digitalId },
            {
              $set: {
                type: 'DIGITAL',
                digitalDelivery: {
                  automatic: true,
                  url: 'https://example.test/paid-book',
                },
              },
            },
          );
          await db
            .collection('stores')
            .updateOne(
              { _id: storeA },
              { $set: { shippingFeePiastres: null } },
            );
          const items = [{ slug: 'digital-book', quantity: 1 }],
            q = await quote(items),
            token = key();
          assert.equal(q.body.requiresShipping, false);
          assert.equal(q.body.shippingFeePiastres, 0);
          assert.equal(q.body.checkoutEnabled, true);
          assert.equal(q.body.paymentMethod, 'MANUAL');
          const input = {
            items,
            customer: { name: customer.name, phone: customer.phone, notes: '' },
            paymentMethod: 'MANUAL',
            quoteToken: q.body.quoteToken,
          };
          const created = await guest.write(
            '/public/stores/alpha/checkout',
            input,
            'POST',
            { 'Idempotency-Key': token },
          );
          assert.equal(created.status, 201, JSON.stringify(created.body));
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/checkout',
                input,
                'POST',
                { 'Idempotency-Key': token },
              )
            ).body.orderNumber,
            created.body.orderNumber,
          );
          const order = await db
            .collection('orders')
            .findOne({ idempotencyHash: hash(token) });
          assert.equal(order.customer.address, undefined);
          assert.equal(order.requiresShipping, false);
          assert.equal(order.shippingFeePiastres, 0);
          const capability = {
            token: created.body.receiptToken,
            productSlug: 'digital-book',
          };
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/digital-delivery',
                capability,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await new Client().write(
                '/merchant/orders/' + order._id + '/confirm-payment',
                { version: 0 },
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await b.write(
                '/merchant/orders/' + order._id + '/confirm-payment',
                { version: 0 },
              )
            ).status,
            404,
          );
          await db.collection('products').updateOne(
            { _id: digitalId },
            {
              $set: {
                digitalDelivery: {
                  automatic: true,
                  url: 'https://example.test/replacement',
                },
                status: 'ARCHIVED',
              },
            },
          );
          const payments = await Promise.all([
            a.write('/merchant/orders/' + order._id + '/confirm-payment', {
              version: 0,
            }),
            a.write('/merchant/orders/' + order._id + '/confirm-payment', {
              version: 0,
            }),
          ]);
          assert.deepEqual(
            payments.map((result) => result.status),
            [201, 201],
          );
          const paid = payments[0];
          assert.equal(paid.status, 201, JSON.stringify(paid.body));
          assert.equal(paid.body.order.paymentStatus, 'PAID');
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + order._id + '/confirm-payment',
                { version: 0 },
              )
            ).body.order.version,
            1,
          );
          const delivered = await guest.write(
            '/public/stores/alpha/digital-delivery',
            capability,
          );
          assert.equal(delivered.status, 201);
          assert.equal(delivered.body.url, 'https://example.test/paid-book');
          assert.equal(
            (
              await guest.write(
                '/public/stores/beta/digital-delivery',
                capability,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/digital-delivery', {
                ...capability,
                token: key(),
              })
            ).status,
            404,
          );
          const receipt = await guest.write('/public/stores/alpha/receipt', {
            token: capability.token,
          });
          assert.equal(receipt.body.digitalItems[0].available, true);
          assert.doesNotMatch(
            JSON.stringify(receipt.body),
            /example\.test|customer|address/,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + order._id,
                { status: 'CANCELLED', version: 1 },
                'PATCH',
              )
            ).status,
            409,
          );
          const manualId = await product('manual-digital');
          await db.collection('products').updateOne(
            { _id: manualId },
            {
              $set: {
                type: 'DIGITAL',
                digitalDelivery: {
                  automatic: false,
                  url: 'https://example.test/manual',
                },
              },
            },
          );
          const manual = await orderDigital('manual-digital');
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id + '/release-digital',
                { slug: 'manual-digital', version: 0 },
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id + '/confirm-payment',
                { version: 0 },
              )
            ).status,
            201,
          );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/digital-delivery', {
                token: manual.token,
                productSlug: 'manual-digital',
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id,
                { status: 'CONFIRMED', version: 1 },
                'PATCH',
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id,
                { status: 'PROCESSING', version: 2 },
                'PATCH',
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id,
                { status: 'SHIPPED', version: 3 },
                'PATCH',
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id,
                { status: 'DELIVERED', version: 3 },
                'PATCH',
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id + '/release-digital',
                { slug: 'manual-digital', version: 3 },
              )
            ).status,
            201,
          );
          assert.equal(
            (
              await guest.write('/public/stores/alpha/digital-delivery', {
                token: manual.token,
                productSlug: 'manual-digital',
              })
            ).body.url,
            'https://example.test/manual',
          );
          assert.equal(
            (
              await a.write(
                '/merchant/orders/' + manual.id,
                { status: 'DELIVERED', version: 4 },
                'PATCH',
              )
            ).status,
            200,
          );
          await db
            .collection('orders')
            .updateOne(
              { _id: order._id },
              { $set: { receiptExpiresAt: new Date(Date.now() - 1) } },
            );
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/digital-delivery',
                capability,
              )
            ).status,
            404,
          );
          await db
            .collection('stores')
            .updateOne(
              { _id: storeA },
              { $set: { shippingFeePiastres: 3500 } },
            );
          const physicalId = await product('mixed-physical');
          const mixed = [
              { slug: 'mixed-physical', quantity: 1 },
              { slug: 'manual-digital', quantity: 1 },
            ],
            mixedQuote = await quote(mixed);
          assert.equal(mixedQuote.body.requiresShipping, true);
          assert.equal(mixedQuote.body.shippingFeePiastres, 3500);
          assert.equal(
            (
              await guest.write(
                '/public/stores/alpha/checkout',
                {
                  items: mixed,
                  customer: { name: customer.name, phone: customer.phone },
                  paymentMethod: 'MANUAL',
                  quoteToken: mixedQuote.body.quoteToken,
                },
                'POST',
                { 'Idempotency-Key': key() },
              )
            ).status,
            400,
          );
          assert.equal(
            (await db.collection('products').findOne({ _id: physicalId }))
              .stockQuantity,
            10,
          );
          async function orderDigital(slug) {
            const items = [{ slug, quantity: 1 }],
              q = await quote(items),
              idempotency = key();
            const result = await guest.write(
              '/public/stores/alpha/checkout',
              {
                items,
                customer: { name: customer.name, phone: customer.phone },
                paymentMethod: 'MANUAL',
                quoteToken: q.body.quoteToken,
              },
              'POST',
              { 'Idempotency-Key': idempotency },
            );
            assert.equal(result.status, 201, JSON.stringify(result.body));
            const saved = await db
              .collection('orders')
              .findOne({ idempotencyHash: hash(idempotency) });
            return { id: saved._id, token: result.body.receiptToken };
          }
        },
      );
      await t.test(
        'ten store designs persist, protect asset ownership and reject unsafe URLs and stale edits',
        async () => {
          const { defaultDesign, THEMES } = await import('@sallty/contracts');
          let version = 0;
          for (const theme of THEMES) {
            const saved = await a.write(
              '/merchant/design',
              {
                design: {
                  ...defaultDesign(),
                  theme: theme.id,
                  primaryColor: theme.color,
                  heading: 'عنوان مخصص',
                  contact: {
                    ...defaultDesign().contact,
                    instagram: 'https://www.instagram.com/example/',
                  },
                },
                version,
              },
              'PATCH',
            );
            assert.equal(saved.status, 200, JSON.stringify(saved.body));
            version = saved.body.version;
            const storefront = await guest.request('/public/stores/alpha');
            assert.equal(storefront.body.store.design.theme, theme.id);
            assert.equal(storefront.body.store.design.heading, 'عنوان مخصص');
            assert.equal(
              (await b.request('/merchant/design')).body.design.theme,
              'sallty',
            );
          }
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                { design: defaultDesign(), version: 0 },
                'PATCH',
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                {
                  design: {
                    ...defaultDesign(),
                    videoType: 'youtube',
                    videoUrl: 'https://evil.test/test',
                  },
                  version,
                },
                'PATCH',
              )
            ).status,
            400,
          );
          const foreign = new mongoose.Types.ObjectId();
          await db.collection('mediaAssets').insertOne({
            _id: foreign,
            storeId: storeB,
            state: 'READY',
            key: String(storeB) + '/' + 'a'.repeat(32) + '.webp',
            bytes: 1,
            width: 1,
            height: 1,
          });
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                {
                  design: { ...defaultDesign(), logoId: String(foreign) },
                  version,
                },
                'PATCH',
              )
            ).status,
            400,
          );
          assert.equal(
            (await new Client().request('/merchant/design')).status,
            401,
          );
        },
      );
      await t.test(
        'builder drafts stay private; publishing preserves order and isolates nested media',
        async () => {
          const { defaultDesign, sectionSchema } =
            await import('@sallty/contracts');
          const current = await a.request('/merchant/design'),
            live = await guest.request('/public/stores/alpha');
          const promo = sectionSchema.parse({
            id: 'promo-one',
            kind: 'promotion',
            title: 'مسودة خاصة',
            body: '<script>plain text</script>',
          });
          const catalog = sectionSchema.parse({
            id: 'catalog',
            kind: 'products',
          });
          const hidden = sectionSchema.parse({
            id: 'hidden',
            kind: 'text',
            enabled: false,
            title: 'محتوى مخفي',
          });
          const design = {
            ...defaultDesign(),
            customLayout: true,
            heading: 'عنوان المسودة',
            sections: [promo, catalog, hidden],
          };
          const saved = await a.write(
            '/merchant/design',
            { design, version: current.body.version, publish: false },
            'PATCH',
          );
          assert.equal(saved.status, 200, JSON.stringify(saved.body));
          assert.equal(
            (await a.request('/merchant/design')).body.design.heading,
            'عنوان المسودة',
          );
          assert.equal(
            (await guest.request('/public/stores/alpha')).body.store.design
              .heading,
            live.body.store.design.heading,
          );
          assert.notEqual(
            (await b.request('/merchant/design')).body.design.heading,
            'عنوان المسودة',
          );
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                { design, version: current.body.version, publish: true },
                'PATCH',
              )
            ).status,
            409,
          );
          const published = await a.write(
            '/merchant/design',
            { design, version: saved.body.version, publish: true },
            'PATCH',
          );
          assert.equal(published.status, 200);
          const result = await guest.request('/public/stores/alpha');
          assert.deepEqual(
            result.body.store.design.sections.map((section) => section.id),
            ['promo-one', 'catalog'],
          );
          assert.doesNotMatch(
            JSON.stringify(result.body),
            /محتوى مخفي|imageId|videoAssetId|designDraft/,
          );
          const foreign = await db
            .collection('mediaAssets')
            .findOne({ storeId: storeB });
          assert.ok(foreign);
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                {
                  design: {
                    ...design,
                    sections: [{ ...promo, imageId: String(foreign._id) }],
                  },
                  version: published.body.version,
                  publish: false,
                },
                'PATCH',
              )
            ).status,
            400,
          );
          const large = {
            ...defaultDesign(),
            customLayout: true,
            sections: Array.from({ length: 20 }, (_, index) =>
              sectionSchema.parse({
                id: 'large-' + index,
                kind: 'text',
                body: 'ن'.repeat(2000),
              }),
            ),
          };
          assert.equal(
            (
              await a.write(
                '/merchant/design',
                {
                  design: large,
                  version: published.body.version,
                  publish: false,
                },
                'PATCH',
              )
            ).status,
            200,
          );
        },
      );
    } finally {
      if (child?.pid && child.exitCode === null)
        spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      if (
        connection.readyState === 1 &&
        connection.name === dbName &&
        /^sallty_orders_test_[a-f0-9]{32}$/.test(dbName)
      )
        await connection.dropDatabase();
      await connection.close();
    }
  },
);
