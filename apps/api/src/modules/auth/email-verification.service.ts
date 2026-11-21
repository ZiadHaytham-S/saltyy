import {
  Injectable,
  Inject,
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomInt, randomBytes, createHmac } from 'node:crypto';
import nodemailer from 'nodemailer';
import { USER, type User } from '../../database/schemas.js';
import { environment } from '../../config/env.js';
import { RateLimitService } from '../../security/rate-limit.service.js';
import type { Response } from 'express';
@Injectable()
export class EmailVerificationService {
  async sendRecovery(email: string, url: string, locale: 'ar' | 'en') {
    if (
      environment.NODE_ENV === 'test' &&
      !['127.0.0.1', 'localhost'].includes(environment.SMTP_HOST)
    )
      throw new Error('Local SMTP required');
    if (
      environment.NODE_ENV !== 'test' &&
      (!environment.APPLICATION_EMAIL ||
        !environment.APPLICATION_PASSWORD ||
        environment.SMTP_HOST !== 'smtp.gmail.com' ||
        environment.SMTP_PORT !== 465)
    )
      throw new Error('Mail not configured');
    const transport = nodemailer.createTransport({
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_PORT === 465,
      requireTLS: environment.NODE_ENV !== 'test',
      ...(environment.NODE_ENV !== 'test'
        ? {
            auth: {
              user: environment.APPLICATION_EMAIL,
              pass: environment.APPLICATION_PASSWORD,
            },
          }
        : {}),
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      await transport.sendMail({
        from: {
          name: 'Sallty | سلتي',
          address: environment.APPLICATION_EMAIL || 'sallty@example.test',
        },
        to: email,
        textEncoding: 'quoted-printable',
        subject:
          locale === 'en'
            ? 'Reset your Sallty password'
            : 'استعادة كلمة المرور في سلتي',
        text:
          (locale === 'en'
            ? 'Use this link within 15 minutes. Do not share it. Ignore this message if you did not request it.'
            : 'استخدم الرابط خلال 15 دقيقة، ولا تشاركه مع أي شخص. تجاهل الرسالة إذا لم تطلب استعادة كلمة المرور.') +
          '\n' +
          url,
      });
    } finally {
      transport.close();
    }
  }
  constructor(
    @InjectModel(USER) private readonly users: Model<User>,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}
  private hash(id: string, nonce: string, code: string) {
    return createHmac('sha256', Buffer.from(environment.CSRF_SECRET, 'hex'))
      .update(JSON.stringify(['email-otp', id, nonce, code]))
      .digest('hex');
  }
  async send(userId: string, response: Response, locale: 'ar' | 'en' = 'ar') {
    await this.rates.consume('email-send-user:' + userId, 5, 3600, response);
    if (
      environment.NODE_ENV === 'test' &&
      !['127.0.0.1', 'localhost'].includes(environment.SMTP_HOST)
    )
      throw new ServiceUnavailableException({
        code: 'MAIL_NOT_CONFIGURED',
        message: 'Local SMTP required for tests',
      });
    if (
      environment.NODE_ENV !== 'test' &&
      (!environment.APPLICATION_EMAIL ||
        !environment.APPLICATION_PASSWORD ||
        environment.SMTP_HOST !== 'smtp.gmail.com' ||
        environment.SMTP_PORT !== 465)
    )
      throw new ServiceUnavailableException({
        code: 'MAIL_NOT_CONFIGURED',
        message: 'إرسال الإيميل محتاج إعداد Gmail App Password على السيرفر',
      });
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const nonce = randomBytes(16).toString('hex');
    const user = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          emailVerifiedAt: null,
          $or: [
            { emailOtpSentAt: { $exists: false } },
            { emailOtpSentAt: { $lte: new Date(Date.now() - 60000) } },
          ],
        },
        {
          $set: {
            emailOtpHash: this.hash(userId, nonce, code),
            emailOtpNonce: nonce,
            emailOtpExpiresAt: new Date(Date.now() + 600000),
            emailOtpSentAt: new Date(),
            emailOtpAttempts: 0,
          },
        },
        { returnDocument: 'after' },
      )
      .lean();
    if (!user) {
      if ((await this.users.findById(userId).lean())?.emailVerifiedAt) return;
      response.setHeader('Retry-After', '60');
      throw new HttpException(
        {
          code: 'RESEND_COOLDOWN',
          message: 'استنى دقيقة قبل ما تطلب كود جديد',
        },
        429,
      );
    }
    const transport = nodemailer.createTransport({
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_PORT === 465,
      requireTLS: environment.NODE_ENV !== 'test',
      ...(environment.NODE_ENV !== 'test'
        ? {
            auth: {
              user: environment.APPLICATION_EMAIL,
              pass: environment.APPLICATION_PASSWORD,
            },
          }
        : {}),
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      await transport.sendMail({
        from: {
          name: 'Sallty | سلتي',
          address: environment.APPLICATION_EMAIL || 'sallty@example.test',
        },
        to: user.email,
        subject:
          locale === 'en'
            ? 'Verify your Sallty email'
            : 'تأكيد البريد الإلكتروني في سلتي',
        text:
          locale === 'en'
            ? `Your verification code: ${code}. Valid for 10 minutes. Do not share it. Ignore this message if you did not request it.`
            : `رمز تأكيد البريد الإلكتروني: ${code}. صالح لمدة 10 دقائق. لا تشاركه مع أي شخص. تجاهل الرسالة إذا لم تطلب الرمز.`,
        html: `<div dir="${locale === 'en' ? 'ltr' : 'rtl'}" style="font-family:Arial,sans-serif;padding:32px;color:#172554"><h1>${locale === 'en' ? 'Welcome to Sallty' : 'مرحبًا بك في سلتي'}</h1><p>${locale === 'en' ? 'Your verification code:' : 'رمز تأكيد البريد الإلكتروني:'}</p><p dir="ltr" style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#2563eb">${code}</p><p>${locale === 'en' ? 'Valid for 10 minutes. Do not share this code.' : 'صالح لمدة 10 دقائق. لا تشارك الرمز مع أي شخص.'}</p></div>`,
      });
    } catch {
      await this.users.updateOne(
        { _id: userId, emailOtpNonce: nonce },
        {
          $unset: {
            emailOtpHash: '',
            emailOtpNonce: '',
            emailOtpExpiresAt: '',
            emailOtpSentAt: '',
            emailOtpAttempts: '',
          },
        },
      );
      throw new ServiceUnavailableException({
        code: 'MAIL_DELIVERY_FAILED',
        message:
          'الكود ما اتبعتش. راجع إعداد Gmail أو جرّب إعادة الإرسال بعد شوية',
      });
    } finally {
      transport.close();
    }
  }
  async verify(userId: string, code: string, response: Response) {
    await this.rates.consume('email-verify-user:' + userId, 10, 900, response);
    const challenge = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          emailVerifiedAt: null,
          emailOtpExpiresAt: { $gt: new Date() },
          emailOtpAttempts: { $lt: 5 },
          emailOtpHash: { $exists: true },
        },
        { $inc: { emailOtpAttempts: 1 } },
        { returnDocument: 'after' },
      )
      .select('+emailOtpNonce +emailOtpHash')
      .lean();
    if (!challenge?.emailOtpNonce)
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'الكود انتهى أو المحاولات خلصت. اطلب كود جديد',
      });
    const verified = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          emailVerifiedAt: null,
          emailOtpNonce: challenge.emailOtpNonce,
          emailOtpHash: this.hash(userId, challenge.emailOtpNonce, code),
          emailOtpAttempts: { $lte: 5 },
          emailOtpExpiresAt: { $gt: new Date() },
        },
        {
          $set: { emailVerifiedAt: new Date() },
          $unset: {
            emailOtpHash: '',
            emailOtpNonce: '',
            emailOtpExpiresAt: '',
            emailOtpSentAt: '',
            emailOtpAttempts: '',
          },
        },
      )
      .lean();
    if (!verified)
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'الكود مش صحيح، راجعه وجرّب تاني',
      });
  }
}
