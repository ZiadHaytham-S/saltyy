import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../security/guards.js';
import { StoresService } from '../stores/stores.service.js';
export type StoreRequest = AuthenticatedRequest & { storeId: string };
@Injectable()
export class StoreGuard implements CanActivate {
  constructor(@Inject(StoresService) private readonly stores: StoresService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<StoreRequest>();
    const store = await this.stores.get(request.auth.userId);
    if (!store) throw new NotFoundException();
    request.storeId = store.id;
    return true;
  }
}
