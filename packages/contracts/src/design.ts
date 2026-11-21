import { z } from 'zod';
import { objectIdSchema } from './catalog.js';
export const THEMES = [
  { id: 'sallty', ar: 'سلتي', en: 'Sallty', color: '#2563eb', layout: 'split' },
  {
    id: 'minimal',
    ar: 'بساطة',
    en: 'Minimal',
    color: '#334155',
    layout: 'minimal',
  },
  {
    id: 'boutique',
    ar: 'بوتيك',
    en: 'Boutique',
    color: '#9d174d',
    layout: 'editorial',
  },
  { id: 'oasis', ar: 'واحة', en: 'Oasis', color: '#047857', layout: 'organic' },
  {
    id: 'studio',
    ar: 'ستوديو',
    en: 'Studio',
    color: '#7c3aed',
    layout: 'split',
  },
  {
    id: 'luxury',
    ar: 'رُقي',
    en: 'Luxury',
    color: '#92400e',
    layout: 'editorial',
  },
  {
    id: 'market',
    ar: 'سوق',
    en: 'Market',
    color: '#c2410c',
    layout: 'compact',
  },
  { id: 'tech', ar: 'تقنية', en: 'Tech', color: '#0369a1', layout: 'angular' },
  {
    id: 'playful',
    ar: 'بهجة',
    en: 'Playful',
    color: '#be185d',
    layout: 'playful',
  },
  {
    id: 'digital',
    ar: 'رقمي',
    en: 'Digital',
    color: '#4338ca',
    layout: 'spotlight',
  },
] as const;
export const themeIdSchema = z.enum([
  'sallty',
  'minimal',
  'boutique',
  'oasis',
  'studio',
  'luxury',
  'market',
  'tech',
  'playful',
  'digital',
]);
export const safePublicUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'استخدم رابط HTTPS صحيحًا.');
export const youtubeId = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(
              url.hostname,
            )
          ? (url.searchParams.get('v') ??
            url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1])
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};
const content = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
export const sectionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,50}$/),
  kind: z.enum([
    'hero',
    'products',
    'categories',
    'promotion',
    'text',
    'video',
  ]),
  enabled: z.boolean().default(true),
  title: content(160).default(''),
  body: z.string().trim().max(2000).default(''),
  buttonText: content(80).default(''),
  buttonUrl: safePublicUrl.default(''),
  imageId: objectIdSchema.nullable().default(null),
  videoType: z.enum(['none', 'youtube', 'custom', 'upload']).default('none'),
  videoUrl: safePublicUrl.default(''),
  videoAssetId: objectIdSchema.nullable().default(null),
  alignment: z.enum(['start', 'center', 'end']).default('start'),
  backgroundColor: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .nullable()
    .default(null),
  textColor: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .nullable()
    .default(null),
});
export const sectionsSchema = z
  .array(sectionSchema)
  .max(20)
  .default([])
  .superRefine((sections, ctx) => {
    if (new Set(sections.map((item) => item.id)).size !== sections.length)
      ctx.addIssue({ code: 'custom', message: 'معرف القسم متكرر.' });
    for (const kind of ['hero', 'products', 'categories'])
      if (sections.filter((item) => item.kind === kind).length > 1)
        ctx.addIssue({ code: 'custom', message: 'هذا القسم لا يمكن تكراره.' });
  });
const publicVideoUrl = z.union([
  safePublicUrl,
  z
    .string()
    .regex(/^\/api\/v1\/public\/stores\/[a-z0-9-]+\/video\/[a-f\d]{24}$/),
]);
export const publicSectionSchema = sectionSchema
  .omit({ imageId: true, videoAssetId: true })
  .extend({ imageUrl: z.string().nullable(), videoUrl: publicVideoUrl });
