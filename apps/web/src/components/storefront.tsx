import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpLeft, Package, ArrowLeft } from 'lucide-react';
import {
  currencyDigits,
  type PublicStore,
  type PublicProduct,
  type Currency,
} from '@sallty/contracts';
import { Button } from '@/components/ui/button';
import { productPath } from '@/lib/storefront-routes';
import { AddToCart } from './cart';
import { StoreFrame } from './store-frame';
export function egp(value: number, currency: Currency = 'EGP', locale = 'ar') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    value / 10 ** currencyDigits(currency),
  );
}
export async function StoreShell({
  store,
  children,
}: {
  store: PublicStore;
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  return (
    <StoreFrame store={store} locale={locale}>
      {children}
    </StoreFrame>
  );
}
export async function ProductPicture({
  product,
  index = 0,
  priority = false,
}: {
  product: PublicProduct;
  index?: number;
  priority?: boolean;
}) {
  const { t } = await getI18n();
  const image = product.images[index];
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
      {image ? (
        <Image
          src={image.url}
          alt={product.name + (index ? ` — صورة ${index + 1}` : '')}
          fill
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
          className="object-contain p-3"
          unoptimized
          priority={priority}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
          <Package className="size-14" strokeWidth={1} />
          <span className="text-sm">{t('صورة المنتج مش متاحة')}</span>
        </div>
      )}
    </div>
  );
}
export async function ProductCard({
  product,
  storeSlug,
  currency = 'EGP',
}: {
  product: PublicProduct;
  storeSlug: string;
  currency?: Currency;
}) {
  const { t, locale } = await getI18n();
  return (
    <article className="store-product-card group rounded-3xl border border-border bg-background p-3 transition hover:border-blue-300 hover:shadow-lg">
      <Link
        href={productPath(storeSlug, product.slug)}
        className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <ProductPicture product={product} />
        <div className="px-1 pb-2 pt-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {product.category?.name ?? t('من متجرنا')}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-xs ${product.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {product.inStock ? t('متوفر') : t('نفد المخزون')}
            </span>
          </div>
          <h3 className="line-clamp-2 min-h-14 text-base font-bold group-hover:text-blue-700 dark:text-blue-300">
            {product.name}
          </h3>
          {product.type === 'DIGITAL' && (
            <p className="mt-2 text-xs text-muted-foreground">
              {locale === 'ar'
                ? 'منتج رقمي — بدون شحن'
                : 'Digital product — no shipping'}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-bold text-blue-700 dark:text-blue-300">
              {egp(product.pricePiastres, currency, locale)}
            </span>
            {product.compareAtPricePiastres && (
              <del className="text-xs text-slate-400">
                {egp(product.compareAtPricePiastres, currency, locale)}
              </del>
            )}
            <ArrowUpLeft className="ms-auto size-5 text-blue-600" />
          </div>
        </div>
      </Link>
      <AddToCart
        storeSlug={storeSlug}
        productSlug={product.slug}
        available={product.inStock}
      />
    </article>
  );
}
export async function StoreEmpty({
  filtered,
  home,
}: {
  filtered: boolean;
  home: string;
}) {
  const { t } = await getI18n();
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-background px-5 py-16 text-center">
      <Package className="mx-auto mb-4 size-10 text-blue-500" />
      <h2 className="text-xl font-bold">
        {filtered ? t('مفيش منتجات مطابقة') : t('المنتجات هتظهر هنا قريب')}
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {filtered
          ? t('جرّب كلمة بحث مختلفة أو غيّر الفلاتر.')
          : t('المتجر لسه بيجهز اختياراته. ارجع لنا تاني.')}
      </p>
      {filtered && (
        <Button asChild className="mt-5">
          <Link href={home}>
            {t('عرض كل المنتجات')}
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
