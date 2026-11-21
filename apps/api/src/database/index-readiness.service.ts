import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { USER, SESSION, STORE, RATE_BUCKET } from './schemas.js';
import type { User, Session, Store, RateBucket } from './schemas.js';
import { catalogModels } from '../modules/catalog/catalog.schemas.js';
import { orderModels } from '../modules/orders/orders.schemas.js';

@Injectable()
export class IndexReadinessService implements OnModuleInit {
  ready = false;
  constructor(
    @InjectConnection() readonly connection: Connection,
    @InjectModel(USER) private readonly users: Model<User>,
    @InjectModel(SESSION) private readonly sessions: Model<Session>,
    @InjectModel(STORE) private readonly stores: Model<Store>,
    @InjectModel(RATE_BUCKET) private readonly buckets: Model<RateBucket>,
  ) {}
  async onModuleInit() {
    try {
      await this.connection.asPromise();
      await Promise.all([
        this.users.createIndexes(),
        this.sessions.createIndexes(),
        this.stores.createIndexes(),
        this.buckets.createIndexes(),
        ...[...catalogModels, ...orderModels].map(({ name }) =>
          this.connection.model(name).createIndexes(),
        ),
      ]);
      this.ready = true;
    } catch {
      Logger.warn(
        'Authentication database/indexes unavailable. Protected routes fail closed.',
        'Database',
      );
    }
  }
}
