import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import {
  countryCurrencies,
  type CreateStoreInput,
  type MerchantStore,
} from '@sallty/contracts';
import { STORE } from '../../database/schemas.js';
import type { Store } from '../../database/schemas.js';
import { isDuplicateKey } from '../../common/validation.js';
function dto(store: Store): MerchantStore {
  return {
    id: store._id.toString(),
    name: store.name,
    slug: store.slug,
    country: store.country ?? 'EG',
    currency: store.currency ?? 'EGP',
  };
}
@Injectable()
export class StoresService {
  constructor(@InjectModel(STORE) private readonly stores: Model<Store>) {}
  async get(ownerId: string, id?: string) {
    if (id && !/^[a-f\d]{24}$/i.test(id))
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: 'المتجر مش موجود',
      });
    const store = await this.stores
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        ...(id ? { _id: new Types.ObjectId(id) } : {}),
      })
      .lean();
    if (!store)
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: 'المتجر مش موجود',
      });
    return dto(store);
  }
  async create(ownerId: string, input: CreateStoreInput) {
    try {
      const store = await this.stores.create({
        ownerId: new Types.ObjectId(ownerId),
        name: input.name,
        slug: input.slug,
        country: input.country,
        currency: countryCurrencies[input.country],
      });
      return dto(store);
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictException({
          code: 'STORE_CONFLICT',
          message: 'عندك متجر بالفعل، أو الـ slug مستخدم. جرّب اسم تاني',
        });
      throw error;
    }
  }
  async update(ownerId: string, name: string, id?: string) {
    if (id && !/^[a-f\d]{24}$/i.test(id))
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: 'المتجر مش موجود',
      });
    const store = await this.stores
      .findOneAndUpdate(
        {
          ownerId: new Types.ObjectId(ownerId),
          ...(id ? { _id: new Types.ObjectId(id) } : {}),
        },
        { $set: { name } },
        { runValidators: true, returnDocument: 'after' },
      )
      .lean();
    if (!store)
      throw new NotFoundException({
        code: 'STORE_NOT_FOUND',
        message: 'المتجر مش موجود',
      });
    return dto(store);
  }
}
