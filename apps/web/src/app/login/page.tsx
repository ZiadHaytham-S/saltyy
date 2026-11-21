import { getI18n } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantForm } from '@/components/merchant-form';
import { getMerchant } from '@/lib/api/merchant';
export default async function LoginPage() {
  const { t } = await getI18n();
  if (await getMerchant()) redirect('/dashboard');
  return (
    <MerchantShell
      title={t('أهلًا بيك تاني')}
      description={t('سجّل دخولك علشان تتابع متجرك.')}
    >
      <MerchantForm mode="login" />
    </MerchantShell>
  );
}
