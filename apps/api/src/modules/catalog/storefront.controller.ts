import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Inject,
  UseGuards,
  Headers,
} from '@nestjs/common';
import type { Response } from 'express';
import { publicSlugSchema, storefrontQuerySchema } from '@sallty/contracts';
import { validate } from '../../common/validation.js';
import { DatabaseGuard } from '../../security/guards.js';
import { StorefrontService } from './storefront.service.js';
import { sendVideo } from './video-response.js';
@Controller('public/stores')
@UseGuards(DatabaseGuard)
export class StorefrontController {
  constructor(
    @Inject(StorefrontService) private readonly storefront: StorefrontService,
  ) {}
  @Get(':slug') store(@Param('slug') slug: string) {
    return this.storefront.store(validate(publicSlugSchema, slug));
  }
  @Get(':slug/products') list(
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    return this.storefront.list(
      validate(publicSlugSchema, slug),
      validate(storefrontQuerySchema, query),
    );
  }
  @Get(':slug/branding/:image') async branding(
    @Param('slug') slug: string,
    @Param('image') image: string,
    @Res() response: Response,
  ) {
    const content = await this.storefront.brandingImage(
      validate(publicSlugSchema, slug),
      image,
    );
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(content);
  }
  @Get(':slug/video/:id') async video(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    sendVideo(
      response,
      await this.storefront.video(validate(publicSlugSchema, slug), id),
      range,
    );
  }
  @Get(':slug/products/:product') product(
    @Param('slug') slug: string,
    @Param('product') product: string,
  ) {
    return this.storefront.product(
      validate(publicSlugSchema, slug),
      validate(publicSlugSchema, product),
    );
  }
  @Get(':slug/products/:product/images/:image') async image(
    @Param('slug') slug: string,
    @Param('product') product: string,
    @Param('image') image: string,
    @Res() response: Response,
  ) {
    const content = await this.storefront.image(
      validate(publicSlugSchema, slug),
      validate(publicSlugSchema, product),
      image,
    );
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader(
      'Content-Disposition',
      'inline; filename="product.webp"',
    );
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.send(content);
  }
}
