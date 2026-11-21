import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantNav } from '@/components/merchant-nav';
import { LogoutButton } from '@/components/merchant-form';
import { ProductForm } from '@/components/product-form';
import { ArchiveProduct } from '@/components/catalog-actions';
import {
  getCategories,
  getMedia,
  getProduct,
  requireCatalog,
} from '@/lib/api/catalog';
export default async function EditProductPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { t } = await getI18n();
  const store = await requireCatalog();
  const { id } = await params;
  const [product, categories, media] = await Promise.all([
    getProduct(id),
    getCategories(),
    getMedia(),
  ]);
  return (
    <MerchantShell
      title={t('تعديل المنتج')}
      description={t('أي تغيير في السعر أو المخزون بيتحفظ في متجرك بس.')}
      actions={<LogoutButton />}
      wide
    >
      <MerchantNav active="products" />
      <ProductForm
        currency={store.currency}
        key={product.id + ':' + product.version}
        product={product}
        categories={categories}
        media={media}
      />
      <ArchiveProduct id={product.id} version={product.version} />
    </MerchantShell>
  );
}
