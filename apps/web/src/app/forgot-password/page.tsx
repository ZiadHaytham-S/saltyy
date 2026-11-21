import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { PasswordRecoveryForm } from '@/components/password-recovery-form';
export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <MerchantShell
      title={t('نسيت كلمة المرور؟')}
      description={t('أدخل بريدك الإلكتروني لاستلام رابط استعادة كلمة المرور.')}
    >
      <PasswordRecoveryForm />
    </MerchantShell>
  );
}
