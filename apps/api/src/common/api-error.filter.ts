import { Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { localizedError } from '@sallty/contracts';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const locale = host
      .switchToHttp()
      .getRequest<Request>()
      .headers['accept-language']?.startsWith('en')
      ? 'en'
      : 'ar';
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const status = error.getStatus();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        const value = body as {
          code: string;
          message: string;
          fieldErrors?: Record<string, string[]>;
        };
        return response.status(status).json({
          ...value,
          message: localizedError(value.code, value.message, locale),
          ...(value.fieldErrors
            ? {
                fieldErrors: Object.fromEntries(
                  Object.entries(value.fieldErrors).map(([key, errors]) => [
                    key,
                    errors.map((text) =>
                      localizedError('VALIDATION_ERROR', text, locale),
                    ),
                  ]),
                ),
              }
            : {}),
        });
      }
      return response.status(status).json({
        code: 'REQUEST_REJECTED',
        message:
          status === 401
            ? locale === 'en'
              ? 'Please sign in.'
              : 'يرجى تسجيل الدخول.'
            : locale === 'en'
              ? 'Request unavailable.'
              : 'الطلب غير متاح.',
      });
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      return response.status(400).json({
        code: 'INVALID_JSON',
        message:
          locale === 'en' ? 'Invalid request format.' : 'صيغة الطلب غير صحيحة.',
      });
    }
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 413
        ? 413
        : 503;
    return response.status(status).json({
      code: status === 413 ? 'BODY_TOO_LARGE' : 'SERVICE_UNAVAILABLE',
      message:
        status === 413
          ? locale === 'en'
            ? 'The request is too large.'
            : 'حجم الطلب أكبر من المسموح.'
          : locale === 'en'
            ? 'Service temporarily unavailable. Try again later.'
            : 'الخدمة غير متاحة مؤقتًا. حاول لاحقًا.',
    });
  }
}
