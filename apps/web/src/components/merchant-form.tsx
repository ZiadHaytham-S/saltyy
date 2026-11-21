'use client';
import { useI18n } from '@/components/preferences';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  registerSchema,
  loginSchema,
  createStoreSchema,
  updateStoreSchema,
  authResponseSchema,
  ARAB_COUNTRIES,
  countryCurrencies,
  countryNames,
  localizedError,
} from '@sallty/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiError, mutate } from '@/lib/api/client';
import { useHydrated } from '@/lib/use-hydrated';
type Mode = 'register' | 'login' | 'create-store' | 'edit-store';
const options = {
  register: {
    schema: registerSchema,
    path: '/auth/register',
    next: '/verify-email',
    label: 'إنشاء حساب',
  },
  login: {
    schema: loginSchema,
    path: '/auth/login',
    next: '/dashboard',
    label: 'تسجيل الدخول',
  },
  'create-store': {
    schema: createStoreSchema,
    path: '/merchant/store',
    next: '/dashboard',
    label: 'إنشاء المتجر',
  },
  'edit-store': {
    schema: updateStoreSchema,
    path: '/merchant/store',
    next: '/dashboard',
    label: 'حفظ اسم المتجر',
  },
};
export function MerchantForm({
  mode,
  initialName = '',
}: {
  mode: Mode;
  initialName?: string;
}) {
  const { t, locale } = useI18n();
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const busy = pending || !hydrated;
  const router = useRouter();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const auth = mode === 'register' || mode === 'login';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setSuccess('');
    setFields({});
    const data = new FormData(event.currentTarget);
    const parsed = options[mode].schema.safeParse(Object.fromEntries(data));
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        (errors[key] ??= []).push(
          localizedError('VALIDATION_ERROR', issue.message, locale),
        );
      }
      setFields(errors);
      setError(t('راجع البيانات المكتوبة'));
      return;
    }
    setPending(true);
    try {
      const result = await mutate(
        options[mode].path,
        parsed.data,
        mode === 'edit-store' ? 'PATCH' : 'POST',
      );
      const authResult =
        mode === 'register' ? authResponseSchema.parse(result) : null;
      if (mode === 'edit-store') {
        setSuccess(
          t('اسم المتجر اتحفظ بنجاح. تقدر تكمل إدارة منتجاتك من القائمة.'),
        );
        router.refresh();
        setPending(false);
        return;
      }
      router.replace(
        authResult?.verificationEmailSent === false
          ? '/verify-email?delivery=failed'
          : options[mode].next,
      );
      router.refresh();
      setPending(false);
    } catch (failure) {
      const value =
        failure instanceof ApiError
          ? failure
          : new ApiError(t('حصلت مشكلة، جرّب تاني'));
      setError(value.message);
      setFields(value.fields);
      setPending(false);
    }
  }
  function field(
    key: string,
    label: string,
    type = 'text',
    autoComplete?: string,
    defaultValue?: string,
  ) {
    const id = mode + '-' + key;
    return (
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          name={key}
          type={type}
          required
          disabled={busy}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          minLength={key === 'password' && mode === 'register' ? 12 : undefined}
          maxLength={
            key === 'password'
              ? 128
              : key === 'email'
                ? 254
                : key === 'slug'
                  ? 50
                  : key === 'phone'
                    ? 40
                    : 80
          }
          dir={
            ['email', 'password', 'phone', 'slug'].includes(key)
              ? 'ltr'
              : undefined
          }
          aria-invalid={Boolean(fields[key]?.length)}
          aria-describedby={fields[key]?.length ? id + '-error' : undefined}
        />
        {fields[key]?.length ? (
          <p
            id={id + '-error'}
            className="mt-2 text-sm text-red-700 dark:text-red-400"
          >
            {t(fields[key]?.[0] ?? '')}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {mode !== 'login' &&
        field(
          'name',
          auth ? t('اسمك') : t('اسم المتجر بالعربي'),
          'text',
          auth ? 'name' : 'off',
          initialName,
        )}
      {(mode === 'register' || mode === 'create-store') && (
        <div>
          <Label htmlFor={mode + '-country'}>{t('الدولة')}</Label>
          <Select
            id={mode + '-country'}
            name="country"
            defaultValue="EG"
            disabled={busy}
          >
            {ARAB_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {countryNames[country][locale]}
                {mode === 'create-store'
                  ? ' — ' + countryCurrencies[country]
                  : ''}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              'استخدم رقم الهاتف الخاص بالدولة المختارة. عملة المتجر ثابتة بعد إنشائه.',
            )}
          </p>
        </div>
      )}
      {auth && field('email', t('الإيميل'), 'email', 'email')}
      {mode === 'register' && field('phone', t('رقم الهاتف'), 'tel', 'tel')}
      {auth &&
        field(
          'password',
          t('كلمة المرور') +
            (mode === 'register' ? t(' \u2014 12 حرف على الأقل') : ''),
          'password',
          mode === 'register' ? 'new-password' : 'current-password',
        )}
      {mode === 'create-store' && (
        <>
          {field('slug', t('اسم رابط المتجر (Store Slug)'), 'text', 'off')}
          <p className="text-xs leading-6 text-muted-foreground">
            {t(
              'مثال: nour-shop. الاسم فريد، وهنستخدمه في رابط المتجر لما نجهز النشر. مش بيتغيّر في المرحلة دي.',
            )}
          </p>
        </>
      )}
      <div
        role="status"
        aria-live="polite"
        className={error ? 'text-sm text-red-700' : 'text-sm text-primary'}
      >
        {t(error || success)}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={busy}
        loading={pending}
      >
        {t(options[mode].label)}
      </Button>
      {auth && (
        <p className="text-center text-sm">
          {mode === 'register' ? t('عندك حساب؟') : t('لسه جديد؟')}{' '}
          <Link
            className="text-primary underline underline-offset-4"
            href={mode === 'register' ? '/login' : '/register'}
          >
            {mode === 'register' ? t('سجّل دخولك') : t('اعمل حساب')}
          </Link>
        </p>
      )}
      {mode === 'login' && (
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-primary underline">
            {t('نسيت كلمة المرور؟')}
          </Link>
        </p>
      )}
    </form>
  );
}
export function LogoutButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setPending(true);
    setError('');
    try {
      await mutate('/auth/logout', {});
      router.replace('/login');
      router.refresh();
    } catch {
      setPending(false);
      setError(t('الخروج ما تمّش. جرّب تاني.'));
    }
  }
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        loading={pending}
        onClick={logout}
      >
        {t('تسجيل الخروج')}
      </Button>
      <p role="status" className="mt-2 text-sm text-red-700 dark:text-red-400">
        {error}
      </p>
    </div>
  );
}
