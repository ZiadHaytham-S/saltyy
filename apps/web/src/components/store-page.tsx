import { getI18n } from '@/lib/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { StoreSections } from '@/components/store-sections';
import { LiveStorePreview } from './live-store-preview';
import {
  getPublicStore,
  getPublicProducts,
  parsePublicQuery,
  publicQueryParams,
  storePath,
} from '@/lib/api/storefront';
import { minorToInput, currencyDigits } from '@sallty/contracts';
import { StoreShell, ProductCard, StoreEmpty } from '@/components/storefront';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
type Props = {
  params: Promise<{
    storeSlug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { locale } = await getI18n();
  const { storeSlug } = await params,
    { store } = await getPublicStore(storeSlug);
  const filtered = Object.keys(await searchParams).length > 0;
  return {
    title: {
      absolute: `${store.name} | ${locale === 'ar' ? 'سلتي' : 'Sallty'}`,
    },
    description:
      locale === 'ar'
        ? `تصفح منتجات ${store.name} والأسعار بعملة ${store.currency}.`
        : `Explore ${store.name} products and prices in ${store.currency}.`,
    alternates: { canonical: storePath(storeSlug) },
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: store.name,
      description:
        locale === 'ar'
          ? `تصفح منتجات ${store.name}`
          : `Browse ${store.name} products`,
      locale: locale === 'ar' ? 'ar' : 'en',
      type: 'website',
      url: storePath(storeSlug),
    },
  };
}
export async function renderStorePage(
  { params, searchParams }: Props,
  suppliedStore?: Awaited<ReturnType<typeof getPublicStore>>,
  liveEditor = false,
) {
  const { t, locale } = await getI18n();
  const { storeSlug } = await params,
    { store, categories } = suppliedStore ?? (await getPublicStore(storeSlug)),
    raw = await searchParams;
  const parsed = parsePublicQuery(raw, store.currency),
    home = storePath(storeSlug);
  if (!parsed.success)
    return (
      <StoreShell store={store}>
        <StoreEmpty filtered home={home} />
        <p
          className="mt-4 text-center text-sm text-red-700 dark:text-red-400"
          role="alert"
        >
          {t('إعدادات البحث مش صحيحة. اختار فلاتر جديدة.')}
        </p>
      </StoreShell>
    );
  const query = parsed.data,
    result = await getPublicProducts(storeSlug, query);
  function href(page: number, category = query.category) {
    const params = publicQueryParams(
      {
        ...query,
        page,
        category: category || undefined,
      },
      store.currency,
    );
    return home + '?' + params + '#products';
  }
  const SectionsRenderer = liveEditor ? LiveStorePreview : StoreSections;
  const Shell = liveEditor
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : StoreShell;
  return (
    <Shell store={store}>
      <SectionsRenderer
        store={store}
        design={store.design}
        name={store.name}
        locale={locale}
        categories={
          <nav
            aria-label={t('تصنيفات المنتجات')}
            className="flex flex-wrap gap-3"
          >
            <Link href={href(1, '')}>{t('الكل')}</Link>
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={href(1, category.slug)}
                className="rounded-full border border-border px-4 py-2"
              >
                {category.name}
              </Link>
            ))}
          </nav>
        }
        products={
          <section id="products" className="scroll-mt-6 pt-12">
            <div className="mb-6 flex items-end justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-blue-600">
                  {t('اكتشف المتجر')}
                </p>
                <h2 className="text-2xl font-bold">
                  {store.design?.sections?.find(
                    (section) => section.kind === 'products',
                  )?.title || t('منتجاتنا')}
                </h2>
              </div>
              <span className="text-sm text-muted-foreground">
                {result.total}
                {t('منتج')}
              </span>
            </div>
            {store.design?.categoriesVisible !== false &&
              !store.design?.sections?.length && (
                <nav
                  aria-label={t('تصنيفات المنتجات')}
                  className="mb-6 flex flex-wrap gap-2"
                >
                  <Link
                    href={href(1, '')}
                    aria-current={!query.category ? 'page' : undefined}
                    className={`rounded-full border px-4 py-2 text-sm ${!query.category ? 'border-blue-600 bg-blue-600 text-white' : 'border-border bg-background'}`}
                  >
                    {t('الكل')}
                  </Link>
                  {categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={href(1, category.slug)}
                      aria-current={
                        query.category === category.slug ? 'page' : undefined
                      }
                      className={`rounded-full border px-4 py-2 text-sm ${query.category === category.slug ? 'border-blue-600 bg-blue-600 text-white' : 'border-border bg-background'}`}
                    >
                      {category.name}
                    </Link>
                  ))}
                </nav>
              )}
            <form
              key={JSON.stringify(query)}
              action={home + '#products'}
              className="mb-8 grid grid-cols-2 items-end gap-4 rounded-3xl border border-border bg-background p-5 lg:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))_auto]"
            >
              <label className="col-span-2 min-w-0 text-sm lg:col-span-1">
                <span className="mb-2 flex h-5 items-center gap-2">
                  <Search className="size-4" />
                  {t('بتدور على إيه؟')}
                </span>
                <Input
                  name="q"
                  defaultValue={query.q}
                  maxLength={80}
                  placeholder={t('ابحث باسم المنتج')}
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block">{t('التصنيف')}</span>
                <Select
                  className="mt-0"
                  aria-label={t('التصنيف')}
                  name="category"
                  defaultValue={query.category ?? ''}
                >
                  <option value="">{t('كل التصنيفات')}</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block">
                  {t('السعر من (')}
                  {store.currency})
                </span>
                <Input
                  name="minEGP"
                  type="number"
                  min="0"
                  max={100_000_000 / 10 ** currencyDigits(store.currency)}
                  step={1 / 10 ** currencyDigits(store.currency)}
                  defaultValue={
                    query.minPrice !== undefined
                      ? minorToInput(query.minPrice, store.currency)
                      : ''
                  }
                  placeholder="0"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block">
                  {t('السعر إلى (')}
                  {store.currency})
                </span>
                <Input
                  name="maxEGP"
                  type="number"
                  min="0"
                  max={100_000_000 / 10 ** currencyDigits(store.currency)}
                  step={1 / 10 ** currencyDigits(store.currency)}
                  defaultValue={
                    query.maxPrice !== undefined
                      ? minorToInput(query.maxPrice, store.currency)
                      : ''
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block">{t('ترتيب المنتجات')}</span>
                <Select
                  className="mt-0"
                  aria-label={t('ترتيب المنتجات')}
                  name="sort"
                  defaultValue={query.sort}
                >
                  <option value="newest">{t('الأحدث')}</option>
                  <option value="price-asc">{t('السعر: الأقل أولًا')}</option>
                  <option value="price-desc">{t('السعر: الأعلى أولًا')}</option>
                </Select>
              </label>
              <div className="col-span-2 flex h-12 items-center gap-3 lg:col-span-1">
                <Button type="submit" className="h-12">
                  <SlidersHorizontal className="size-4" />
                  {t('تطبيق')}
                </Button>
                <Link
                  href={home + '#products'}
                  className="inline-flex h-12 shrink-0 items-center whitespace-nowrap text-sm text-muted-foreground underline"
                >
                  {t('مسح الفلاتر')}
                </Link>
              </div>
            </form>
            {result.items.length ? (
              <div className="store-product-grid grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {result.items.map((product) => (
                  <ProductCard
                    key={product.slug}
                    product={product}
                    storeSlug={storeSlug}
                    currency={store.currency}
                  />
                ))}
              </div>
            ) : (
              <StoreEmpty
                filtered={
                  !!(
                    query.q ||
                    query.category ||
                    query.minPrice !== undefined ||
                    query.maxPrice !== undefined ||
                    (query.page ?? 1) > 1
                  )
                }
                home={home}
              />
            )}
            {result.total > result.pageSize && (
              <nav
                aria-label={t('صفحات المنتجات')}
                className="mt-10 flex items-center justify-center gap-5"
              >
                {result.page > 1 && (
                  <Button asChild variant="outline">
                    <Link href={href(result.page - 1)}>{t('السابق')}</Link>
                  </Button>
                )}
                <span className="text-sm">
                  {t('صفحة')}
                  {result.page}
                  {t('من')}
                  {Math.ceil(result.total / result.pageSize)}
                </span>
                {result.page * result.pageSize < result.total && (
                  <Button asChild variant="outline">
                    <Link href={href(result.page + 1)}>{t('التالي')}</Link>
                  </Button>
                )}
              </nav>
            )}
          </section>
        }
      />
    </Shell>
  );
}
export default async function StorePage(props: Props) {
  return renderStorePage(props);
}
