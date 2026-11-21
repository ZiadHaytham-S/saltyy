import { getI18n } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { getMerchant } from '@/lib/api/merchant';
import { MerchantShell } from '@/components/merchant-shell';
import { EmailVerificationForm } from '@/components/email-verification-form';
import { LogoutButton } from '@/components/merchant-form';
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    delivery?: string;
  }>;
}) {
  const { t } = await getI18n();
  const { delivery } = await searchParams;
  const merchant = await getMerchant();
  if (!merchant) redirect('/login');
  if (merchant.emailVerified) redirect('/dashboard');
  return (
    <MerchantShell
      title={t('أكد إيميلك ونكمّل')}
      description={t('كود من 6 أرقام بيتبعت على ') + merchant.email}
      actions={<LogoutButton />}
    >
      {delivery === 'failed' && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900"
        >
          {t(
            'حسابك اتعمل، لكن الكود ما اتبعتش. جرّب إرسال كود جديد؛ لو إعداد Gmail ناقص هنوضح السبب.',
          )}
        </p>
      )}
      <p className="mb-5 text-sm leading-7 text-muted-foreground">
        {t(
          'لو حسابك موجود من قبل، اضغط \u00ABإرسال كود جديد\u00BB. بعد التأكيد هترجع لمتجرك، من غير ما تعمل حساب تاني.',
        )}
      </p>
      <EmailVerificationForm />
    </MerchantShell>
  );
}