export type DesignSection = z.infer<typeof sectionSchema>;
export type PublicSection = z.infer<typeof publicSectionSchema>;
const designFieldsSchema = z.strictObject({
  customLayout: z.boolean().default(false),
  sections: sectionsSchema,
  backgroundColor: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .nullable()
    .default(null),
  textColor: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .nullable()
    .default(null),
  spacing: z.enum(['compact', 'normal', 'spacious']).default('normal'),
  theme: themeIdSchema.default('sallty'),
  primaryColor: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default('#2563eb'),
  font: z.enum(['cairo', 'system']).default('cairo'),
  columns: z.number().int().min(2).max(4).default(4),
  cardStyle: z.enum(['rounded', 'square', 'soft']).default('rounded'),
  heroVisible: z.boolean().default(true),
  categoriesVisible: z.boolean().default(true),
  videoPosition: z
    .enum(['before-products', 'after-products'])
    .default('before-products'),
  heading: content(160).default(''),
  description: content(1000).default(''),
  announcement: content(160).default(''),
  logoId: objectIdSchema.nullable().default(null),
  bannerId: objectIdSchema.nullable().default(null),
  videoType: z.enum(['none', 'youtube', 'custom', 'upload']).default('none'),
  videoAssetId: objectIdSchema.nullable().default(null),
  videoUrl: safePublicUrl.default(''),
  contact: z
    .strictObject({
      whatsapp: z
        .string()
        .regex(/^(?:\+[1-9]\d{7,14})?$/)
        .default(''),
      facebook: safePublicUrl.default(''),
      instagram: safePublicUrl.default(''),
      tiktok: safePublicUrl.default(''),
      linkedin: safePublicUrl.default(''),
      snapchat: safePublicUrl.default(''),
      phone: z
        .string()
        .regex(/^(?:\+[1-9]\d{7,14})?$/)
        .default(''),
      email: z.union([z.literal(''), z.string().email().max(254)]).default(''),
      address: content(500).default(''),
    })
    .default(() => ({
      whatsapp: '',
      facebook: '',
      instagram: '',
      tiktok: '',
      linkedin: '',
      snapchat: '',
      phone: '',
      email: '',
      address: '',
    })),
});
export const designDraftSchema = designFieldsSchema;
export const designSchema = designFieldsSchema.superRefine((value, context) => {
  for (const section of value.sections.filter((item) => item.enabled)) {
    if (section.videoType === 'youtube' && !youtubeId(section.videoUrl))
      context.addIssue({ code: 'custom', message: 'رابط YouTube غير صحيح.' });
    if (section.videoType === 'upload' && !section.videoAssetId)
      context.addIssue({
        code: 'custom',
        message: 'اختر فيديو مرفوعًا للقسم.',
      });
    if (section.videoType === 'custom' && !section.videoUrl)
      context.addIssue({ code: 'custom', message: 'أدخل رابط الفيديو.' });
  }
  const usesGlobalVideo =
    (!value.customLayout && value.sections.length === 0) ||
    value.sections.some(
      (section) =>
        section.enabled &&
        section.kind === 'video' &&
        section.videoType === 'none',
    );
  if (!usesGlobalVideo) return;
  if (value.videoType === 'youtube' && !youtubeId(value.videoUrl))
    context.addIssue({
      code: 'custom',
      path: ['videoUrl'],
      message: 'أدخل رابط فيديو YouTube صحيحًا.',
    });
  if (value.videoType === 'custom' && !value.videoUrl)
    context.addIssue({
      code: 'custom',
      path: ['videoUrl'],
      message: 'أدخل رابط الفيديو المخصص.',
    });
  if (value.videoType === 'upload' && !value.videoAssetId)
    context.addIssue({
      code: 'custom',
      path: ['videoAssetId'],
      message: 'ارفع فيديو أولًا.',
    });
});
export const publicDesignSchema = designFieldsSchema
  .omit({ logoId: true, bannerId: true, videoAssetId: true })
  .extend({
    sections: z.array(publicSectionSchema).max(20).default([]),
    bannerUrl: z.string().nullable().default(null),
    videoUrl: z.union([
      safePublicUrl,
      z
        .string()
        .regex(/^\/api\/v1\/public\/stores\/[a-z0-9-]+\/video\/[a-f\d]{24}$/),
    ]),
  });
export type StoreDesign = z.infer<typeof designSchema>;
export type PublicDesign = z.infer<typeof publicDesignSchema>;
export const defaultDesign = () => designSchema.parse({});
