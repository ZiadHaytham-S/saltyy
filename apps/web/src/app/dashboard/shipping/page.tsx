import { getShipping } from '@/lib/api/orders';
import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
import { ShippingForm } from '@/components/order-management';
export default async function ShippingPage() {
  const settings = await getShipping(),
    { locale } = await getI18n();
  return (
    <MerchantShell
      title={locale === 'ar' ? 'إعدادات الشحن' : 'Shipping settings'}
      description={
        locale === 'ar'
          ? 'رسوم ثابتة دون ربط شركات شحن.'
          : 'A flat fee, without shipping integrations.'
      }
      actions={<LogoutButton />}
      wide
    >
      <ShippingForm
        fee={settings.shippingFeePiastres}
        supported={settings.checkoutSupported}
      />
    </MerchantShell>
  );
}
