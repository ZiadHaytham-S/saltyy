import { requireCatalog } from '@/lib/api/catalog';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantForm, LogoutButton } from '@/components/merchant-form';
import { getI18n } from '@/lib/i18n';
export default async function SettingsPage() {
  const store = await requireCatalog(),
    { locale } = await getI18n();
  return (
    <MerchantShell
      title={locale === 'ar' ? 'الإعدادات' : 'Settings'}
      description={
        locale === 'ar'
          ? 'إعدادات متجرك الأساسية. الدولة والعملة ثابتتان لحماية الأسعار المسجلة.'
          : 'Store settings. Country and currency are fixed to protect existing prices.'
      }
      actions={<LogoutButton />}
      wide
    >
      <div className="mb-6 rounded-xl border border-border p-4">
        <p>
          {new Intl.DisplayNames([locale], { type: 'region' }).of(
            store.country,
          )}{' '}
          · {store.currency}
        </p>
      </div>
      <MerchantForm mode="edit-store" initialName={store.name} />
    </MerchantShell>
  );
}
