import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IndexReadinessService } from '../database/index-readiness.service.js';
import { CsrfService } from './csrf.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { readCookie, cookieNames } from './cookies.js';
import { environment } from '../config/env.js';
export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    sessionId: string;
    emailVerified: boolean;
    role: 'MERCHANT' | 'ADMIN';
  };
};
@Injectable()
export class DatabaseGuard implements CanActivate {
  constructor(
    @Inject(IndexReadinessService)
    private readonly state: IndexReadinessService,
  ) {}
  canActivate() {
    if (!this.state.ready || this.state.connection.readyState !== 1)
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'الخدمة مش جاهزة دلوقتي',
      });
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      Object.keys(request.query).length > 0 &&
      !(
        request.method === 'GET' &&
        ['/merchant/products', '/merchant/orders'].includes(request.path)
      )
    ) {
      throw new BadRequestException({
        code: 'QUERY_NOT_ALLOWED',
        message: 'الطلب مش بيقبل query parameters',
      });
    }
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      (origin !== undefined && origin !== environment.APP_ORIGIN) ||
      site === 'cross-site' ||
      (write && origin !== environment.APP_ORIGIN)
    ) {
      throw new ForbiddenException({
        code: 'ORIGIN_REJECTED',
        message: 'مصدر الطلب غير مسموح',
      });
    }
    if (
      write &&
      !request.is('application/json') &&
      !(
        request.method === 'POST' &&
        ['/merchant/media', '/merchant/videos'].includes(request.path) &&
        request.is('multipart/form-data')
      )
    )
      throw new ForbiddenException({
        code: 'JSON_REQUIRED',
        message: 'نوع الطلب غير مسموح',
      });
    return true;
  }
}
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(CsrfService) private readonly csrf: CsrfService) {}
  canActivate(context: ExecutionContext) {
    this.csrf.verify(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.authenticate(
      readCookie(request, cookieNames.session),
    );
    if (!session)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'سجّل دخولك الأول',
      });
    request.auth = session;
    return true;
  }
}
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      !context.switchToHttp().getRequest<AuthenticatedRequest>().auth
        .emailVerified
    )
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'أكد إيميلك الأول علشان تكمّل متجرك',
      });
    return true;
  }
}
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.socket.remoteAddress ?? 'unknown';
    if (request.method === 'GET') {
      await this.rates.consume('csrf:' + ip, 120, 60, response);
    } else if (request.path.endsWith('/register')) {
      await this.rates.consume('register:' + ip, 20, 3600, response);
    } else {
      await this.rates.consume('login-ip:' + ip, 40, 900, response);
      const body: unknown = request.body;
      if (
        body &&
        typeof body === 'object' &&
        'email' in body &&
        typeof body.email === 'string' &&
        body.email.length <= 254
      ) {
        await this.rates.consume(
          'login-account:' + body.email.trim().toLowerCase(),
          5,
          900,
          response,
        );
      }
    }
    return true;
  }
}
