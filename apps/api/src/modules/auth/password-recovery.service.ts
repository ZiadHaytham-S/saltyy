import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Model, Connection } from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import {
  USER,
  SESSION,
  type User,
  type Session,
} from '../../database/schemas.js';
import { tokenHash } from '../../security/cookies.js';
import { RateLimitService } from '../../security/rate-limit.service.js';
import { environment } from '../../config/env.js';
import { EmailVerificationService } from './email-verification.service.js';
import { hashOptions } from './auth.service.js';
const invalid = () =>
  new BadRequestException({
    code: 'RESET_INVALID',
    message: 'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية',
  });
@Injectable()
export class PasswordRecoveryService {
  private pending = 0;
  constructor(
    @InjectModel(USER) private readonly users: Model<User>,
    @InjectModel(SESSION) private readonly sessions: Model<Session>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
    @Inject(EmailVerificationService)
    private readonly mail: EmailVerificationService,
  ) {}
  async request(
    email: string,
    ip: string,
    response: Response,
    locale: 'ar' | 'en',
  ) {
    await this.rates.consume('recovery-ip:' + ip, 10, 3600, response);
    await this.rates.consume(
      'recovery-email:' + tokenHash(email),
      3,
      3600,
      response,
    );
    if (this.pending >= 10)
      throw new HttpException(
        { code: 'RECOVERY_BUSY', message: 'يرجى المحاولة لاحقًا' },
        429,
      );
    this.pending++;
    // Local bounded background delivery; retry after a restart or SMTP failure.
    setImmediate(() => {
      void this.deliver(email, locale)
        .catch((error: unknown) =>
          Logger.warn(
            'Recovery email could not be delivered (' +
              (error instanceof Error ? error.name : 'UnknownError') +
              ', ' +
              (typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              typeof error.code === 'string' &&
              /^[A-Z_]{1,40}$/.test(error.code)
                ? error.code
                : 'NO_CODE') +
              ').',
            'PasswordRecovery',
          ),
        )
        .finally(() => {
          this.pending--;
        });
    });
    return {
      status: 'ok',
      message:
        locale === 'en'
          ? 'If an account exists, a password reset link will be sent.'
          : 'إذا كان البريد الإلكتروني مسجلًا، فسيتم إرسال رابط لاستعادة كلمة المرور.',
    };
  }
  private async deliver(email: string, locale: 'ar' | 'en') {
    const raw = randomBytes(32).toString('base64url'),
      hash = tokenHash(raw);
    const user = await this.users
      .findOneAndUpdate(
        {
          email,
          $or: [
            { passwordResetSentAt: { $exists: false } },
            { passwordResetSentAt: { $lt: new Date(Date.now() - 60000) } },
          ],
        },
        {
          $set: {
            passwordResetHash: hash,
            passwordResetExpiresAt: new Date(Date.now() + 900000),
            passwordResetSentAt: new Date(),
          },
        },
      )
      .lean();
    if (!user) return;
    try {
      await this.mail.sendRecovery(
        user.email,
        `${environment.APP_ORIGIN}/reset-password#token=${raw}`,
        locale,
      );
    } catch (error) {
      await this.users.updateOne(
        { _id: user._id, passwordResetHash: hash },
        {
          $unset: {
            passwordResetHash: '',
            passwordResetExpiresAt: '',
            passwordResetSentAt: '',
          },
        },
      );
      throw error;
    }
  }
  async reset(token: string, password: string, ip: string, response: Response) {
    await this.rates.consume('reset-ip:' + ip, 20, 900, response);
    const hash = tokenHash(token);
    if (
      !(await this.users.exists({
        passwordResetHash: hash,
        passwordResetExpiresAt: { $gt: new Date() },
      }))
    )
      throw invalid();
    const passwordHash = await argon2.hash(password, hashOptions);
    await this.connection.transaction(async (session) => {
      const user = await this.users
        .findOneAndUpdate(
          {
            passwordResetHash: hash,
            passwordResetExpiresAt: { $gt: new Date() },
          },
          {
            $set: { passwordHash },
            $inc: { authRevision: 1 },
            $unset: {
              passwordResetHash: '',
              passwordResetExpiresAt: '',
              passwordResetSentAt: '',
            },
          },
          { session },
        )
        .lean();
      if (!user) throw invalid();
      await this.sessions.deleteMany({ userId: user._id }, { session });
    });
    return { status: 'ok' };
  }
}
