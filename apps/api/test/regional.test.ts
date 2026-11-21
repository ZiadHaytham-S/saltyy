import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moneyToMinor,
  minorToInput,
  internationalPhone,
  ARAB_COUNTRIES,
  countryCurrencies,
  registerSchema,
  createStoreSchema,
} from '@sallty/contracts';
test('all 22 Arab countries have currencies and money uses exact minor units', () => {
  assert.equal(ARAB_COUNTRIES.length, 22);
  for (const country of ARAB_COUNTRIES) assert.ok(countryCurrencies[country]);
  for (const [value, currency, minor] of [
    ['129.99', 'EGP', 12999],
    ['12.345', 'KWD', 12345],
    ['0.001', 'JOD', 1],
    ['250', 'DJF', 250],
    ['٣٫١٢٣', 'BHD', 3123],
  ] as const) {
    assert.equal(moneyToMinor(value, currency), minor);
    assert.equal(moneyToMinor(minorToInput(minor, currency), currency), minor);
  }
  for (const value of ['0', '-1', '1e3', '1.1234'])
    assert.throws(() => moneyToMinor(value, 'KWD'));
  assert.throws(() => moneyToMinor('1.1', 'DJF'));
});
test('international phone validates selected country; roles and currency cannot be mass assigned', () => {
  assert.equal(internationalPhone('٠١٠١٢٣٤٥٦٧٨', 'EG'), '+201012345678');
  assert.equal(internationalPhone('0501234567', 'SA'), '+966501234567');
  assert.throws(() => internationalPhone('+966501234567', 'EG'));
  const input = {
    name: 'Merchant',
    email: 'merchant@example.test',
    country: 'SA',
    phone: '0501234567',
    password: 'a-long-password-123',
  };
  assert.equal(registerSchema.safeParse(input).success, true);
  assert.equal(
    registerSchema.safeParse({ ...input, role: 'ADMIN' }).success,
    false,
  );
  assert.equal(
    createStoreSchema.safeParse({
      name: 'English Store',
      country: 'SA',
      slug: 'english-store',
    }).success,
    true,
  );
  assert.equal(
    createStoreSchema.safeParse({
      name: 'Store',
      slug: 'store-test',
      currency: 'USD',
    }).success,
    false,
  );
});
