import { Module, Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { environment } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { SecurityModule } from './security/security.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';

@Module({
  imports: [
    SecurityModule,
    CatalogModule,
    OrdersModule,
    MongooseModule.forRoot(environment.MONGODB_URI, {
      lazyConnection: true,
      autoIndex: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
      connectionFactory: (connection: Connection) => {
        connection.on('error', () =>
          Logger.warn('MongoDB unavailable; /ready returns 503.', 'Database'),
        );
        // lazyConnection bypasses onConnectionCreate. Consume its initial
        // rejection here; the error listener logs a redacted message above.
        void connection.asPromise().catch(() => undefined);
        return connection;
      },
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
