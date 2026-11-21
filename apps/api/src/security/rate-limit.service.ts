import { Injectable, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac } from 'node:crypto';
import type { Model } from 'mongoose';
import type { Response } from 'express';
import { RATE_BUCKET } from '../database/schemas.js';
import type { RateBucket } from '../database/schemas.js';
import { environment } from '../config/env.js';
import { isDuplicateKey } from '../common/validation.js';
@Injectable()
export class RateLimitService {
  constructor(
    @InjectModel(RATE_BUCKET) private readonly buckets: Model<RateBucket>,
  ) {}
  async consume(
    identifier: string,
    limit: number,
    windowSeconds: number,
    response: Response,
  ) {
    const window = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = createHmac(
      'sha256',
      Buffer.from(environment.CSRF_SECRET, 'hex'),
    )
      .update(identifier + ':' + window)
      .digest('hex');
    const expiresAt = new Date((window + 1) * windowSeconds * 1000);
    let bucket;
    try {
      bucket = await this.buckets
        .findOneAndUpdate(
          { key },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
          { upsert: true, returnDocument: 'after' },
        )
        .lean();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      bucket = await this.buckets
        .findOneAndUpdate(
          { key },
          { $inc: { count: 1 } },
          { returnDocument: 'after' },
        )
        .lean();
    }
    if (!bucket || bucket.count > limit) {
      response.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
      );
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'محاولات كتير، استنى شوية وحاول تاني',
        },
        429,
      );
    }
  }
}
