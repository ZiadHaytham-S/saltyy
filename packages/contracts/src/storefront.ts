import { z } from 'zod';
import { MAX_PRICE } from './catalog.js';
import { countrySchema, currencySchema } from './regional.js';
import { publicDesignSchema } from './design.js';
export const publicSlugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const numberQuery = (max: number, defaultValue?: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    z
      .number()
      .int()
      .min(0)
      .max(max)
      .optional()
      .transform((value) => value ?? defaultValue),
  );
export const storefrontQuerySchema = z
  .strictObject({
    q: z.string().trim().max(80).optional(),
    category: publicSlugSchema.optional(),
    minPrice: numberQuery(MAX_PRICE),
    maxPrice: numberQuery(MAX_PRICE),
    sort: z.enum(['newest', 'price-asc', 'price-desc']).default('newest'),
    page: numberQuery(100, 1).refine(
      (value) => value !== undefined && value >= 1,
    ),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
  );
export const publicCategorySchema = z.strictObject({
  name: z.string(),
  slug: publicSlugSchema,
});
export const publicStoreSchema = z.strictObject({
  country: countrySchema.default('EG'),
  currency: currencySchema.default('EGP'),
  name: z.string(),
  slug: publicSlugSchema,
  branding: z.strictObject({
    logoUrl: z.string().nullable(),
    primaryColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  }),
  design: publicDesignSchema.optional(),
});
export const publicProductSchema = z.strictObject({
  type: z.enum(['PHYSICAL', 'DIGITAL']).default('PHYSICAL'),
  name: z.string(),
  slug: publicSlugSchema,
  description: z.string(),
  pricePiastres: z.number().int(),
  compareAtPricePiastres: z.number().int().nullable(),
  inStock: z.boolean(),
  category: publicCategorySchema.nullable(),
  images: z.array(
    z.strictObject({
      url: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  ),
});
export const publicStoreResponseSchema = z.strictObject({
  store: publicStoreSchema,
  categories: z.array(publicCategorySchema),
});
export const publicProductsResponseSchema = z.strictObject({
  items: z.array(publicProductSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type PublicStore = z.infer<typeof publicStoreSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type StorefrontQuery = z.infer<typeof storefrontQuerySchema>;
