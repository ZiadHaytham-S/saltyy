'use client';
import { useI18n } from '@/components/preferences';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailSchema } from '@sallty/contracts';
import { ApiError, mutate } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export function EmailVerificationForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setMessage('');
    const parsed = verifyEmailSchema.safeParse({
      code: new FormData(event.currentTarget).get('code'),
    });
    if (!parsed.success) {
      setError(t('اكتب الكود المكوّن من 6 أرقام'));
      return;
    }
    setPending(true);
    try {
      await mutate('/auth/email/verify', parsed.data);
      router.replace('/dashboard');
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : t('حصلت مشكلة، جرّب تاني'),
      );
    } finally {
      setPending(false);
    }
  }
  async function resend() {
    if (pending || cooldown) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await mutate('/auth/email/resend', {});
      setMessage(t('الكود اتبعت. راجع Inbox وSpam؛ صالح 10 دقايق.'));
      setCooldown(true);
      setTimeout(() => setCooldown(false), 60000);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : t('مش قادرين نبعت الكود'),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <form onSubmit={verify} className="space-y-5" aria-busy={pending}>
        <Label htmlFor="email-code">{t('كود تأكيد الإيميل')}</Label>
        <Input
          id="email-code"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          minLength={6}
          dir="ltr"
          disabled={pending}
          className="h-16 text-center text-2xl tracking-[0.4em]"
          aria-describedby="verify-status"
        />
        <Button
          className="w-full"
          disabled={pending}
          loading={pending}
          type="submit"
        >
          {t('تأكيد الإيميل')}
        </Button>
      </form>
      <p
        id="verify-status"
        role="status"
        aria-live="polite"
        className={error ? 'text-sm text-red-700' : 'text-sm text-primary'}
      >
        {error || message}
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resend}
        loading={pending}
        disabled={pending || cooldown}
      >
        {cooldown ? t('تقدر تبعت كود جديد بعد دقيقة') : t('إرسال كود جديد')}
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">
        {t(
          'لو الكود ما وصلش، جرّب إعادة الإرسال وراجع Spam. مفيش كود هيتعرض هنا أو يتخزن في المتصفح.',
        )}
      </p>
    </div>
  );
}
