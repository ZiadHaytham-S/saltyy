import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityModule } from '../../security/security.module.js';
import { catalogModels } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';
import { CatalogController, UploadRateGuard } from './catalog.controller.js';
import { StoreGuard } from './catalog.guard.js';
import { StorageAdapter, LocalStorageAdapter } from './storage.js';
import { StorefrontService } from './storefront.service.js';
import { StorefrontController } from './storefront.controller.js';
@Module({
  imports: [SecurityModule, MongooseModule.forFeature(catalogModels)],
  controllers: [CatalogController, StorefrontController],
  providers: [
    CatalogService,
    StorefrontService,
    StoreGuard,
    UploadRateGuard,
    { provide: StorageAdapter, useClass: LocalStorageAdapter },
  ],
})
export class CatalogModule {}
