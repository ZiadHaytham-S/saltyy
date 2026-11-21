import { getI18n } from '@/lib/i18n';
import { AddToCart } from '@/components/cart';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Package, ArrowRight } from 'lucide-react';
import {
  getPublicStore,
  getPublicProduct,
  storePath,
} from '@/lib/api/storefront';
import { StoreShell, ProductPicture, egp } from '@/components/storefront';
type Props = {
  params: Promise<{
    storeSlug: string;
    productSlug: string;
  }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await getI18n();
  const { storeSlug, productSlug } = await params;
  const [{ store }, product] = await Promise.all([
    getPublicStore(storeSlug),
    getPublicProduct(storeSlug, productSlug),
  ]);
  const description =
    product.description.slice(0, 160) ||
    (locale === 'ar'
      ? `${product.name} من ${store.name}`
      : `${product.name} from ${store.name}`);
  return {
    title: { absolute: `${product.name} | ${store.name}` },
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${storePath(storeSlug)}/products/${productSlug}`,
    },
    openGraph: {
      title: product.name,
      description,
      locale: locale === 'ar' ? 'ar' : 'en',
      type: 'website',
      images: product.images.slice(0, 1).map((i) => ({
        url: i.url,
        width: i.width,
        height: i.height,
        alt: product.name,
      })),
    },
  };
}
export default async function ProductPage({ params }: Props) {
  const { t, locale } = await getI18n();
  const { storeSlug, productSlug } = await params;
  const [{ store }, product] = await Promise.all([
      getPublicStore(storeSlug),
      getPublicProduct(storeSlug, productSlug),
    ]),
    home = storePath(storeSlug);
  return (
    <StoreShell store={store}>
      <nav
        aria-label={t('مسار الصفحة')}
        className="mb-8 flex flex-wrap gap-2 text-sm text-muted-foreground"
      >
        <Link href={home}>{t('المتجر')}</Link>
        <span>/</span>
        {product.category && (
          <>
            <Link href={home + '?category=' + product.category.slug}>
              {product.category.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">{product.name}</span>
      </nav>
      <article className="grid items-start gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <ProductPicture product={product} priority />
          {product.images.length > 1 && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {product.images.slice(1).map((image, index) => (
                <ProductPicture
                  key={image.url}
                  product={product}
                  index={index + 1}
                />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-border bg-background p-6 sm:p-9">
          <p className="mb-4 text-sm text-blue-600">
            {product.category?.name ?? store.name}
          </p>
          <h1 className="text-3xl font-bold leading-relaxed">{product.name}</h1>
          {product.type === 'DIGITAL' && (
            <p className="mt-3 text-sm text-muted-foreground">
              {locale === 'ar'
                ? 'منتج رقمي — لا يحتاج إلى عنوان أو شحن. التسليم بعد تأكيد استلام المبلغ.'
                : 'Digital product — no address or shipping. Delivery after payment confirmation.'}
            </p>
          )}
          <div className="my-7 flex flex-wrap items-center gap-4">
            <span className="text-3xl font-bold text-blue-700 dark:text-blue-300">
              {egp(product.pricePiastres, store.currency, locale)}
            </span>
            {product.compareAtPricePiastres && (
              <del className="text-lg text-slate-400">
                {egp(product.compareAtPricePiastres, store.currency, locale)}
              </del>
            )}
          </div>
          <p
            className={`mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${product.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
          >
            {product.inStock ? (
              <Check className="size-4" />
            ) : (
              <Package className="size-4" />
            )}
            {product.inStock ? t('متوفر في المخزون') : t('نفد المخزون حاليًا')}
          </p>
          <AddToCart
            storeSlug={store.slug}
            productSlug={product.slug}
            available={product.inStock}
          />
          <div className="mt-5 border-t border-border pt-6">
            <h2 className="mb-4 text-lg font-bold">{t('عن المنتج')}</h2>
            <p className="whitespace-pre-wrap break-words text-sm leading-8 text-muted-foreground">
              {product.description || t('مفيش وصف إضافي للمنتج حاليًا.')}
            </p>
          </div>
          <Link
            href={home + '#products'}
            className="mt-8 flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
          >
            <ArrowRight className="size-4" />
            {t('كمّل تصفح المتجر')}
          </Link>
        </div>
      </article>
    </StoreShell>
  );
}
