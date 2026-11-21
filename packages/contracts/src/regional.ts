import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
export const ARAB_COUNTRIES = [
  'EG',
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'JO',
  'PS',
  'LB',
  'SY',
  'IQ',
  'YE',
  'MA',
  'DZ',
  'TN',
  'LY',
  'SD',
  'MR',
  'SO',
  'DJ',
  'KM',
] as const;
export const countrySchema = z.enum(ARAB_COUNTRIES);
export const countryCurrencies = {
  EG: 'EGP',
  SA: 'SAR',
  AE: 'AED',
  KW: 'KWD',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
  JO: 'JOD',
  PS: 'ILS',
  LB: 'LBP',
  SY: 'SYP',
  IQ: 'IQD',
  YE: 'YER',
  MA: 'MAD',
  DZ: 'DZD',
  TN: 'TND',
  LY: 'LYD',
  SD: 'SDG',
  MR: 'MRU',
  SO: 'SOS',
  DJ: 'DJF',
  KM: 'KMF',
} as const;
export const currencySchema = z.enum([
  'EGP',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'JOD',
  'ILS',
  'LBP',
  'SYP',
  'IQD',
  'YER',
  'MAD',
  'DZD',
  'TND',
  'LYD',
  'SDG',
  'MRU',
  'SOS',
  'DJF',
  'KMF',
]);
export type Currency = z.infer<typeof currencySchema>;
export type ArabCountry = z.infer<typeof countrySchema>;
export const countryNames: Record<ArabCountry, { ar: string; en: string }> = {
  EG: { ar: 'مصر', en: 'Egypt' },
  SA: { ar: 'السعودية', en: 'Saudi Arabia' },
  AE: { ar: 'الإمارات', en: 'United Arab Emirates' },
  KW: { ar: 'الكويت', en: 'Kuwait' },
  QA: { ar: 'قطر', en: 'Qatar' },
  BH: { ar: 'البحرين', en: 'Bahrain' },
  OM: { ar: 'عُمان', en: 'Oman' },
  JO: { ar: 'الأردن', en: 'Jordan' },
  PS: { ar: 'فلسطين', en: 'Palestine' },
  LB: { ar: 'لبنان', en: 'Lebanon' },
  SY: { ar: 'سوريا', en: 'Syria' },
  IQ: { ar: 'العراق', en: 'Iraq' },
  YE: { ar: 'اليمن', en: 'Yemen' },
  MA: { ar: 'المغرب', en: 'Morocco' },
  DZ: { ar: 'الجزائر', en: 'Algeria' },
  TN: { ar: 'تونس', en: 'Tunisia' },
  LY: { ar: 'ليبيا', en: 'Libya' },
  SD: { ar: 'السودان', en: 'Sudan' },
  MR: { ar: 'موريتانيا', en: 'Mauritania' },
  SO: { ar: 'الصومال', en: 'Somalia' },
  DJ: { ar: 'جيبوتي', en: 'Djibouti' },
  KM: { ar: 'جزر القمر', en: 'Comoros' },
};
export function currencyDigits(currency: Currency) {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function minorToInput(value: number, currency: Currency = 'EGP') {
  const digits = currencyDigits(currency),
    factor = 10 ** digits;
  return (
    Math.trunc(value / factor) +
    (digits ? '.' + String(value % factor).padStart(digits, '0') : '')
  );
}
export function moneyToMinor(input: string, currency: Currency = 'EGP') {
  const value = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace('٫', '.');
  const digits = currencyDigits(currency);
  if (
    !new RegExp(
      '^\\d{1,9}' + (digits ? '(?:\\.\\d{1,' + digits + '})?' : '') + '$',
    ).test(value)
  )
    throw new Error('صيغة السعر غير صحيحة لهذه العملة');
  const [whole = '0', fraction = ''] = value.split('.'),
    result =
      Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(result) || result < 1 || result > 100_000_000)
    throw new Error('السعر خارج النطاق المسموح');
  return result;
}
export function internationalPhone(input: string, country: ArabCountry) {
  const normalized = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/^00/, '+');
  const phone = parsePhoneNumberFromString(normalized, country);
  if (!phone?.isValid() || phone.country !== country)
    throw new Error('رقم الهاتف غير صحيح للدولة المختارة');
  return phone.number;
}

export function normalizeEgyptianPhone(input: string): string {
  let value = input
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\s()-]/g, '');
  if (value.startsWith('0020')) value = '+20' + value.slice(4);
  if (value.startsWith('0')) value = '+20' + value.slice(1);
  return value;
}
