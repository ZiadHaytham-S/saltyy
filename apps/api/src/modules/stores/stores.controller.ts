import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Param,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { createStoreSchema, updateStoreSchema } from '@sallty/contracts';
import { StoresService } from './stores.service.js';
import {
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  CsrfGuard,
} from '../../security/guards.js';
import type { AuthenticatedRequest } from '../../security/guards.js';
import { validate } from '../../common/validation.js';

@Controller('merchant')
@UseGuards(DatabaseGuard, OriginGuard, AuthGuard, VerifiedEmailGuard)
export class StoresController {
  constructor(@Inject(StoresService) private readonly stores: StoresService) {}
  @Get('store')
  async mine(@Req() request: AuthenticatedRequest) {
    return { store: await this.stores.get(request.auth.userId) };
  }
  @Get('stores/:id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { store: await this.stores.get(request.auth.userId, id) };
  }
  @Post('store')
  @UseGuards(CsrfGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return {
      store: await this.stores.create(
        request.auth.userId,
        validate(createStoreSchema, body),
      ),
    };
  }
  @Patch('store')
  @UseGuards(CsrfGuard)
  async updateMine(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return {
      store: await this.stores.update(
        request.auth.userId,
        validate(updateStoreSchema, body).name,
      ),
    };
  }
  @Patch('stores/:id')
  @UseGuards(CsrfGuard)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return {
      store: await this.stores.update(
        request.auth.userId,
        validate(updateStoreSchema, body).name,
        id,
      ),
    };
  }
}
