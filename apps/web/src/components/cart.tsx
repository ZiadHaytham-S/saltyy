'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import {
  currencyDigits,
  type Currency,
  type CartQuote,
  type CartItem,
} from '@sallty/contracts';
import { useCart, changeCart } from '@/lib/cart';
import { mutate } from '@/lib/api/client';
import { useI18n } from './preferences';
import { useHydrated } from '@/lib/use-hydrated';
import { Button } from './ui/button';
import { SalltyLoader } from './ui/sallty-loader';
export const formatPrice = (
  price: number,
  locale: 'ar' | 'en',
  currency: Currency = 'EGP',
) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    price / 10 ** currencyDigits(currency),
  );
export function CartLink({ slug }: { slug: string }) {
  const items = useCart(slug),
    { locale } = useI18n();
  return (
    <Link
      href={'/store/' + slug + '/cart'}
      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
    >
      <ShoppingBag className="size-4" />
      {locale === 'ar' ? 'السلة' : 'Cart'}{' '}
      <span>{items.reduce((a, i) => a + i.quantity, 0)}</span>
    </Link>
  );
}
export function AddToCart({
  storeSlug,
  productSlug,
  available,
}: {
  storeSlug: string;
  productSlug: string;
  available: boolean;
}) {
  const { locale } = useI18n(),
    hydrated = useHydrated(),
    [message, setMessage] = useState('');
  return (
    <div className="mt-5">
      <Button
        className="w-full"
        disabled={!available || !hydrated}
        onClick={() => {
          try {
            changeCart(storeSlug, (items) => {
              const item = items.find((i) => i.slug === productSlug);
              return item
                ? items.map((i) =>
                    i.slug === productSlug
                      ? { ...i, quantity: i.quantity + 1 }
                      : i,
                  )
                : [...items, { slug: productSlug, quantity: 1 }];
            });
            setMessage(
              locale === 'ar' ? 'تمت الإضافة إلى السلة.' : 'Added to cart.',
            );
          } catch {
            setMessage(
              locale === 'ar'
                ? 'تعذر الإضافة. الحد الأقصى 20 منتجًا و100 قطعة لكل منتج.'
                : 'Unable to add: maximum 20 products and 100 units per product.',
            );
          }
        }}
      >
        {locale === 'ar' ? 'أضف إلى السلة' : 'Add to cart'}
      </Button>
      <p role="status" className="mt-2 text-sm text-primary">
        {message}
      </p>
    </div>
  );
}
export function useCartQuote(slug: string, items: CartItem[]) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const signature = JSON.stringify(items),
    [state, setState] = useState<{
      signature: string;
      store: string;
      revision: number;
      quote: CartQuote | null;
      error: string;
    }>({ signature: '', store: '', revision: -1, quote: null, error: '' });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const rows = JSON.parse(signature) as CartItem[];
      if (!rows.length) return;
      void mutate('/public/stores/' + slug + '/cart/quote', { items: rows })
        .then((data) => {
          if (active)
            setState({
              signature,
              store: slug,
              revision,
              quote: data as CartQuote,
              error: '',
            });
        })
        .catch(() => {
          if (active)
            setState({
              signature,
              store: slug,
              revision,
              quote: null,
              error: 'QUOTE_FAILED',
            });
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, signature, revision]);
  return state.signature === signature &&
    state.store === slug &&
    state.revision === revision
    ? { ...state, refresh }
    : { signature, quote: null, error: '', refresh };
}
export function CartPageContent({ slug }: { slug: string }) {
  const items = useCart(slug),
    { quote, error } = useCartQuote(slug, items),
    { locale } = useI18n(),
    [message, setMessage] = useState('');
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  function update(product: string, delta: number) {
    try {
      changeCart(slug, (rows) =>
        rows
          .map((i) =>
            i.slug === product ? { ...i, quantity: i.quantity + delta } : i,
          )
          .filter((i) => i.quantity > 0),
      );
    } catch {
      setMessage(text('تعذر تحديث السلة.', 'Unable to update cart.'));
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-3xl font-bold">
        {text('سلة التسوق', 'Shopping cart')}
      </h1>
      {!items.length ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <h2>{text('السلة فارغة', 'Your cart is empty')}</h2>
          <Link
            className="mt-4 block text-primary underline"
            href={'/store/' + slug}
          >
            {text('تصفح المنتجات', 'Browse products')}
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item) => {
              const current = quote?.items.find((i) => i.slug === item.slug);
              return (
                <article
                  key={item.slug}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5"
                >
                  <div>
                    <Link
                      href={'/store/' + slug + '/products/' + item.slug}
                      className="font-bold"
                    >
                      {current?.name ?? item.slug}
                    </Link>
                    <p>
                      {current?.unitPricePiastres !== null &&
                      current?.unitPricePiastres !== undefined
                        ? formatPrice(
                            current.unitPricePiastres,
                            locale,
                            quote?.currency,
                          )
                        : ''}
                    </p>
                    {current && !current.available && (
                      <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {text(
                          'هذا المنتج أو الكمية المطلوبة غير متاح. عدّل الكمية أو احذف المنتج.',
                          'This product or quantity is unavailable. Adjust or remove it.',
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={text('تقليل الكمية', 'Decrease quantity')}
                      onClick={() => update(item.slug, -1)}
                    >
                      <Minus size={16} />
                    </Button>
                    <span>{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={text('زيادة الكمية', 'Increase quantity')}
                      disabled={item.quantity >= 100}
                      onClick={() => update(item.slug, 1)}
                    >
                      <Plus size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={text(
                        'حذف المنتج من السلة',
                        'Remove from cart',
                      )}
                      onClick={() => update(item.slug, -item.quantity)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl bg-muted p-6">
            {!quote && !error ? (
              <SalltyLoader
                className="size-10 text-primary"
                label={text(
                  'جارٍ تحديث الأسعار والتوفر',
                  'Checking prices and availability',
                )}
              />
            ) : error ? (
              <div role="alert">
                {text(
                  'تعذر تحميل الأسعار. أعد المحاولة.',
                  'Unable to load prices. Try again.',
                )}
                <Button variant="outline" onClick={() => location.reload()}>
                  {text('إعادة المحاولة', 'Retry')}
                </Button>
              </div>
            ) : (
              quote && (
                <>
                  <p>
                    {text('إجمالي المنتجات:', 'Subtotal:')}{' '}
                    {formatPrice(
                      quote.subtotalPiastres,
                      locale,
                      quote.currency,
                    )}
                  </p>
                  {quote.requiresShipping && (
                    <p>
                      {text('الشحن:', 'Shipping:')}{' '}
                      {quote.shippingFeePiastres === null
                        ? text('غير مُعدّ بعد', 'Not configured')
                        : formatPrice(
                            quote.shippingFeePiastres,
                            locale,
                            quote.currency,
                          )}
                    </p>
                  )}
                  {quote.totalPiastres !== null && (
                    <p className="mt-3 font-bold">
                      {text('الإجمالي:', 'Total:')}{' '}
                      {formatPrice(quote.totalPiastres, locale)}
                    </p>
                  )}
                  {quote.checkoutEnabled ? (
                    <Button asChild className="mt-5 w-full">
                      <Link href={'/store/' + slug + '/checkout'}>
                        {text('متابعة لإتمام الطلب', 'Continue to checkout')}
                      </Link>
                    </Button>
                  ) : (
                    <p role="alert" className="mt-4 text-sm">
                      {text(
                        'إتمام الطلب غير متاح. يجب توفر الكميات وإعداد الشحن، ويدعم حاليًا المتاجر المصرية بالجنيه.',
                        'Checkout requires available stock and configured shipping. Currently available for Egyptian stores in EGP.',
                      )}
                    </p>
                  )}
                </>
              )
            )}
          </div>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
