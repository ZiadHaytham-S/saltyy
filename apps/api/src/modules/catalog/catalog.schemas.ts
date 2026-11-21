import { Schema, Types } from 'mongoose';
import { MAX_PRICE } from '@sallty/contracts';
export const PRODUCT = 'Product',
  CATEGORY = 'Category',
  MEDIA = 'MediaAsset',
  VIDEO = 'StoreVideoAsset',
  MOVEMENT = 'StockMovement';
const options = {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
  bufferCommands: false,
} as const;
const integer = (max: number, min = 0) => ({
  type: Number,
  required: true,
  min,
  max,
  validate: Number.isSafeInteger,
});
export interface CategoryRecord {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  name: string;
  slug: string;
  version: number;
}
export interface ProductRecord extends CategoryRecord {
  type?: 'PHYSICAL' | 'DIGITAL';
  digitalDelivery?: { automatic: boolean; url: string } | null;
  description: string;
  pricePiastres: number;
  compareAtPricePiastres: number | null;
  sku?: string;
  stockQuantity: number;
  categoryId: Types.ObjectId | null;
  imageIds: Types.ObjectId[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}
export interface MediaRecord {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  key: string;
  bytes: number;
  width: number;
  height: number;
  state: 'READY' | 'DELETING';
}
export interface MovementRecord {
  storeId: Types.ObjectId;
  productId: Types.ObjectId;
  delta: number;
  quantityAfter: number;
  actorId: Types.ObjectId;
}
export interface VideoRecord {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  key: string;
  bytes: number;
}
export const videoModelSchema = new Schema<VideoRecord>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    key: { type: String, required: true, immutable: true },
    bytes: integer(20 * 1024 * 1024, 1),
  },
  { ...options, collection: 'storeVideos' },
);
videoModelSchema.index({ key: 1 }, { unique: true });
videoModelSchema.index({ storeId: 1 });
const identity = {
  storeId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 120,
  },
  slug: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 80,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  version: integer(1_000_000_000),
};
export const categoryModelSchema = new Schema<CategoryRecord>(identity, {
  ...options,
  collection: 'categories',
});
categoryModelSchema.index({ storeId: 1, slug: 1 }, { unique: true });
export const productModelSchema = new Schema<ProductRecord>(
  {
    ...identity,
    type: { type: String, enum: ['PHYSICAL', 'DIGITAL'], default: 'PHYSICAL' },
    digitalDelivery: {
      type: new Schema(
        {
          automatic: { type: Boolean, required: true },
          url: { type: String, required: true, maxlength: 2000 },
        },
        { _id: false, strict: 'throw' },
      ),
      default: null,
    },
    description: { type: String, maxlength: 5000, default: '' },
    pricePiastres: integer(MAX_PRICE, 1),
    compareAtPricePiastres: {
      type: Number,
      default: null,
      min: 1,
      max: MAX_PRICE,
      validate: (value: number | null) =>
        value === null || Number.isSafeInteger(value),
    },
    sku: { type: String, maxlength: 64, match: /^[A-Z0-9][A-Z0-9._-]*$/ },
    stockQuantity: integer(1_000_000),
    categoryId: { type: Schema.Types.ObjectId, default: null },
    imageIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      validate: (ids: Types.ObjectId[]) =>
        ids.length <= 8 && new Set(ids.map(String)).size === ids.length,
    },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    },
  },
  { ...options, collection: 'products' },
);
productModelSchema.index({ storeId: 1, slug: 1 }, { unique: true });
productModelSchema.index(
  { storeId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);
productModelSchema.index({ storeId: 1, status: 1, _id: -1 });
productModelSchema.index({ storeId: 1, status: 1, pricePiastres: 1, _id: -1 });
productModelSchema.index({ storeId: 1, status: 1, categoryId: 1, _id: -1 });
productModelSchema.index({ storeId: 1, categoryId: 1 });
export const mediaModelSchema = new Schema<MediaRecord>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    key: { type: String, required: true, immutable: true },
    bytes: integer(5 * 1024 * 1024, 1),
    width: integer(4096, 1),
    height: integer(4096, 1),
    state: { type: String, enum: ['READY', 'DELETING'], required: true },
  },
  { ...options, collection: 'mediaAssets' },
);
mediaModelSchema.index({ key: 1 }, { unique: true });
mediaModelSchema.index({ storeId: 1, state: 1 });
export const movementModelSchema = new Schema<MovementRecord>(
  {
    storeId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    delta: {
      type: Number,
      required: true,
      min: -1_000_000,
      max: 1_000_000,
      validate: Number.isSafeInteger,
    },
    quantityAfter: integer(1_000_000),
  },
  { ...options, collection: 'stockMovements' },
);
movementModelSchema.index({ storeId: 1, productId: 1, _id: -1 });
export const catalogModels = [
  { name: VIDEO, schema: videoModelSchema },
  { name: PRODUCT, schema: productModelSchema },
  { name: CATEGORY, schema: categoryModelSchema },
  { name: MEDIA, schema: mediaModelSchema },
  { name: MOVEMENT, schema: movementModelSchema },
];
