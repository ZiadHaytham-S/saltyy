import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantNav } from '@/components/merchant-nav';
import { LogoutButton } from '@/components/merchant-form';
import { ProductForm } from '@/components/product-form';
import { getCategories, getMedia, requireCatalog } from '@/lib/api/catalog';
export default async function NewProductPage() {
  const { t } = await getI18n();
  const store = await requireCatalog();
  const [categories, media] = await Promise.all([getCategories(), getMedia()]);
  return (
    <MerchantShell
      title={t('إضافة منتج')}
      description={t(
        'ابدأ بالاسم والسعر والمخزون، وبعدين اختار الصور والتصنيف.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <MerchantNav active="products" />
      <ProductForm
        currency={store.currency}
        categories={categories}
        media={media}
      />
    </MerchantShell>
  );
}
