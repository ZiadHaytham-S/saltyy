import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantNav } from '@/components/merchant-nav';
import { LogoutButton } from '@/components/merchant-form';
import { CategoryManager } from '@/components/category-manager';
import { getCategories, requireCatalog } from '@/lib/api/catalog';
export default async function CategoriesPage() {
  const { t } = await getI18n();
  await requireCatalog();
  const categories = await getCategories();
  return (
    <MerchantShell
      title={t('التصنيفات')}
      description={t(
        'رتّب المنتجات في مجموعات واضحة. حذف التصنيف المستخدم بيتوقف لحد ما تنقل منتجاته.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <MerchantNav active="categories" />
      <CategoryManager categories={categories} />
    </MerchantShell>
  );
}
