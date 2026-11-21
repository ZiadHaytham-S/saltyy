import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Injectable,
  Headers,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  catalogQuerySchema,
  productInputSchema,
  productUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  versionSchema,
  MAX_IMAGE_BYTES,
  designSchema,
  designDraftSchema,
} from '@sallty/contracts';
import { z } from 'zod';
import { validate } from '../../common/validation.js';
import {
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  CsrfGuard,
} from '../../security/guards.js';
import { RateLimitService } from '../../security/rate-limit.service.js';
import { StoreGuard, type StoreRequest } from './catalog.guard.js';
import { CatalogService } from './catalog.service.js';
import { MAX_VIDEO_BYTES } from './storage.js';
import { sendVideo } from './video-response.js';
@Injectable()
export class UploadRateGuard implements CanActivate {
  constructor(
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<StoreRequest>();
    await this.rates.consume(
      'image-upload:' + request.storeId,
      30,
      3600,
      context.switchToHttp().getResponse<Response>(),
    );
    return true;
  }
}
@Controller('merchant')
@UseGuards(
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  StoreGuard,
)
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get('design') design(@Req() request: StoreRequest) {
    return this.catalog.getDesign(request.storeId);
  }
  @Get('videos') videos(@Req() request: StoreRequest) {
    return this.catalog.listVideos(request.storeId);
  }
  @Get('videos/:id') async video(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    sendVideo(
      response,
      await this.catalog.readVideo(request.storeId, id),
      range,
    );
  }
  @Post('videos')
  @UseGuards(CsrfGuard, UploadRateGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  uploadVideo(
    @Req() request: StoreRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'INVALID_VIDEO',
        message: 'اختر فيديو MP4.',
      });
    return this.catalog.uploadVideo(request.storeId, request.auth.userId, file);
  }
  @Delete('videos/:id') @UseGuards(CsrfGuard) deleteVideo(
    @Req() request: StoreRequest,
    @Param('id') id: string,
  ) {
    return this.catalog.deleteVideo(request.storeId, request.auth.userId, id);
  }
  @Patch('design') @UseGuards(CsrfGuard) saveDesign(
    @Req() request: StoreRequest,
    @Body() body: unknown,
  ) {
    const input = validate(
      z.strictObject({
        design: z.unknown(),
        publish: z.boolean().default(true),
        version: versionSchema.shape.version,
      }),
      body,
    );
    return this.catalog.saveDesign(
      request.storeId,
      request.auth.userId,
      validate(input.publish ? designSchema : designDraftSchema, input.design),
      input.version,
      input.publish,
    );
  }
  @Get('products') list(@Req() request: StoreRequest, @Query() query: unknown) {
    return this.catalog.listProducts(
      request.storeId,
      validate(catalogQuerySchema, query),
    );
  }
  @Get('products/:id') get(
    @Req() request: StoreRequest,
    @Param('id') id: string,
  ) {
    return this.catalog.getProduct(request.storeId, id);
  }
  @Post('products') @UseGuards(CsrfGuard) create(
    @Req() request: StoreRequest,
    @Body() body: unknown,
  ) {
    return this.catalog.saveProduct(
      request.storeId,
      request.auth.userId,
      validate(productInputSchema, body),
    );
  }
  @Patch('products/:id') @UseGuards(CsrfGuard) update(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.saveProduct(
      request.storeId,
      request.auth.userId,
      validate(productUpdateSchema, body),
      id,
    );
  }
  @Delete('products/:id') @UseGuards(CsrfGuard) archive(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.archiveProduct(
      request.storeId,
      request.auth.userId,
      id,
      validate(versionSchema, body).version,
    );
  }
  @Get('categories') categories(@Req() request: StoreRequest) {
    return this.catalog.listCategories(request.storeId);
  }
  @Post('categories') @UseGuards(CsrfGuard) addCategory(
    @Req() request: StoreRequest,
    @Body() body: unknown,
  ) {
    return this.catalog.saveCategory(
      request.storeId,
      request.auth.userId,
      validate(categoryInputSchema, body),
    );
  }
  @Patch('categories/:id') @UseGuards(CsrfGuard) editCategory(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.saveCategory(
      request.storeId,
      request.auth.userId,
      validate(categoryUpdateSchema, body),
      id,
    );
  }
  @Delete('categories/:id') @UseGuards(CsrfGuard) deleteCategory(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.deleteCategory(
      request.storeId,
      request.auth.userId,
      id,
      validate(versionSchema, body).version,
    );
  }
  @Get('media') media(@Req() request: StoreRequest) {
    return this.catalog.listMedia(request.storeId);
  }
  @Post('media')
  @UseGuards(CsrfGuard, UploadRateGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Req() request: StoreRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'اختار صورة',
      });
    return this.catalog.upload(request.storeId, request.auth.userId, file);
  }
  @Get('media/:id') async image(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const image = await this.catalog.readMedia(request.storeId, id);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader(
      'Content-Disposition',
      'inline; filename="product.webp"',
    );
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.send(image);
  }
  @Delete('media/:id') @UseGuards(CsrfGuard) deleteImage(
    @Req() request: StoreRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    validate(versionSchema.omit({ version: true }), body);
    return this.catalog.deleteMedia(request.storeId, request.auth.userId, id);
  }
}
