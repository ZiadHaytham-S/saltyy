import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  egpToPiastres,
  piastresToInput,
  productInputSchema,
  catalogQuerySchema,
  MAX_IMAGE_BYTES,
} from '@sallty/contracts';
import {
  normalizeImage,
  LocalStorageAdapter,
} from '../src/modules/catalog/storage.js';
import { escapeSearch } from '../src/modules/catalog/catalog.service.js';
test('EGP uses exact bounded integer piastres, including Arabic digits', () => {
  for (const [input, expected] of [
    ['0.01', 1],
    ['125.50', 12550],
    ['٠٫٢٩', 29],
    ['۰٫۲۹', 29],
    ['1000000', 100000000],
  ] as const) {
    assert.equal(egpToPiastres(input), expected);
    assert.equal(egpToPiastres(piastresToInput(expected)), expected);
  }
  for (const input of [
    '0',
    '-1',
    '1.001',
    '1e4',
    'NaN',
    '1,000',
    '1000000.01',
    'Infinity',
  ])
    assert.throws(() => egpToPiastres(input));
});
test('catalog allowlists reject operators, decimal stock, bad prices and image duplicates', () => {
  const valid = {
    name: 'منتج تجريبي',
    slug: 'test-product',
    description: '<script>plain text</script>',
    pricePiastres: 12550,
    compareAtPricePiastres: null,
    sku: null,
    stockQuantity: 2,
    categoryId: null,
    imageIds: [],
    status: 'DRAFT',
  };
  assert.ok(productInputSchema.safeParse(valid).success);
  for (const patch of [
    { storeId: 'forged' },
    { name: { $ne: null } },
    { stockQuantity: 1.2 },
    { pricePiastres: 1.01 },
    { compareAtPricePiastres: 12550 },
    { imageIds: ['a'.repeat(24), 'a'.repeat(24)] },
    { sku: '$unsafe' },
  ])
    assert.equal(
      productInputSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
  for (const query of [
    { page: '0' },
    { pageSize: '51' },
    { q: { $regex: '.*' } },
    { storeId: 'forged' },
    { status: ['DRAFT', 'ACTIVE'] },
  ])
    assert.equal(catalogQuerySchema.safeParse(query).success, false);
  const literal = '.*[test](a)+$';
  assert.equal(new RegExp(escapeSearch(literal)).test(literal), true);
  assert.equal(new RegExp(escapeSearch(literal)).test('anything'), false);
});
test('images are fully decoded, resized and reencoded without EXIF metadata', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const buffer = await sharp({
      create: { width: 2100, height: 12, channels: 3, background: '#176bff' },
    })
      .withMetadata()
      .toFormat(format)
      .toBuffer();
    const image = await normalizeImage({
      buffer,
      originalname: 'photo.' + format,
      mimetype: 'image/' + format,
    });
    const metadata = await sharp(image.content).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 2048);
    assert.equal(metadata.exif, undefined);
  }
});
test('unsafe, spoofed, truncated, animated and oversized images are rejected', async () => {
  const png = await sharp({
    create: { width: 5, height: 5, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const frames = Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]);
  const animated = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  const huge = await sharp({
    create: { width: 4001, height: 4001, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  for (const file of [
    {
      buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
      mimetype: 'image/svg+xml',
      originalname: 'x.svg',
    },
    { buffer: png, mimetype: 'image/jpeg', originalname: 'x.jpg' },
    { buffer: png, mimetype: 'image/png', originalname: 'x.exe' },
    {
      buffer: png.subarray(0, 24),
      mimetype: 'image/png',
      originalname: 'x.png',
    },
    {
      buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1),
      mimetype: 'image/png',
      originalname: 'x.png',
    },
    { buffer: huge, mimetype: 'image/png', originalname: 'x.png' },
    { buffer: animated, mimetype: 'image/webp', originalname: 'x.webp' },
  ])
    await assert.rejects(normalizeImage(file));
});
test('image processing rejects excess concurrent decodes and releases capacity', async () => {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const file = { buffer, mimetype: 'image/png', originalname: 'photo.png' };
  const results = await Promise.allSettled([
    normalizeImage(file),
    normalizeImage(file),
    normalizeImage(file),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'fulfilled', 'rejected'],
  );
  const failure = results[2];
  assert.ok(failure?.status === 'rejected');
  assert.equal(failure.reason.getStatus(), 503);
  assert.ok((await normalizeImage(file)).content.length > 0);
});
test('local storage rejects traversal and user-chosen paths before filesystem access', async () => {
  const storage = new LocalStorageAdapter();
  for (const key of [
    '../secret.env',
    'C:\\secret.env',
    '/etc/passwd',
    'a'.repeat(24) + '/../x.webp',
    'a'.repeat(24) + '/' + 'b'.repeat(32) + '.svg',
  ]) {
    await assert.rejects(storage.read(key));
    await assert.rejects(storage.put(key, Buffer.from('x')));
    await assert.rejects(storage.remove(key));
  }
});
