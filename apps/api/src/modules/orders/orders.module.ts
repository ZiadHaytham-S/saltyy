import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityModule } from '../../security/security.module.js';
import { catalogModels } from '../catalog/catalog.schemas.js';
import { orderModels } from './orders.schemas.js';
import { OrdersService } from './orders.service.js';
import { CheckoutController, OrdersController } from './orders.controller.js';
@Module({
  imports: [
    SecurityModule,
    MongooseModule.forFeature([...catalogModels, ...orderModels]),
  ],
  providers: [OrdersService],
  controllers: [CheckoutController, OrdersController],
})
export class OrdersModule {}
