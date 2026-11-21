import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { modelDefinitions } from '../database/schemas.js';
import { IndexReadinessService } from '../database/index-readiness.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { PasswordRecoveryService } from '../modules/auth/password-recovery.service.js';
import {
  AdminController,
  AdminGuard,
} from '../modules/auth/admin.controller.js';
import { EmailVerificationService } from '../modules/auth/email-verification.service.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { StoresService } from '../modules/stores/stores.service.js';
import { StoresController } from '../modules/stores/stores.controller.js';
import { CsrfService } from './csrf.service.js';
import { RateLimitService } from './rate-limit.service.js';
import {
  DatabaseGuard,
  OriginGuard,
  AuthGuard,
  VerifiedEmailGuard,
  CsrfGuard,
  AuthRateGuard,
} from './guards.js';
@Module({
  imports: [MongooseModule.forFeature(modelDefinitions)],
  providers: [
    IndexReadinessService,
    AuthService,
    PasswordRecoveryService,
    AdminGuard,
    EmailVerificationService,
    StoresService,
    CsrfService,
    RateLimitService,
    DatabaseGuard,
    OriginGuard,
    AuthGuard,
    VerifiedEmailGuard,
    CsrfGuard,
    AuthRateGuard,
  ],
  controllers: [AuthController, StoresController, AdminController],
  exports: [
    IndexReadinessService,
    MongooseModule,
    AuthService,
    CsrfService,
    StoresService,
    DatabaseGuard,
    OriginGuard,
    AuthGuard,
    VerifiedEmailGuard,
    CsrfGuard,
    RateLimitService,
  ],
})
export class SecurityModule {}
