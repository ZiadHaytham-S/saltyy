import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  publicSlugSchema,
  storefrontQuerySchema,
  publicProductSchema,
} from '@sallty/contracts';
test('public query rejects operators, tenant overrides, unbounded pages and imprecise prices', () => {
  for (const query of [
    { q: { $ne: '' } },
    { storeId: 'foreign' },
    { status: 'DRAFT' },
    { page: '0' },
    { page: '101' },
    { page: ['1', '2'] },
    { minPrice: '1.5' },
    { minPrice: '1e3' },
    { minPrice: '-1' },
    { minPrice: '100000001' },
    { minPrice: '200', maxPrice: '100' },
    { sort: '$natural' },
  ])
    assert.equal(storefrontQuerySchema.safeParse(query).success, false);
  assert.deepEqual(
    storefrontQuerySchema.parse({ minPrice: '12999', maxPrice: '12999' }),
    { minPrice: 12999, maxPrice: 12999, sort: 'newest', page: 1 },
  );
});
test('public slugs are bounded route identifiers rather than database filters or paths', () => {
  for (const slug of [
    '../admin',
    '$ne',
    'a'.repeat(81),
    'UPPERCASE',
    'a/b',
    'ab',
    'hello--world',
  ])
    assert.equal(publicSlugSchema.safeParse(slug).success, false);
  assert.equal(publicSlugSchema.safeParse('shop-mart').success, true);
});
test('public product contract rejects sensitive internal fields', () => {
  const product = {
    name: 'قميص أزرق',
    slug: 'blue-shirt',
    description: '',
    pricePiastres: 12999,
    compareAtPricePiastres: null,
    inStock: true,
    category: null,
    images: [],
  };
  assert.equal(publicProductSchema.safeParse(product).success, true);
  for (const field of [
    'ownerId',
    'storeId',
    'email',
    'sku',
    'stockQuantity',
    'imageIds',
    'version',
  ])
    assert.equal(
      publicProductSchema.safeParse({ ...product, [field]: 'internal' })
        .success,
      false,
    );
});
