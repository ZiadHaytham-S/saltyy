import { getI18n } from '@/lib/i18n';
import type { Metadata } from 'next';
import { MerchantShell } from '@/components/merchant-shell';
import { PasswordRecoveryForm } from '@/components/password-recovery-form';
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  return (
    <MerchantShell
      title={t('تعيين كلمة مرور جديدة')}
      description={t(
        'اختر كلمة مرور لا تقل عن 12 حرفًا. سيتم إنهاء جميع جلساتك السابقة.',
      )}
    >
      <PasswordRecoveryForm reset />
    </MerchantShell>
  );
}
