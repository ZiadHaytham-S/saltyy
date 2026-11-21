import { Schema, Types } from 'mongoose';
import {
  ORDER_STATUSES,
  GOVERNORATES,
  MAX_ORDER_TOTAL,
  type OrderStatus,
} from '@sallty/contracts';
export const ORDER = 'Order',
  ORDER_MOVEMENT = 'OrderMovement';
export interface OrderRecord {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  currency: 'EGP';
  paymentMethod: 'COD' | 'MANUAL';
  requiresShipping?: boolean;
  paymentStatus?: 'UNPAID' | 'PAID';
  paidAt?: Date | null;
  paidBy?: Types.ObjectId | null;
  releasedDigitalSlugs?: string[];
  customer: {
    name: string;
    phone: string;
    governorate?: (typeof GOVERNORATES)[number];
    city?: string;
    address?: string;
    notes: string;
  };
  items: {
    productId: Types.ObjectId;
    type?: 'PHYSICAL' | 'DIGITAL';
    digitalDelivery?: { automatic: boolean; url: string } | null;
    slug: string;
    name: string;
    quantity: number;
    unitPricePiastres: number;
    lineTotalPiastres: number;
  }[];
  subtotalPiastres: number;
  shippingFeePiastres: number;
  totalPiastres: number;
  idempotencyHash: string;
  requestHash: string;
  receiptHash: string;
  receiptExpiresAt: Date;
  stockRestored: boolean;
  events: {
    from: OrderStatus | null;
    to: OrderStatus;
    at: Date;
    actorId?: Types.ObjectId | null;
  }[];
  createdAt: Date;
}
const options = {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
  bufferCommands: false,
} as const;
const integer = (max: number) => ({
  type: Number,
  required: true,
  min: 0,
  max,
  validate: Number.isSafeInteger,
});
const itemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['PHYSICAL', 'DIGITAL'], default: 'PHYSICAL' },
    digitalDelivery: {
      type: new Schema(
        { automatic: Boolean, url: { type: String, maxlength: 2000 } },
        { _id: false, strict: 'throw' },
      ),
      default: null,
    },
    slug: { type: String, required: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 120 },
    quantity: { ...integer(100), min: 1 },
    unitPricePiastres: { ...integer(100_000_000), min: 1 },
    lineTotalPiastres: integer(10_000_000_000),
  },
  { _id: false, strict: 'throw' },
);
const customer = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^\+201[0125]\d{8}$/ },
    governorate: { type: String, enum: GOVERNORATES },
    city: { type: String, maxlength: 100 },
    address: { type: String, maxlength: 500 },
    notes: { type: String, maxlength: 500, default: '' },
  },
  { _id: false, strict: 'throw' },
);
const event = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, default: null },
    from: { type: String, enum: [...ORDER_STATUSES, null], default: null },
    to: { type: String, required: true, enum: ORDER_STATUSES },
    at: { type: Date, required: true },
  },
  { _id: false, strict: 'throw' },
);
export const orderSchema = new Schema<OrderRecord>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    orderNumber: { type: String, required: true, immutable: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    version: integer(1_000_000_000),
    requiresShipping: { type: Boolean, default: true, immutable: true },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID'],
      default: 'UNPAID',
    },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, default: null },
    releasedDigitalSlugs: {
      type: [String],
      default: [],
      validate: (value: string[]) => value.length <= 20,
    },
    currency: { type: String, enum: ['EGP'], required: true, immutable: true },
    paymentMethod: {
      type: String,
      enum: ['COD', 'MANUAL'],
      required: true,
      immutable: true,
    },
    customer: { type: customer, required: true, immutable: true },
    items: {
      type: [itemSchema],
      required: true,
      immutable: true,
      validate: (v: unknown[]) => v.length > 0 && v.length <= 20,
    },
    subtotalPiastres: { ...integer(200_000_000_000), immutable: true },
    shippingFeePiastres: { ...integer(1_000_000), immutable: true },
    totalPiastres: { ...integer(MAX_ORDER_TOTAL), immutable: true },
    idempotencyHash: {
      type: String,
      required: true,
      select: false,
      immutable: true,
    },
    requestHash: {
      type: String,
      required: true,
      select: false,
      immutable: true,
    },
    receiptHash: { type: String, required: true, select: false },
    receiptExpiresAt: { type: Date, required: true, select: false },
    stockRestored: { type: Boolean, required: true, default: false },
    events: {
      type: [event],
      required: true,
      validate: (v: unknown[]) => v.length <= 7,
    },
  },
  { ...options, collection: 'orders' },
);
orderSchema.index({ storeId: 1, idempotencyHash: 1 }, { unique: true });
orderSchema.index({ storeId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ storeId: 1, receiptHash: 1 }, { unique: true });
orderSchema.index({ storeId: 1, createdAt: -1, _id: -1 });
orderSchema.index({ storeId: 1, status: 1, createdAt: -1, _id: -1 });
export interface OrderMovementRecord {
  storeId: Types.ObjectId;
  orderId: Types.ObjectId;
  productId: Types.ObjectId;
  kind: 'RESERVE' | 'RESTORE';
  delta: number;
  quantityAfter: number;
}
export const orderMovementSchema = new Schema<OrderMovementRecord>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['RESERVE', 'RESTORE'], required: true },
    delta: {
      type: Number,
      required: true,
      min: -100,
      max: 100,
      validate: Number.isSafeInteger,
    },
    quantityAfter: integer(1_000_000),
  },
  { ...options, collection: 'orderMovements' },
);
orderMovementSchema.index(
  { storeId: 1, orderId: 1, productId: 1, kind: 1 },
  { unique: true },
);
export const orderModels = [
  { name: ORDER, schema: orderSchema },
  { name: ORDER_MOVEMENT, schema: orderMovementSchema },
];
