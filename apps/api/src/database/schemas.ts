import { Schema, Types } from 'mongoose';
import {
  loginSchema,
  createStoreSchema,
  ARAB_COUNTRIES,
  countryCurrencies,
  type ArabCountry,
  type Currency,
  designSchema,
  designDraftSchema,
  type StoreDesign,
} from '@sallty/contracts';

export const USER = 'User';
export const SESSION = 'Session';
export const STORE = 'Store';
export const RATE_BUCKET = 'RateLimitBucket';
export interface User {
  country?: ArabCountry;
  role?: 'MERCHANT' | 'ADMIN';
  authRevision?: number;
  passwordResetHash?: string;
  passwordResetExpiresAt?: Date;
  passwordResetSentAt?: Date;
  emailVerifiedAt?: Date | null;
  emailOtpHash?: string;
  emailOtpNonce?: string;
  emailOtpExpiresAt?: Date;
  emailOtpSentAt?: Date;
  emailOtpAttempts?: number;
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}
export interface Session {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
}
export interface Store {
  design?: StoreDesign;
  designDraft?: StoreDesign;
  designRevision?: number;
  shippingFeePiastres?: number | null;
  country?: ArabCountry;
  currency?: Currency;
  catalogRevision?: number;
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
}
export interface RateBucket {
  key: string;
  count: number;
  expiresAt: Date;
}
const options = {
  timestamps: true,
  strict: 'throw',
  versionKey: false,
  bufferCommands: false,
} as const;
export const userSchema = new Schema<User>(
  {
    country: { type: String, enum: ARAB_COUNTRIES, default: 'EG' },
    role: { type: String, enum: ['MERCHANT', 'ADMIN'], default: 'MERCHANT' },
    authRevision: { type: Number, default: 0, min: 0 },
    passwordResetHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetSentAt: { type: Date, select: false },
    emailVerifiedAt: { type: Date, default: null },
    emailOtpHash: { type: String, select: false },
    emailOtpNonce: { type: String, select: false },
    emailOtpExpiresAt: { type: Date, select: false },
    emailOtpSentAt: { type: Date, select: false },
    emailOtpAttempts: { type: Number, select: false, min: 0 },
    name: { type: String, required: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      validate: (value: string) =>
        loginSchema.shape.email.safeParse(value).success,
    },
    phone: { type: String, required: true, match: /^\+[1-9]\d{7,14}$/ },
    passwordHash: { type: String, required: true, select: false },
  },
  { ...options, collection: 'users' },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ passwordResetHash: 1 }, { unique: true, sparse: true });
export const sessionSchema = new Schema<Session>(
  {
    userId: { type: Schema.Types.ObjectId, ref: USER, required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { ...options, collection: 'sessions' },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });
export const storeSchema = new Schema<Store>(
  {
    design: {
      type: Schema.Types.Mixed,
      validate: (value: unknown) => designSchema.safeParse(value).success,
    },
    designDraft: {
      type: Schema.Types.Mixed,
      validate: (value: unknown) => designDraftSchema.safeParse(value).success,
    },
    designRevision: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    shippingFeePiastres: {
      type: Number,
      default: null,
      min: 0,
      max: 1_000_000,
      validate: (v: number | null) => v === null || Number.isSafeInteger(v),
    },
    country: {
      type: String,
      enum: ARAB_COUNTRIES,
      default: 'EG',
      immutable: true,
    },
    currency: {
      type: String,
      enum: Object.values(countryCurrencies),
      default: 'EGP',
      immutable: true,
    },
    catalogRevision: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: USER,
      required: true,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 80,
      validate: (value: string) =>
        createStoreSchema.shape.name.safeParse(value).success,
    },
    slug: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 50,
      immutable: true,
      validate: (value: string) =>
        createStoreSchema.shape.slug.safeParse(value).success,
    },
  },
  { ...options, collection: 'stores' },
);
storeSchema.index({ ownerId: 1 }, { unique: true });
storeSchema.index({ slug: 1 }, { unique: true });
export const rateBucketSchema = new Schema<RateBucket>(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { ...options, collection: 'rateLimitBuckets' },
);
rateBucketSchema.index({ key: 1 }, { unique: true });
rateBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const modelDefinitions = [
  { name: USER, schema: userSchema },
  { name: SESSION, schema: sessionSchema },
  { name: STORE, schema: storeSchema },
  { name: RATE_BUCKET, schema: rateBucketSchema },
];
