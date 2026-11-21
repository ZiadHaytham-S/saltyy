import {
  Controller,
  Get,
  UseGuards,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { USER, STORE, type User, type Store } from '../../database/schemas.js';
import {
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  type AuthenticatedRequest,
} from '../../security/guards.js';
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      context.switchToHttp().getRequest<AuthenticatedRequest>().auth.role !==
      'ADMIN'
    )
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'هذه الصفحة مخصصة لمسؤول المنصة',
      });
    return true;
  }
}
@Controller('admin')
@UseGuards(
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  AdminGuard,
)
export class AdminController {
  constructor(
    @InjectModel(USER) private readonly users: Model<User>,
    @InjectModel(STORE) private readonly stores: Model<Store>,
  ) {}
  @Get('summary') async summary() {
    const [users, stores] = await Promise.all([
      this.users.countDocuments().maxTimeMS(2000),
      this.stores.countDocuments().maxTimeMS(2000),
    ]);
    return { users, stores };
  }
}
