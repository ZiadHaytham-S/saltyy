import { z } from 'zod';
export const MAX_PRICE = 100_000_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function egpToPiastres(input: string): number {
  const value = input
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace('٫', '.');
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))
    throw new Error('اكتب سعر صحيح بحد أقصى رقمين بعد العلامة');
  const [whole = '', fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 1 || result > MAX_PRICE)
    throw new Error('السعر لازم يكون من قرش لمليون جنيه');
  return result;
}
export function piastresToInput(value: number): string {
  return Math.trunc(value / 100) + '.' + String(value % 100).padStart(2, '0');
}
export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'معرّف غير صحيح');
const arabicName = z
  .string()
  .trim()
  .min(2, 'اكتب اسم من حرفين على الأقل')
  .max(120);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'استخدم حروف إنجليزي وأرقام وشرطة');
export const categoryInputSchema = z.strictObject({ name: arabicName, slug });
export const versionSchema = z.strictObject({
  version: z.number().int().min(0).max(1_000_000_000),
});
export const categoryUpdateSchema = categoryInputSchema.extend(
  versionSchema.shape,
);
export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const productTypeSchema = z.enum(['PHYSICAL', 'DIGITAL']);
export const digitalDeliverySchema = z.strictObject({
  automatic: z.boolean(),
  url: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    }, 'استخدم رابط HTTPS صحيحًا بدون بيانات دخول.'),
});
const productFields = {
  type: productTypeSchema.default('PHYSICAL'),
  digitalDelivery: digitalDeliverySchema.nullable().default(null),
  name: arabicName,
  slug,
  description: z.string().trim().max(5000),
  pricePiastres: z.number().int().min(1).max(MAX_PRICE),
  compareAtPricePiastres: z.number().int().min(1).max(MAX_PRICE).nullable(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'SKU حروف إنجليزي وأرقام')
    .nullable(),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  categoryId: objectIdSchema.nullable(),
  imageIds: z
    .array(objectIdSchema)
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length, 'الصورة متكررة'),
  status: productStatusSchema,
};
function prices(input: {
  pricePiastres: number;
  compareAtPricePiastres: number | null;
}) {
  return (
    input.compareAtPricePiastres === null ||
    input.compareAtPricePiastres > input.pricePiastres
  );
}
function delivery(input: {
  type: string;
  digitalDelivery: unknown;
  status: string;
}) {
  return input.type === 'PHYSICAL'
    ? input.digitalDelivery === null
    : input.status !== 'ACTIVE' || input.digitalDelivery !== null;
}
export const productInputSchema = z
  .strictObject(productFields)
  .refine(delivery, {
    path: ['digitalDelivery'],
    message: 'أضف رابط تسليم للمنتج الرقمي النشط.',
  })
  .refine(prices, {
    path: ['compareAtPricePiastres'],
    message: 'سعر قبل الخصم لازم يكون أعلى من السعر الحالي',
  });
export const productUpdateSchema = z
  .strictObject({ ...productFields, ...versionSchema.shape })
  .refine(delivery, {
    path: ['digitalDelivery'],
    message: 'أضف رابط تسليم للمنتج الرقمي النشط.',
  })
  .refine(prices, {
    path: ['compareAtPricePiastres'],
    message: 'سعر قبل الخصم لازم يكون أعلى من السعر الحالي',
  });
export const catalogQuerySchema = z.strictObject({
  q: z.string().trim().max(80).optional(),
  status: productStatusSchema.optional(),
  categoryId: objectIdSchema.optional(),
  page: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().min(1).max(1000))
    .default(1),
  pageSize: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().min(1).max(50))
    .default(20),
});
export const categorySchema = categoryInputSchema.extend({
  id: objectIdSchema,
  version: z.number().int(),
});
export const mediaSchema = z.strictObject({
  id: objectIdSchema,
  url: z.string(),
  bytes: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  state: z.enum(['READY', 'DELETING']),
});
export const productSchema = z.strictObject({
  ...productFields,
  id: objectIdSchema,
  version: z.number().int(),
  images: z.array(mediaSchema),
});
export const productsResponseSchema = z.strictObject({
  items: z.array(productSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const categoriesResponseSchema = z.strictObject({
  items: z.array(categorySchema),
});
export const mediaResponseSchema = z.strictObject({
  items: z.array(mediaSchema),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type Product = z.infer<typeof productSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Media = z.infer<typeof mediaSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
