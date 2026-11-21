import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDesign,
  designSchema,
  THEMES,
  youtubeId,
  publicProductSchema,
  productInputSchema,
  sectionSchema,
  designDraftSchema,
} from '@sallty/contracts';
import { validateVideo } from '../src/modules/catalog/storage.js';
import { sendVideo } from '../src/modules/catalog/video-response.js';
import type { Response } from 'express';
test('visual builder bounds sections, rejects unsafe actions and duplicate identities', () => {
  const unfinished = { ...defaultDesign(), videoType: 'youtube', videoUrl: '' };
  assert.equal(designDraftSchema.safeParse(unfinished).success, true);
  assert.equal(designSchema.safeParse(unfinished).success, false);
  const hiddenVideo = sectionSchema.parse({
    id: 'hidden-video',
    kind: 'video',
    enabled: false,
    videoType: 'youtube',
  });
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      customLayout: true,
      sections: [hiddenVideo],
    }).success,
    true,
  );
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      customLayout: true,
      sections: [{ ...hiddenVideo, enabled: true }],
    }).success,
    false,
  );
  const section = sectionSchema.parse({
    id: 'promo',
    kind: 'promotion',
    title: 'عرض خاص',
  });
  assert.equal(
    designSchema.safeParse({ ...defaultDesign(), sections: [section] }).success,
    true,
  );
  assert.equal(
    designSchema.safeParse({ ...defaultDesign(), sections: [section, section] })
      .success,
    false,
  );
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      sections: Array.from({ length: 21 }, (_, index) => ({
        ...section,
        id: 'promo-' + index,
      })),
    }).success,
    false,
  );
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      sections: [{ ...section, buttonUrl: 'javascript:alert(1)' }],
    }).success,
    false,
  );
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      sections: [{ ...section, kind: 'html', body: '<script>bad</script>' }],
    }).success,
    false,
  );
});

test('design validates ten themes, content bounds and safe video/contact URLs', () => {
  assert.equal(THEMES.length, 10);
  assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 10);
  for (const theme of THEMES)
    assert.equal(
      designSchema.safeParse({ ...defaultDesign(), theme: theme.id }).success,
      true,
    );
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'http://example.test',
    'https://user:password@example.test',
  ]) {
    assert.equal(
      designSchema.safeParse({
        ...defaultDesign(),
        contact: { ...defaultDesign().contact, facebook: url },
      }).success,
      false,
    );
  }
  assert.equal(
    youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ',
  );
  assert.equal(
    youtubeId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'),
    null,
  );
  assert.equal(
    designSchema.safeParse({
      ...defaultDesign(),
      videoType: 'youtube',
      videoUrl: 'https://evil.test/embed/dQw4w9WgXcQ',
    }).success,
    false,
  );
  assert.equal(
    designSchema.safeParse({ ...defaultDesign(), ownerId: 'foreign' }).success,
    false,
  );
});
test('active digital products require private delivery; public DTO rejects delivery contents', () => {
  const product = {
    name: 'كتاب رقمي',
    slug: 'digital-book',
    description: '',
    pricePiastres: 1000,
    compareAtPricePiastres: null,
    sku: null,
    stockQuantity: 10,
    categoryId: null,
    imageIds: [],
    status: 'ACTIVE',
  };
  assert.equal(productInputSchema.safeParse(product).success, true);
  assert.equal(
    productInputSchema.safeParse({ ...product, type: 'DIGITAL' }).success,
    false,
  );
  assert.equal(
    productInputSchema.safeParse({
      ...product,
      type: 'DIGITAL',
      digitalDelivery: {
        automatic: true,
        url: 'https://example.test/private-book',
      },
    }).success,
    true,
  );
  assert.equal(
    productInputSchema.safeParse({
      ...product,
      digitalDelivery: {
        automatic: true,
        url: 'https://example.test/private-book',
      },
    }).success,
    false,
  );
  assert.equal(
    publicProductSchema.safeParse({
      name: product.name,
      slug: product.slug,
      description: '',
      pricePiastres: 1000,
      compareAtPricePiastres: null,
      inStock: true,
      category: null,
      images: [],
      type: 'DIGITAL',
      digitalDelivery: {
        url: 'https://example.test/private-book',
        automatic: true,
      },
    }).success,
    false,
  );
});
test('video upload rejects spoofing, truncation, unknown containers and unsafe filenames', () => {
  const box = (name: string, bytes = Buffer.alloc(0)) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + bytes.length);
    return Buffer.concat([size, Buffer.from(name), bytes]);
  };
  const content = Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box('moov'),
    box('mdat'),
  ]);
  const file = {
    buffer: content,
    mimetype: 'video/mp4',
    originalname: 'store.mp4',
  };
  assert.equal(validateVideo(file), content);
  for (const input of [
    { ...file, buffer: Buffer.from('<script>alert(1)</script>') },
    { ...file, buffer: content.subarray(0, 18) },
    { ...file, mimetype: 'text/html' },
    { ...file, originalname: 'store.html' },
    { ...file, buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
  ])
    assert.throws(() => validateVideo(input));
});
test('video supports bounded byte ranges and rejects multiple or invalid ranges', () => {
  const data = Buffer.from('0123456789');
  for (const [range, status, body] of [
    ['bytes=2-5', 206, '2345'],
    ['bytes=-3', 206, '789'],
    ['bytes=100-', 416, ''],
    ['bytes=1-2,4-5', 416, ''],
  ] as const) {
    let code = 200,
      sent = '';
    const response = {
      setHeader() {},
      status(value: number) {
        code = value;
        return this;
      },
      send(value: Buffer) {
        sent = value.toString();
      },
      end() {},
    } as unknown as Response;
    sendVideo(response, data, range);
    assert.equal(code, status);
    assert.equal(sent, body);
  }
});
