import { getI18n } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantForm, LogoutButton } from '@/components/merchant-form';
import { requireMerchant, getMerchantStore } from '@/lib/api/merchant';
export default async function OnboardingPage() {
  const { t } = await getI18n();
  await requireMerchant();
  if (await getMerchantStore()) redirect('/dashboard');
  return (
    <MerchantShell
      title={t('اختار اسم متجرك')}
      description={t(
        'اسم بالعربي يعرفه عملاؤك، واسم رابط إنجليزي فريد لمتجرك.',
      )}
      actions={<LogoutButton />}
    >
      <MerchantForm mode="create-store" />
    </MerchantShell>
  );
}
