import {
  Injectable,
  NotFoundException,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { PublicProduct, StorefrontQuery } from '@sallty/contracts';
import { defaultDesign, publicDesignSchema } from '@sallty/contracts';
import { STORE, type Store } from '../../database/schemas.js';
import {
  PRODUCT,
  CATEGORY,
  MEDIA,
  VIDEO,
  type ProductRecord,
  type CategoryRecord,
  type MediaRecord,
  type VideoRecord,
} from './catalog.schemas.js';
import { StorageAdapter } from './storage.js';
import { escapeSearch } from './catalog.service.js';
const missing = () =>
  new NotFoundException({
    code: 'NOT_FOUND',
    message: 'المتجر أو المنتج مش موجود',
  });
@Injectable()
export class StorefrontService {
  constructor(
    @InjectModel(STORE) private readonly stores: Model<Store>,
    @InjectModel(PRODUCT) private readonly products: Model<ProductRecord>,
    @InjectModel(CATEGORY) private readonly categories: Model<CategoryRecord>,
    @InjectModel(MEDIA) private readonly media: Model<MediaRecord>,
    @InjectModel(VIDEO) private readonly videos: Model<VideoRecord>,
    @Inject(StorageAdapter) private readonly storage: StorageAdapter,
  ) {}
  private async resolveStore(slug: string) {
    const store = await this.stores
      .findOne({ slug })
      .select('_id name slug country currency design')
      .lean()
      .maxTimeMS(2000);
    if (!store) throw missing();
    return store;
  }
  async store(slug: string) {
    const store = await this.resolveStore(slug);
    const categories = await this.categories
      .find({ storeId: store._id })
      .select('name slug')
      .sort({ name: 1, _id: 1 })
      .limit(200)
      .lean()
      .maxTimeMS(2000);
    return {
      store: {
        country: store.country ?? 'EG',
        currency: store.currency ?? 'EGP',
        name: store.name,
        slug: store.slug,
        branding: {
          logoUrl: store.design?.logoId
            ? '/api/v1/public/stores/' +
              slug +
              '/branding/' +
              store.design.logoId
            : null,
          primaryColor: store.design?.primaryColor ?? '#2563eb',
        },
        design: (() => {
          const design = store.design ?? defaultDesign();
          const { bannerId, videoAssetId } = design;
          return publicDesignSchema.strip().parse({
            ...design,
            customLayout: design.customLayout || !!design.sections?.length,
            sections: (design.sections ?? [])
              .filter((section) => section.enabled)
              .map(({ imageId, videoAssetId, ...section }) => ({
                ...section,
                imageUrl: imageId
                  ? '/api/v1/public/stores/' + slug + '/branding/' + imageId
                  : null,
                videoUrl:
                  section.videoType === 'upload' && videoAssetId
                    ? '/api/v1/public/stores/' + slug + '/video/' + videoAssetId
                    : section.videoUrl,
              })),
            videoUrl:
              design.videoType === 'upload' && videoAssetId
                ? '/api/v1/public/stores/' + slug + '/video/' + videoAssetId
                : design.videoUrl,
            bannerUrl: bannerId
              ? '/api/v1/public/stores/' + slug + '/branding/' + bannerId
              : null,
          });
        })(),
      },
      categories: categories.map(({ name, slug }) => ({ name, slug })),
    };
  }
  private async dto(
    store: Store,
    records: ProductRecord[],
  ): Promise<PublicProduct[]> {
    const [categories, images] = await Promise.all([
      this.categories
        .find({
          storeId: store._id,
          _id: {
            $in: records.flatMap((p) => (p.categoryId ? [p.categoryId] : [])),
          },
        })
        .select('_id name slug')
        .lean()
        .maxTimeMS(2000),
      this.media
        .find({
          storeId: store._id,
          state: 'READY',
          _id: { $in: records.flatMap((p) => p.imageIds) },
        })
        .select('_id width height')
        .lean()
        .maxTimeMS(2000),
    ]);
    return records.map((p) => {
      const category = categories.find(
        (c) => String(c._id) === String(p.categoryId),
      );
      return {
        name: p.name,
        type: p.type ?? 'PHYSICAL',
        slug: p.slug,
        description: p.description,
        pricePiastres: p.pricePiastres,
        compareAtPricePiastres: p.compareAtPricePiastres ?? null,
        inStock: p.stockQuantity > 0,
        category: category
          ? { name: category.name, slug: category.slug }
          : null,
        images: p.imageIds.flatMap((id) => {
          const image = images.find((i) => String(i._id) === String(id));
          return image
            ? [
                {
                  url: `/api/v1/public/stores/${store.slug}/products/${p.slug}/images/${id}`,
                  width: image.width,
                  height: image.height,
                },
              ]
            : [];
        }),
      };
    });
  }
  async list(slug: string, query: StorefrontQuery) {
    const store = await this.resolveStore(slug);
    const filter: QueryFilter<ProductRecord> = {
      storeId: store._id,
      status: 'ACTIVE',
    };
    if (query.q) filter.name = { $regex: escapeSearch(query.q), $options: 'i' };
    if (query.category) {
      const category = await this.categories
        .findOne({ storeId: store._id, slug: query.category })
        .select('_id')
        .lean()
        .maxTimeMS(2000);
      if (!category) throw missing();
      filter.categoryId = category._id;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined)
      filter.pricePiastres = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    const page = query.page ?? 1,
      pageSize = 12;
    const sort: Record<string, 1 | -1> =
      query.sort === 'price-asc'
        ? { pricePiastres: 1, _id: -1 }
        : query.sort === 'price-desc'
          ? { pricePiastres: -1, _id: -1 }
          : { _id: -1 };
    const [records, total] = await Promise.all([
      this.products
        .find(filter)
        .select(
          'name slug description pricePiastres compareAtPricePiastres stockQuantity categoryId imageIds type',
        )
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .maxTimeMS(2000),
      this.products.countDocuments(filter).maxTimeMS(2000),
    ]);
    return { items: await this.dto(store, records), total, page, pageSize };
  }
  async product(slug: string, productSlug: string) {
    const store = await this.resolveStore(slug);
    const product = await this.products
      .findOne({ storeId: store._id, slug: productSlug, status: 'ACTIVE' })
      .select(
        'name slug description pricePiastres compareAtPricePiastres stockQuantity categoryId imageIds type',
      )
      .lean()
      .maxTimeMS(2000);
    if (!product) throw missing();
    return { product: (await this.dto(store, [product]))[0] };
  }
  async image(slug: string, productSlug: string, imageId: string) {
    if (!/^[a-f\d]{24}$/.test(imageId)) throw missing();
    const store = await this.resolveStore(slug);
    const id = new Types.ObjectId(imageId);
    if (
      !(await this.products
        .exists({
          storeId: store._id,
          slug: productSlug,
          status: 'ACTIVE',
          imageIds: id,
        })
        .maxTimeMS(2000))
    )
      throw missing();
    const media = await this.media
      .findOne({ storeId: store._id, _id: id, state: 'READY' })
      .select('key')
      .lean()
      .maxTimeMS(2000);
    if (!media) throw missing();
    try {
      return await this.storage.read(media.key);
    } catch {
      throw new ServiceUnavailableException({
        code: 'IMAGE_UNAVAILABLE',
        message: 'الصورة مش متاحة مؤقتًا',
      });
    }
  }
  async brandingImage(slug: string, imageId: string) {
    if (!/^[a-f\d]{24}$/.test(imageId)) throw missing();
    const store = await this.resolveStore(slug);
    if (
      ![
        store.design?.logoId,
        store.design?.bannerId,
        ...(store.design?.sections ?? [])
          .filter((section) => section.enabled)
          .map((section) => section.imageId),
      ].includes(imageId)
    )
      throw missing();
    const media = await this.media
      .findOne({
        storeId: store._id,
        _id: new Types.ObjectId(imageId),
        state: 'READY',
      })
      .select('key')
      .lean();
    if (!media) throw missing();
    try {
      return await this.storage.read(media.key);
    } catch {
      throw missing();
    }
  }
  async video(slug: string, videoId: string) {
    if (!/^[a-f\d]{24}$/.test(videoId)) throw missing();
    const store = await this.resolveStore(slug);
    if (
      !(
        store.design?.videoType === 'upload' &&
        store.design.videoAssetId === videoId
      ) &&
      !(store.design?.sections ?? []).some(
        (section) =>
          section.enabled &&
          section.videoType === 'upload' &&
          section.videoAssetId === videoId,
      )
    )
      throw missing();
    const asset = await this.videos
      .findOne({ storeId: store._id, _id: new Types.ObjectId(videoId) })
      .select('key')
      .lean();
    if (!asset) throw missing();
    try {
      return await this.storage.read(asset.key);
    } catch {
      throw missing();
    }
  }
}
