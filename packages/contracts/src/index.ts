import { z } from 'zod';
export * from './catalog.js';
export * from './storefront.js';
export * from './regional.js';
export * from './messages.js';
export * from './error-messages.js';
export * from './orders.js';
export * from './design.js';
import {
  countrySchema,
  currencySchema,
  internationalPhone,
} from './regional.js';

const email = z.string().trim().toLowerCase().max(254).email('اكتب إيميل صحيح');
const name = z
  .string()
  .trim()
  .min(2, 'الاسم لازم يكون حرفين على الأقل')
  .max(80, 'الاسم طويل زيادة');
export const registerSchema = z
  .strictObject({
    name,
    email,
    country: countrySchema.default('EG'),
    phone: z.string().min(1).max(40),
    password: z
      .string()
      .min(12, 'كلمة المرور لازم تكون 12 حرف على الأقل')
      .max(128, 'كلمة المرور طويلة زيادة'),
  })
  .transform((value, ctx) => {
    try {
      return {
        ...value,
        phone: internationalPhone(value.phone, value.country),
      };
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'رقم الهاتف غير صحيح للدولة المختارة',
      });
      return z.NEVER;
    }
  });
export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'اكتب كلمة المرور').max(128),
});
export const forgotPasswordSchema = z.strictObject({ email });
export const resetPasswordSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(128),
});
const reserved = new Set([
  'api',
  'auth',
  'admin',
  'dashboard',
  'login',
  'register',
  'onboarding',
  'store',
  'health',
  'support',
  'sallty',
  'www',
]);
const storeName = name;
export const createStoreSchema = z.strictObject({
  name: storeName,
  country: countrySchema.default('EG'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'الـ slug لازم يكون 3 حروف على الأقل')
    .max(50)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'استخدم حروف إنجليزي صغيرة وأرقام وشرطة بين الكلمات',
    )
    .refine((value) => !reserved.has(value), 'الاسم ده محجوز'),
});
export const updateStoreSchema = z.strictObject({ name: storeName });
export const userSchema = z.strictObject({
  country: countrySchema.default('EG'),
  role: z.enum(['MERCHANT', 'ADMIN']).default('MERCHANT'),
  emailVerified: z.boolean(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
});
export const storeSchema = z.strictObject({
  country: countrySchema.default('EG'),
  currency: currencySchema.default('EGP'),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export const authResponseSchema = z.strictObject({
  user: userSchema,
  verificationEmailSent: z.boolean().optional(),
});
export const verifyEmailSchema = z.strictObject({
  code: z
    .string()
    .transform((value) =>
      value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660)),
    )
    .pipe(z.string().regex(/^\d{6}$/, 'اكتب الكود المكوّن من 6 أرقام')),
});
export const storeResponseSchema = z.strictObject({ store: storeSchema });
export const csrfResponseSchema = z.strictObject({ csrfToken: z.string() });
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type Merchant = z.infer<typeof userSchema>;
export type MerchantStore = z.infer<typeof storeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
