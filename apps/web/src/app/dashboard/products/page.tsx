import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
import Image from 'next/image';
import { Package, Plus } from 'lucide-react';
import { catalogQuerySchema, minorToInput } from '@sallty/contracts';
import { MerchantShell } from '@/components/merchant-shell';
import { MerchantNav } from '@/components/merchant-nav';
import { LogoutButton } from '@/components/merchant-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button, buttonVariants } from '@/components/ui/button';
import { getCategories, getProducts, requireCatalog } from '@/lib/api/catalog';
const statuses = { DRAFT: 'مسودة', ACTIVE: 'نشط', ARCHIVED: 'مؤرشف' };
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getI18n();
  const store = await requireCatalog();
  const raw = await searchParams;
  const clean = Object.fromEntries(
    Object.entries(raw).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const parsed = catalogQuerySchema.safeParse(clean);
  const query = parsed.success ? parsed.data : catalogQuerySchema.parse({});
  const [result, categories] = await Promise.all([
    getProducts(query),
    getCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / query.pageSize));
  function link(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, page }))
      if (value !== undefined && value !== '') params.set(key, String(value));
    return '/dashboard/products?' + params;
  }
  return (
    <MerchantShell
      title={t('المنتجات')}
      description={t('ضيف منتجاتك، رتّب صورها وتابع أسعارها والمخزون.')}
      actions={<LogoutButton />}
      wide
    >
      <MerchantNav active="products" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {result.total}
          {t('منتج في نتائج البحث')}
        </p>
        <Link href="/dashboard/products/new" className={buttonVariants()}>
          <Plus size={18} aria-hidden="true" />
          {t('إضافة منتج')}
        </Link>
      </div>
      {!parsed.success && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          {t('فلاتر البحث مش صحيحة. عرضنا القائمة الأساسية.')}
        </p>
      )}
      <form
        action="/dashboard/products"
        className="mb-7 grid items-end gap-4 rounded-2xl bg-muted p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <Label htmlFor="search-products">{t('بحث باسم المنتج')}</Label>
          <Input
            id="search-products"
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={80}
            placeholder={t('مثال: قميص')}
          />
        </div>
        <div>
          <Label htmlFor="filter-status">{t('الحالة')}</Label>
          <Select
            id="filter-status"
            name="status"
            defaultValue={query.status ?? ''}
          >
            <option value="">{t('كل الحالات')}</option>
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-category">{t('التصنيف')}</Label>
          <Select
            id="filter-category"
            name="categoryId"
            defaultValue={query.categoryId ?? ''}
          >
            <option value="">{t('كل التصنيفات')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-3">
          <Button type="submit">{t('بحث وتصفية')}</Button>
          <Link
            href="/dashboard/products"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('مسح')}
          </Link>
        </div>
      </form>
      {!result.items.length ? (
        <section className="rounded-2xl border border-dashed border-border px-5 py-14 text-center">
          <Package
            aria-hidden="true"
            className="mx-auto mb-4 text-primary"
            size={38}
          />
          <h2 className="text-lg font-bold">
            {result.total
              ? t('مفيش منتجات في الصفحة دي')
              : query.q || query.status || query.categoryId
                ? t('مفيش نتائج مطابقة')
                : t('أول منتج ليك يبدأ هنا')}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('جرّب تغيّر الفلاتر أو ضيف منتج جديد لمتجرك.')}
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((product) => (
            <li
              key={product.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-border"
            >
              <div className="relative bg-muted">
                {product.images[0] ? (
                  <Image
                    unoptimized
                    src={product.images[0].url}
                    width={product.images[0].width}
                    height={product.images[0].height}
                    alt={product.name}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center">
                    <Package
                      aria-hidden="true"
                      className="text-primary/40"
                      size={48}
                    />
                    <span className="sr-only">{t('بدون صورة')}</span>
                  </div>
                )}
                <span className="absolute end-3 top-3 rounded-lg bg-background px-3 py-2 text-xs font-semibold text-primary">
                  {t(statuses[product.status])}
                </span>
              </div>
              <div className="p-5">
                <h2 className="break-words text-lg font-bold">
                  {product.name}
                </h2>
                <p className="mt-2 text-sm font-semibold text-primary">
                  <span dir="ltr">
                    {minorToInput(product.pricePiastres, store.currency)}{' '}
                    {store.currency}
                  </span>{' '}
                  {product.compareAtPricePiastres && (
                    <del className="ms-2 text-xs font-normal text-muted-foreground">
                      {minorToInput(
                        product.compareAtPricePiastres,
                        store.currency,
                      )}{' '}
                      {store.currency}
                    </del>
                  )}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('المخزون:')}
                  {product.stockQuantity} ·{' '}
                  {categories.find(
                    (category) => category.id === product.categoryId,
                  )?.name ?? t('بدون تصنيف')}
                </p>
                <Link
                  href={'/dashboard/products/' + product.id + '/edit'}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'mt-5 w-full',
                  })}
                >
                  {t('تعديل')} {product.name}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label={t('صفحات المنتجات')}
        className="mt-7 flex flex-wrap items-center justify-between gap-4"
      >
        <p className="text-xs text-muted-foreground">
          {t('صفحة')}
          {query.page}
          {t('من')}
          {pages} · {query.pageSize}
          {t('منتج في الصفحة')}
        </p>
        <div className="flex gap-3">
          {query.page > 1 && (
            <Link
              href={link(query.page - 1)}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('السابق')}
            </Link>
          )}
          {query.page < pages && query.page < 1000 && (
            <Link
              href={link(query.page + 1)}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('التالي')}
            </Link>
          )}
        </div>
      </nav>
    </MerchantShell>
  );
}
