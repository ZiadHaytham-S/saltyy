'use client';
import { beginActivity } from '@/lib/activity';
import {
  apiErrorSchema,
  csrfResponseSchema,
  translateText,
} from '@sallty/contracts';
const locale = () =>
  document.documentElement.lang === 'en' ? ('en' as const) : ('ar' as const);
export class ApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string[]> = {},
    readonly status: number = 0,
    readonly code: string = '',
  ) {
    super(message);
  }
}
export async function mutate(
  path: string,
  body: unknown,
  method = 'POST',
  extraHeaders: Record<string, string> = {},
) {
  const finishActivity = beginActivity();
  try {
    const csrf = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      headers: { 'Accept-Language': locale() },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!csrf.ok) await rejectResponse(csrf);
    const { csrfToken } = csrfResponseSchema.parse(await csrf.json());
    const response = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': locale(),
        'X-CSRF-Token': csrfToken,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) await rejectResponse(response);
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      translateText(
        'مش قادرين نتصل بالسيرفر دلوقتي. جرّب تاني بعد شوية.',
        locale(),
      ),
    );
  } finally {
    finishActivity();
  }
}
export async function uploadImage(
  file: File,
  kind: 'image' | 'video' = 'image',
) {
  const finishActivity = beginActivity();
  try {
    const csrf = await fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      headers: { 'Accept-Language': locale() },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!csrf.ok) await rejectResponse(csrf);
    const { csrfToken } = csrfResponseSchema.parse(await csrf.json());
    const body = new FormData();
    body.set('file', file);
    const response = await fetch(
      kind === 'video' ? '/api/v1/merchant/videos' : '/api/v1/merchant/media',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken, 'Accept-Language': locale() },
        body,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) await rejectResponse(response);
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      kind === 'video'
        ? locale() === 'ar'
          ? 'تعذر رفع الفيديو. حاول مرة أخرى.'
          : 'Video upload failed. Try again.'
        : translateText('رفع الصورة ما تمّش. جرّب تاني.', locale()),
    );
  } finally {
    finishActivity();
  }
}
async function rejectResponse(response: Response): Promise<never> {
  const parsed = apiErrorSchema.safeParse(
    await response.json().catch(() => null),
  );
  throw new ApiError(
    parsed.success
      ? parsed.data.message
      : translateText('حصلت مشكلة مؤقتة، جرّب تاني', locale()),
    parsed.success ? parsed.data.fieldErrors : undefined,
    response.status,
    parsed.success ? parsed.data.code : '',
  );
}
