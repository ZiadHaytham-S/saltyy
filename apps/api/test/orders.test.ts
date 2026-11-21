import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutSchema,
  cartSchema,
  customerSchema,
  checkedTotal,
  orderQuerySchema,
  ORDER_TRANSITIONS,
  shippingSchema,
  shippingFeeToMinor,
} from '@sallty/contracts';
const customer = {
  name: 'عميل تجريبي',
  phone: '٠١٠١٢٣٤٥٦٧٨',
  governorate: 'القاهرة',
  city: 'مدينة نصر',
  address: 'شارع تجريبي رقم 10',
  notes: '',
};
test('checkout strict input prevents price, tenant and payment injection; bounded Egyptian data', () => {
  const input = {
    items: [{ slug: 'shirt-blue', quantity: 2 }],
    customer,
    paymentMethod: 'COD',
    quoteToken: 'a'.repeat(43),
  };
  assert.equal(checkoutSchema.safeParse(input).success, true);
  for (const patch of [
    { totalPiastres: 1 },
    { storeId: 'a'.repeat(24) },
    { paymentMethod: 'CARD' },
    { items: [{ slug: 'shirt-blue', quantity: 1, price: 1 }] },
    { customer: { ...customer, phone: '+966501234567' } },
  ])
    assert.equal(
      checkoutSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
  assert.equal(customerSchema.parse(customer).phone, '+201012345678');
  assert.equal(
    cartSchema.safeParse({
      items: [
        { slug: 'shirt-blue', quantity: 1 },
        { slug: 'shirt-blue', quantity: 1 },
      ],
    }).success,
    false,
  );
  assert.equal(
    cartSchema.safeParse({ items: [{ slug: 'shirt-blue', quantity: 101 }] })
      .success,
    false,
  );
  assert.equal(orderQuerySchema.safeParse({ q: { $ne: null } }).success, false);
  assert.equal(
    shippingSchema.safeParse({ shippingFeePiastres: 0, storeId: 'other' })
      .success,
    false,
  );
});
test('safe totals and terminal order states protect financial and cancellation rules', () => {
  assert.equal(checkedTotal([12550 * 2, 3500]), 28600);
  assert.equal(checkedTotal([200_000_000_000, 1_000_000]), 200_001_000_000);
  assert.throws(() => checkedTotal([200_001_000_001]));
  assert.equal(shippingFeeToMinor('٠٫٠٠'), 0);
  assert.equal(shippingFeeToMinor('۳۵٫۵۰'), 3550);
  assert.equal(shippingFeeToMinor('10000.00'), 1_000_000);
  for (const value of ['-1', '0.001', '1e3', '10000.01'])
    assert.throws(() => shippingFeeToMinor(value));
  assert.throws(() => checkedTotal([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() => checkedTotal([0.1]));
  assert.deepEqual(ORDER_TRANSITIONS.CANCELLED, []);
  assert.deepEqual(ORDER_TRANSITIONS.DELIVERED, []);
  assert.equal(ORDER_TRANSITIONS.SHIPPED.includes('CANCELLED'), false);
  assert.equal(ORDER_TRANSITIONS.PROCESSING.includes('CANCELLED'), true);
});
