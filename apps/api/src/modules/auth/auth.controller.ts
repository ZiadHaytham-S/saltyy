import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Inject,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@sallty/contracts';
import { EmailVerificationService } from './email-verification.service.js';
import { AuthService } from './auth.service.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import {
  DatabaseGuard,
  OriginGuard,
  CsrfGuard,
  AuthGuard,
  AuthRateGuard,
} from '../../security/guards.js';
import type { AuthenticatedRequest } from '../../security/guards.js';
import { CsrfService } from '../../security/csrf.service.js';
import { validate } from '../../common/validation.js';
import {
  cookieNames,
  readCookie,
  setCookie,
  clearCookie,
  SESSION_SECONDS,
} from '../../security/cookies.js';

@Controller('auth')
@UseGuards(DatabaseGuard, OriginGuard)
export class AuthController {
  constructor(
    @Inject(PasswordRecoveryService)
    private readonly recovery: PasswordRecoveryService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CsrfService) private readonly csrf: CsrfService,
    @Inject(EmailVerificationService)
    private readonly verification: EmailVerificationService,
  ) {}
  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  forgot(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.recovery.request(
      validate(forgotPasswordSchema, body).email,
      request.socket.remoteAddress ?? 'unknown',
      response,
      request.headers['accept-language']?.startsWith('en') ? 'en' : 'ar',
    );
  }
  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  async reset(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = validate(resetPasswordSchema, body);
    const result = await this.recovery.reset(
      input.token,
      input.password,
      request.socket.remoteAddress ?? 'unknown',
      response,
    );
    clearCookie(response, cookieNames.session);
    clearCookie(response, cookieNames.csrf);
    return result;
  }
  @Get('csrf')
  @UseGuards(AuthRateGuard)
  csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.csrf.issue(request, response);
  }
  @Post('register')
  @UseGuards(CsrfGuard, AuthRateGuard)
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(
      validate(registerSchema, body),
      readCookie(request, cookieNames.session),
    );
    setCookie(response, cookieNames.session, result.token, SESSION_SECONDS);
    clearCookie(response, cookieNames.csrf);
    let verificationEmailSent = false;
    try {
      await this.verification.send(
        result.user.id,
        response,
        request.headers['accept-language']?.startsWith('en') ? 'en' : 'ar',
      );
      verificationEmailSent = true;
    } catch {
      /* Account is preserved; signed-in user can resend safely. */
    }
    return { user: result.user, verificationEmailSent };
  }
  @Post('login')
  @HttpCode(200)
  @UseGuards(CsrfGuard, AuthRateGuard)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      validate(loginSchema, body),
      readCookie(request, cookieNames.session),
    );
    setCookie(response, cookieNames.session, result.token, SESSION_SECONDS);
    clearCookie(response, cookieNames.csrf);
    return { user: result.user };
  }
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return { user: await this.auth.me(request.auth.userId) };
  }
  @Post('email/resend')
  @HttpCode(200)
  @UseGuards(CsrfGuard, AuthGuard)
  async resend(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    validate(verifyEmailSchema.omit({ code: true }), body);
    await this.verification.send(
      request.auth.userId,
      response,
      request.headers['accept-language']?.startsWith('en') ? 'en' : 'ar',
    );
    return { status: 'ok' };
  }
  @Post('email/verify')
  @HttpCode(200)
  @UseGuards(CsrfGuard, AuthGuard)
  async verify(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.verification.verify(
      request.auth.userId,
      validate(verifyEmailSchema, body).code,
      response,
    );
    return { status: 'ok' };
  }
  @Post('logout')
  @HttpCode(200)
  @UseGuards(CsrfGuard, AuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.auth.sessionId);
    clearCookie(response, cookieNames.session);
    clearCookie(response, cookieNames.csrf);
    return { status: 'ok' };
  }
}
