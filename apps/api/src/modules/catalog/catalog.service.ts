import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model, Connection, ClientSession } from 'mongoose';
import { randomBytes } from 'node:crypto';
import type {
  ProductInput,
  ProductUpdate,
  CatalogQuery,
  Category,
  Product,
  Media,
} from '@sallty/contracts';
import { defaultDesign, type StoreDesign } from '@sallty/contracts';
import {
  PRODUCT,
  CATEGORY,
  MEDIA,
  MOVEMENT,
  VIDEO,
} from './catalog.schemas.js';
import type {
  ProductRecord,
  CategoryRecord,
  MediaRecord,
  MovementRecord,
  VideoRecord,
} from './catalog.schemas.js';
import { STORE, type Store } from '../../database/schemas.js';
import { isDuplicateKey } from '../../common/validation.js';
import { StorageAdapter, normalizeImage, validateVideo } from './storage.js';
function id(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw missing();
  return new Types.ObjectId(value);
}
function missing() {
  return new NotFoundException({
    code: 'RESOURCE_NOT_FOUND',
    message: 'العنصر مش موجود',
  });
}
function conflict(message = 'البيانات اتغيرت. حدّث الصفحة وجرب تاني') {
  return new ConflictException({ code: 'CATALOG_CONFLICT', message });
}
export function escapeSearch(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function categoryDto(record: CategoryRecord): Category {
  return {
    id: String(record._id),
    name: record.name,
    slug: record.slug,
    version: record.version,
  };
}
function mediaDto(record: MediaRecord): Media {
  return {
    id: String(record._id),
    url: '/api/v1/merchant/media/' + record._id,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    state: record.state,
  };
}
@Injectable()
export class CatalogService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(STORE) private readonly stores: Model<Store>,
    @InjectModel(PRODUCT) private readonly products: Model<ProductRecord>,
    @InjectModel(CATEGORY) private readonly categories: Model<CategoryRecord>,
    @InjectModel(MEDIA) private readonly media: Model<MediaRecord>,
    @InjectModel(MOVEMENT) private readonly movements: Model<MovementRecord>,
    @InjectModel(VIDEO) private readonly videos: Model<VideoRecord>,
    @Inject(StorageAdapter) private readonly storage: StorageAdapter,
  ) {}
  async getDesign(storeId: string) {
    const store = await this.stores.findOne({ _id: id(storeId) }).lean();
    if (!store) throw missing();
    return {
      design: store.designDraft ?? store.design ?? defaultDesign(),
      version: store.designRevision ?? 0,
    };
  }
  async saveDesign(
    storeId: string,
    actorId: string,
    design: StoreDesign,
    version: number,
    publish = true,
  ) {
    await this.change(storeId, actorId, async (session) => {
      const store = await this.stores
        .findOne({ _id: id(storeId), ownerId: id(actorId) })
        .session(session)
        .lean();
      if (!store || (store.designRevision ?? 0) !== version) throw conflict();
      const assetIds = [
        ...new Set(
          [
            design.logoId,
            design.bannerId,
            ...design.sections.map((section) => section.imageId),
          ].filter((value): value is string => !!value),
        ),
      ];
      if (
        (await this.media
          .countDocuments({
            storeId: id(storeId),
            _id: { $in: assetIds.map(id) },
            state: 'READY',
          })
          .session(session)) !== assetIds.length
      )
        throw new BadRequestException({
          code: 'INVALID_IMAGES',
          message: 'اختار صورًا مملوكة لمتجرك.',
        });
      const videoIds = [
        ...new Set(
          [
            design.videoAssetId,
            ...design.sections.map((section) => section.videoAssetId),
          ].filter((value): value is string => !!value),
        ),
      ];
      if (
        (await this.videos
          .countDocuments({
            _id: { $in: videoIds.map(id) },
            storeId: id(storeId),
          })
          .session(session)) !== videoIds.length
      )
        throw new BadRequestException({
          code: 'INVALID_VIDEO',
          message: 'الفيديو لا يتبع متجرك.',
        });
      await this.stores.updateOne(
        { _id: store._id, ownerId: id(actorId) },
        {
          $set: publish ? { design } : { designDraft: design },
          ...(publish ? { $unset: { designDraft: '' } } : {}),
          $inc: { designRevision: 1 },
        },
        { session, runValidators: true },
      );
    });
    return this.getDesign(storeId);
  }
  async uploadVideo(
    storeId: string,
    actorId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const content = validateVideo(file),
      key = storeId + '/' + randomBytes(16).toString('hex') + '.mp4';
    await this.storage.put(key, content);
    try {
      return await this.change(storeId, actorId, async (session) => {
        const existing = await this.videos
          .find({ storeId: id(storeId) })
          .session(session)
          .lean();
        if (
          existing.length >= 10 ||
          existing.reduce((sum, item) => sum + item.bytes, 0) + content.length >
            100 * 1024 * 1024
        )
          throw conflict('وصلت إلى حد 10 فيديوهات أو 100 MB للفيديوهات.');
        const [asset] = await this.videos.create(
          [{ storeId: id(storeId), key, bytes: content.length }],
          { session },
        );
        if (!asset) throw missing();
        return { id: String(asset._id) };
      });
    } catch (failure) {
      await this.storage.remove(key);
      throw failure;
    }
  }
  async deleteVideo(storeId: string, actorId: string, videoId: string) {
    const key = await this.change(storeId, actorId, async (session) => {
      const store = await this.stores
        .findOne({ _id: id(storeId) })
        .session(session)
        .lean();
      if (
        [store?.design, store?.designDraft].some(
          (design) =>
            design?.videoAssetId === videoId ||
            design?.sections?.some(
              (section) => section.videoAssetId === videoId,
            ),
        )
      )
        throw conflict('افصل الفيديو من تصميم المتجر قبل حذفه.');
      const asset = await this.videos
        .findOneAndDelete(
          { storeId: id(storeId), _id: id(videoId) },
          { session },
        )
        .lean();
      if (!asset) throw missing();
      return asset.key;
    });
    await this.storage.remove(key);
    return { status: 'deleted' };
  }
  async listVideos(storeId: string) {
    return {
      items: (
        await this.videos
          .find({ storeId: id(storeId) })
          .sort({ _id: -1 })
          .limit(10)
          .lean()
      ).map((item) => ({ id: String(item._id), bytes: item.bytes })),
    };
  }
  async readVideo(storeId: string, videoId: string) {
    const asset = await this.videos
      .findOne({ storeId: id(storeId), _id: id(videoId) })
      .lean();
    if (!asset) throw missing();
    try {
      return await this.storage.read(asset.key);
    } catch {
      throw missing();
    }
  }
  private async change<T>(
    storeId: string,
    actorId: string,
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.connection.transaction(async (session) => {
        const store = await this.stores.findOneAndUpdate(
          { _id: id(storeId), ownerId: id(actorId) },
          { $inc: { catalogRevision: 1 } },
          { session },
        );
        if (!store) throw missing();
        return operation(session);
      });
    } catch (error) {
      if (isDuplicateKey(error))
        throw conflict('الـ slug أو SKU مستخدم في متجرك بالفعل');
      throw error;
    }
  }
  async listCategories(storeId: string) {
    return {
      items: (
        await this.categories
          .find({ storeId: id(storeId) })
          .sort({ _id: -1 })
          .limit(200)
          .lean()
      ).map(categoryDto),
    };
  }
  async saveCategory(
    storeId: string,
    actorId: string,
    input: { name: string; slug: string; version?: number },
    categoryId?: string,
  ) {
    return this.change(storeId, actorId, async (session) => {
      if (!categoryId) {
        if (
          (await this.categories
            .countDocuments({ storeId: id(storeId) })
            .session(session)) >= 200
        )
          throw conflict('وصلت لحد 200 تصنيف');
        const [created] = await this.categories.create(
          [
            {
              storeId: id(storeId),
              name: input.name,
              slug: input.slug,
              version: 0,
            },
          ],
          { session },
        );
        if (!created) throw missing();
        return { category: categoryDto(created) };
      }
      const found = await this.categories
        .findOne({ _id: id(categoryId), storeId: id(storeId) })
        .session(session)
        .lean();
      if (!found) throw missing();
      if (found.version !== input.version) throw conflict();
      const updated = await this.categories
        .findOneAndUpdate(
          { _id: found._id, storeId: id(storeId), version: input.version },
          {
            $set: { name: input.name, slug: input.slug },
            $inc: { version: 1 },
          },
          { session, returnDocument: 'after', runValidators: true },
        )
        .lean();
      if (!updated) throw conflict();
      return { category: categoryDto(updated) };
    });
  }
  async deleteCategory(
    storeId: string,
    actorId: string,
    categoryId: string,
    version: number,
  ) {
    return this.change(storeId, actorId, async (session) => {
      const category = await this.categories
        .findOne({ _id: id(categoryId), storeId: id(storeId) })
        .session(session)
        .lean();
      if (!category) throw missing();
      if (category.version !== version) throw conflict();
      if (
        await this.products
          .exists({ storeId: id(storeId), categoryId: category._id })
          .session(session)
      )
        throw conflict(
          'التصنيف مستخدم في منتجات، حتى المؤرشفة. انقل المنتجات أو اختار بدون تصنيف الأول',
        );
      await this.categories.deleteOne(
        { _id: category._id, storeId: id(storeId), version },
        { session },
      );
      return { status: 'deleted' };
    });
  }
  private async productDto(
    record: ProductRecord,
    loadedImages?: MediaRecord[],
  ): Promise<Product> {
    const images =
      loadedImages ??
      (await this.media
        .find({
          storeId: record.storeId,
          _id: { $in: record.imageIds },
          state: 'READY',
        })
        .lean());
    return {
      id: String(record._id),
      type: record.type ?? 'PHYSICAL',
      digitalDelivery: record.digitalDelivery ?? null,
      name: record.name,
      slug: record.slug,
      version: record.version,
      description: record.description,
      pricePiastres: record.pricePiastres,
      compareAtPricePiastres: record.compareAtPricePiastres ?? null,
      sku: record.sku ?? null,
      stockQuantity: record.stockQuantity,
      categoryId: record.categoryId ? String(record.categoryId) : null,
      imageIds: record.imageIds.map(String),
      status: record.status,
      images: record.imageIds.flatMap((imageId) => {
        const image = images.find(
          (item) => String(item._id) === String(imageId),
        );
        return image ? [mediaDto(image)] : [];
      }),
    };
  }
  async getProduct(storeId: string, productId: string) {
    const record = await this.products
      .findOne({ storeId: id(storeId), _id: id(productId) })
      .lean();
    if (!record) throw missing();
    return { product: await this.productDto(record) };
  }
  async listProducts(storeId: string, query: CatalogQuery) {
    const filter = {
      storeId: id(storeId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: id(query.categoryId) } : {}),
      ...(query.q
        ? { name: { $regex: escapeSearch(query.q), $options: 'i' } }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.products
        .find(filter)
        .sort({ _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      this.products.countDocuments(filter),
    ]);
    const images = await this.media
      .find({
        storeId: id(storeId),
        _id: { $in: records.flatMap((record) => record.imageIds) },
        state: 'READY',
      })
      .lean();
    return {
      items: await Promise.all(
        records.map((record) => this.productDto(record, images)),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async saveProduct(
    storeId: string,
    actorId: string,
    input: ProductInput | ProductUpdate,
    productId?: string,
  ) {
    const savedId = await this.change(storeId, actorId, async (session) => {
      const previous = productId
        ? await this.products
            .findOne({ _id: id(productId), storeId: id(storeId) })
            .session(session)
            .lean()
        : null;
      if (productId && !previous) throw missing();
      if (
        previous &&
        (!('version' in input) || previous.version !== input.version)
      )
        throw conflict();
      if (
        !productId &&
        (await this.products
          .countDocuments({ storeId: id(storeId) })
          .session(session)) >= 1000
      )
        throw conflict('وصلت لحد 1000 منتج');
      if (
        input.categoryId &&
        !(await this.categories
          .exists({ _id: id(input.categoryId), storeId: id(storeId) })
          .session(session))
      )
        throw new BadRequestException({
          code: 'INVALID_CATEGORY',
          message: 'اختار تصنيف موجود في متجرك',
        });
      if (
        (await this.media
          .countDocuments({
            _id: { $in: input.imageIds.map(id) },
            storeId: id(storeId),
            state: 'READY',
          })
          .session(session)) !== input.imageIds.length
      )
        throw new BadRequestException({
          code: 'INVALID_IMAGES',
          message: 'اختار صور موجودة في متجرك',
        });
      const values = {
        type: input.type,
        digitalDelivery: input.digitalDelivery,
        name: input.name,
        slug: input.slug,
        description: input.description,
        pricePiastres: input.pricePiastres,
        compareAtPricePiastres: input.compareAtPricePiastres,
        stockQuantity: input.stockQuantity,
        categoryId: input.categoryId ? id(input.categoryId) : null,
        imageIds: input.imageIds.map(id),
        status: input.status,
      };
      const product = previous
        ? await this.products
            .findOneAndUpdate(
              {
                _id: previous._id,
                storeId: id(storeId),
                version: previous.version,
              },
              {
                $set: { ...values, ...(input.sku ? { sku: input.sku } : {}) },
                ...(input.sku ? {} : { $unset: { sku: '' } }),
                $inc: { version: 1 },
              },
              { session, returnDocument: 'after', runValidators: true },
            )
            .lean()
        : (
            await this.products.create(
              [
                {
                  ...values,
                  ...(input.sku ? { sku: input.sku } : {}),
                  storeId: id(storeId),
                  version: 0,
                },
              ],
              { session },
            )
          )[0];
      if (!product) throw conflict();
      const delta = input.stockQuantity - (previous?.stockQuantity ?? 0);
      if (delta !== 0)
        await this.movements.create(
          [
            {
              storeId: id(storeId),
              productId: product._id,
              delta,
              quantityAfter: input.stockQuantity,
              actorId: id(actorId),
            },
          ],
          { session },
        );
      return String(product._id);
    });
    return this.getProduct(storeId, savedId);
  }
  async archiveProduct(
    storeId: string,
    actorId: string,
    productId: string,
    version: number,
  ) {
    await this.change(storeId, actorId, async (session) => {
      const product = await this.products
        .findOne({ _id: id(productId), storeId: id(storeId) })
        .session(session)
        .lean();
      if (!product) throw missing();
      if (product.version !== version) throw conflict();
      await this.products.updateOne(
        { _id: product._id, storeId: id(storeId), version },
        { $set: { status: 'ARCHIVED' }, $inc: { version: 1 } },
        { session, runValidators: true },
      );
    });
    return this.getProduct(storeId, productId);
  }
  async listMedia(storeId: string) {
    return {
      items: (
        await this.media
          .find({ storeId: id(storeId) })
          .sort({ _id: -1 })
          .limit(50)
          .lean()
      ).map(mediaDto),
    };
  }
  async upload(
    storeId: string,
    actorId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const image = await normalizeImage(file);
    const key = storeId + '/' + randomBytes(16).toString('hex') + '.webp';
    await this.storage.put(key, image.content);
    try {
      return await this.change(storeId, actorId, async (session) => {
        const existing = await this.media
          .find({ storeId: id(storeId) })
          .session(session)
          .lean();
        if (
          existing.length >= 50 ||
          existing.reduce((bytes, item) => bytes + item.bytes, 0) +
            image.content.length >
            100 * 1024 * 1024
        )
          throw conflict(
            'وصلت لحد الصور أو مساحة 100 MB. احذف صور غير مستخدمة الأول',
          );
        const [created] = await this.media.create(
          [
            {
              storeId: id(storeId),
              key,
              bytes: image.content.length,
              width: image.width,
              height: image.height,
              state: 'READY',
            },
          ],
          { session },
        );
        if (!created) throw missing();
        return { media: mediaDto(created) };
      });
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
  }
  async readMedia(storeId: string, mediaId: string) {
    const record = await this.media
      .findOne({ storeId: id(storeId), _id: id(mediaId), state: 'READY' })
      .lean();
    if (!record) throw missing();
    try {
      return await this.storage.read(record.key);
    } catch {
      throw new ServiceUnavailableException({
        code: 'IMAGE_UNAVAILABLE',
        message: 'الصورة مش متاحة مؤقتًا',
      });
    }
  }
  async deleteMedia(storeId: string, actorId: string, mediaId: string) {
    const key = await this.change(storeId, actorId, async (session) => {
      const store = await this.stores
        .findOne({ _id: id(storeId), ownerId: id(actorId) })
        .session(session)
        .lean();
      if (
        [store?.design, store?.designDraft].some((design) =>
          [
            design?.logoId,
            design?.bannerId,
            ...(design?.sections ?? []).map((section) => section.imageId),
          ].includes(mediaId),
        )
      )
        throw conflict(
          'الصورة مستخدمة في تصميم المتجر. افصلها من التصميم أولًا.',
        );
      const record = await this.media
        .findOne({ storeId: id(storeId), _id: id(mediaId) })
        .session(session)
        .lean();
      if (!record) throw missing();
      if (
        await this.products
          .exists({ storeId: id(storeId), imageIds: record._id })
          .session(session)
      )
        throw conflict('الصورة مستخدمة في منتج. افصلها من المنتج الأول');
      await this.media.updateOne(
        { _id: record._id, storeId: id(storeId) },
        { $set: { state: 'DELETING' } },
        { session },
      );
      return record.key;
    });
    await this.storage.remove(key);
    await this.change(storeId, actorId, async (session) => {
      await this.media.deleteOne(
        { _id: id(mediaId), storeId: id(storeId), state: 'DELETING' },
        { session },
      );
    });
    return { status: 'deleted' };
  }
}
