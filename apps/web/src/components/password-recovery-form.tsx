'use client';
import { useI18n } from '@/components/preferences';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { forgotPasswordSchema, resetPasswordSchema } from '@sallty/contracts';
import { mutate } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/lib/use-hydrated';
export function PasswordRecoveryForm({ reset = false }: { reset?: boolean }) {
  const { t } = useI18n();
  const [token] = useState(() =>
      typeof window === 'undefined'
        ? ''
        : (new URLSearchParams(window.location.hash.slice(1)).get('token') ??
          ''),
    ),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [complete, setComplete] = useState(false);
  const hydrated = useHydrated();
  useEffect(() => {
    if (reset) {
      if (token)
        window.history.replaceState(null, '', window.location.pathname);
    }
  }, [reset, token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget),
      password = String(form.get('password') ?? '');
    if (reset && password !== form.get('confirmation')) {
      setError(t('كلمتا المرور غير متطابقتين'));
      return;
    }
    const parsed = reset
      ? resetPasswordSchema.safeParse({ token, password })
      : forgotPasswordSchema.safeParse({ email: form.get('email') });
    if (!parsed.success) {
      setError(
        reset
          ? t('رابط غير صالح أو كلمة مرور أقصر من 12 حرفًا')
          : t('يرجى إدخال بريد إلكتروني صحيح'),
      );
      return;
    }
    setPending(true);
    try {
      await mutate(
        reset ? '/auth/reset-password' : '/auth/forgot-password',
        parsed.data,
      );
      setMessage(
        reset
          ? t(
              'تم تغيير كلمة المرور وإنهاء الجلسات السابقة. سجّل الدخول بكلمة المرور الجديدة.',
            )
          : t(
              'إذا كان البريد الإلكتروني مسجلًا، فسيتم إرسال رابط لاستعادة كلمة المرور.',
            ),
      );
      setComplete(reset);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر إكمال الطلب'));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {!complete && (
        <>
          {reset ? (
            <>
              <Label htmlFor="new-password">{t('كلمة المرور الجديدة')}</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                minLength={12}
                maxLength={128}
                required
                disabled={!hydrated || pending}
              />
              <Label htmlFor="confirm-password">{t('تأكيد كلمة المرور')}</Label>
              <Input
                id="confirm-password"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                minLength={12}
                maxLength={128}
                required
                disabled={!hydrated || pending}
              />
            </>
          ) : (
            <>
              <Label htmlFor="recovery-email">{t('البريد الإلكتروني')}</Label>
              <Input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                maxLength={254}
                required
                disabled={!hydrated || pending}
              />
            </>
          )}
          <Button
            className="w-full"
            disabled={!hydrated || pending || (reset && !token)}
            type="submit"
            loading={pending}
          >
            {reset ? t('حفظ كلمة المرور') : t('إرسال رابط الاستعادة')}
          </Button>
        </>
      )}
      <p role="status" className="text-sm text-primary">
        {message}
      </p>
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        {error}
      </p>
      {reset && hydrated && !token && !complete && (
        <p role="alert">
          {t(
            'الرابط غير صالح. اطلب رابطًا جديدًا من صفحة استعادة كلمة المرور.',
          )}
        </p>
      )}
      <Link
        className="block text-center text-sm text-primary underline"
        href="/login"
      >
        {t('العودة إلى تسجيل الدخول')}
      </Link>
    </form>
  );
}
