import { z } from 'zod';
import { normalizeEgyptianPhone, moneyToMinor } from './regional.js';
export const GOVERNORATES = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'الدقهلية',
  'البحر الأحمر',
  'البحيرة',
  'الفيوم',
  'الغربية',
  'الإسماعيلية',
  'المنوفية',
  'المنيا',
  'القليوبية',
  'الوادي الجديد',
  'السويس',
  'أسوان',
  'أسيوط',
  'بني سويف',
  'بورسعيد',
  'دمياط',
  'الشرقية',
  'جنوب سيناء',
  'كفر الشيخ',
  'مطروح',
  'الأقصر',
  'قنا',
  'شمال سيناء',
  'سوهاج',
] as const;
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
const statusLabels: Record<OrderStatus, readonly [string, string]> = {
  PENDING: ['بانتظار التأكيد', 'Pending'],
  CONFIRMED: ['مؤكد', 'Confirmed'],
  PROCESSING: ['قيد التجهيز', 'Processing'],
  SHIPPED: ['تم الشحن', 'Shipped'],
  DELIVERED: ['تم التسليم', 'Delivered'],
  CANCELLED: ['ملغي', 'Cancelled'],
};
export const orderStatusLabel = (status: OrderStatus, locale: 'ar' | 'en') =>
  statusLabels[status][locale === 'ar' ? 0 : 1];
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export const cartItemSchema = z.strictObject({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  quantity: z.number().int().min(1).max(100),
});
export const cartItemsSchema = z
  .array(cartItemSchema)
  .min(1)
  .max(20)
  .refine(
    (items) => new Set(items.map((i) => i.slug)).size === items.length,
    'لا يمكن تكرار المنتج في السلة.',
  );
export const cartSchema = z.strictObject({ items: cartItemsSchema });
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'يرجى إدخال نص صحيح.');
export const customerSchema = z.strictObject({
  name: text(2, 100),
  phone: z
    .string()
    .max(40)
    .transform(normalizeEgyptianPhone)
    .pipe(
      z.string().regex(/^\+201[0125]\d{8}$/, 'أدخل رقم موبايل مصري صحيحًا.'),
    ),
  governorate: z.enum(GOVERNORATES).optional(),
  city: text(2, 100).optional(),
  address: text(10, 500).optional(),
  notes: text(0, 500).default(''),
});
export const checkoutSchema = z.strictObject({
  items: cartItemsSchema,
  customer: customerSchema,
  paymentMethod: z.enum(['COD', 'MANUAL']),
  quoteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const credentialSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const shippingSchema = z.strictObject({
  shippingFeePiastres: z.number().int().min(0).max(1_000_000),
});
export function shippingFeeToMinor(input: string) {
  const value = input.trim();
  const fee = /^[0٠۰]{1,9}(?:[.٫][0٠۰]{1,2})?$/.test(value)
    ? 0
    : moneyToMinor(value);
  return shippingSchema.parse({ shippingFeePiastres: fee }).shippingFeePiastres;
}
export const orderUpdateSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES),
  version: z.number().int().min(0).max(1_000_000_000),
});
export const orderQuerySchema = z.strictObject({
  q: z.string().trim().max(50).optional(),
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(ORDER_STATUSES).optional(),
  ),
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
export type CartItem = z.infer<typeof cartItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  totalPiastres: number;
  currency: 'EGP';
  createdAt: string;
};
export type MerchantOrder = OrderSummary & {
  requiresShipping: boolean;
  paymentStatus: 'UNPAID' | 'PAID';
  paidAt: string | null;
  digitalItems: {
    slug: string;
    name: string;
    released: boolean;
    automatic: boolean;
  }[];
  customer: z.infer<typeof customerSchema>;
  items: {
    slug: string;
    name: string;
    quantity: number;
    unitPricePiastres: number;
    lineTotalPiastres: number;
  }[];
  subtotalPiastres: number;
  shippingFeePiastres: number;
  paymentMethod: 'COD' | 'MANUAL';
  events: { from: OrderStatus | null; to: OrderStatus; at: string }[];
};
export type CartQuote = {
  requiresShipping: boolean;
  containsDigital: boolean;
  paymentMethod: 'COD' | 'MANUAL';
  items: {
    slug: string;
    quantity: number;
    name: string;
    unitPricePiastres: number | null;
    lineTotalPiastres: number;
    available: boolean;
  }[];
  subtotalPiastres: number;
  shippingFeePiastres: number | null;
  totalPiastres: number | null;
  checkoutEnabled: boolean;
  currency: import('./regional.js').Currency;
  quoteToken: string | null;
};
// 20 lines × 100 units × maximum unit price, plus maximum flat shipping.
export const MAX_ORDER_TOTAL = 200_001_000_000;
export function checkedTotal(values: readonly number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  if (
    values.some((v) => !Number.isSafeInteger(v) || v < 0) ||
    !Number.isSafeInteger(total) ||
    total > MAX_ORDER_TOTAL
  )
    throw new Error('ORDER_TOTAL_INVALID');
  return total;
}
