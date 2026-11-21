import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  Inject,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  cartSchema,
  checkoutSchema,
  credentialSchema,
  shippingSchema,
  orderQuerySchema,
  orderUpdateSchema,
  publicSlugSchema,
  versionSchema,
} from '@sallty/contracts';
import { z } from 'zod';
import {
  DatabaseGuard,
  OriginGuard,
  CsrfGuard,
  AuthGuard,
  VerifiedEmailGuard,
  type AuthenticatedRequest,
} from '../../security/guards.js';
import { RateLimitService } from '../../security/rate-limit.service.js';
import { validate } from '../../common/validation.js';
import { OrdersService } from './orders.service.js';
@Controller('public/stores/:slug')
@UseGuards(DatabaseGuard, OriginGuard, CsrfGuard)
export class CheckoutController {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}
  private async limit(
    request: Request,
    response: Response,
    bucket: string,
    max: number,
    seconds: number,
  ) {
    await this.rates.consume(
      bucket + ':' + (request.socket.remoteAddress ?? 'unknown'),
      max,
      seconds,
      response,
    );
  }
  @Post('cart/quote') async quote(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit(request, response, 'cart-quote', 60, 60);
    return this.orders.quote(
      validate(publicSlugSchema, slug),
      validate(cartSchema, body).items,
    );
  }
  @Post('checkout') async checkout(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit(request, response, 'checkout', 30, 600);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_REQUIRED',
        message: 'مفتاح تأكيد الطلب غير صالح.',
      });
    return this.orders.checkout(
      validate(publicSlugSchema, slug),
      validate(checkoutSchema, body),
      key,
    );
  }
  @Post('checkout/recover') async recover(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit(request, response, 'checkout-recover', 30, 300);
    return this.orders.recover(
      validate(publicSlugSchema, slug),
      validate(credentialSchema, body).token,
    );
  }
  @Post('receipt') async receipt(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit(request, response, 'receipt', 30, 300);
    return this.orders.receipt(
      validate(publicSlugSchema, slug),
      validate(credentialSchema, body).token,
    );
  }
  @Post('digital-delivery') async digitalDelivery(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.limit(request, response, 'digital-delivery', 30, 300);
    response.setHeader('Cache-Control', 'no-store');
    const input = validate(
      z.strictObject({
        token: credentialSchema.shape.token,
        productSlug: publicSlugSchema,
      }),
      body,
    );
    return this.orders.digitalDelivery(
      validate(publicSlugSchema, slug),
      input.token,
      input.productSlug,
    );
  }
}
@Controller('merchant')
@UseGuards(DatabaseGuard, OriginGuard, AuthGuard, VerifiedEmailGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}
  @Get('shipping') shipping(@Req() request: AuthenticatedRequest) {
    return this.orders.shipping(request.auth.userId);
  }
  @Post('orders/:id/confirm-payment') @UseGuards(CsrfGuard) confirmPayment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.orders.confirmPayment(
      request.auth.userId,
      id,
      validate(versionSchema, body).version,
    );
  }
  @Post('orders/:id/release-digital') @UseGuards(CsrfGuard) releaseDigital(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = validate(
      z.strictObject({ ...versionSchema.shape, slug: publicSlugSchema }),
      body,
    );
    return this.orders.releaseDigital(
      request.auth.userId,
      id,
      input.slug,
      input.version,
    );
  }
  @Patch('shipping') @UseGuards(CsrfGuard) updateShipping(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.orders.updateShipping(
      request.auth.userId,
      validate(shippingSchema, body).shippingFeePiastres,
    );
  }
  @Get('orders') list(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.orders.list(
      request.auth.userId,
      validate(orderQuerySchema, query),
    );
  }
  @Get('orders/:id') get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.orders.get(request.auth.userId, id);
  }
  @Patch('orders/:id') @UseGuards(CsrfGuard) update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.orders.update(
      request.auth.userId,
      id,
      validate(orderUpdateSchema, body),
    );
  }
}
