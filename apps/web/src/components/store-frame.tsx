import Link from 'next/link';
import Image from 'next/image';
import { Store } from 'lucide-react';
import { translateText, type PublicStore } from '@sallty/contracts';
import { storePath } from '@/lib/storefront-routes';
import { CartLink } from './cart';
import { StoreContact, designStyle } from './store-design';
export function StoreFrame({
  store,
  children,
  locale,
}: {
  store: PublicStore;
  children: React.ReactNode;
  locale: 'ar' | 'en';
}) {
  const t = (value: string) => translateText(value, locale);
  const home = storePath(store.slug);
  return (
    <div
      className="store-surface min-h-screen bg-background text-foreground"
      data-store-theme={store.design?.theme ?? 'sallty'}
      data-card-style={store.design?.cardStyle ?? 'rounded'}
      style={designStyle(store.design)}
    >
      {store.design?.announcement && (
        <p className="store-announcement px-4 py-3 text-center text-sm font-semibold">
          {store.design.announcement}
        </p>
      )}
      <a
        href="#store-content"
        className="sr-only focus:not-sr-only focus:block focus:p-4"
      >
        {t('انتقل للمحتوى')}
      </a>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <Link href={home} className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white"
            >
              {store.branding.logoUrl ? (
                <Image
                  src={store.branding.logoUrl}
                  alt={store.name}
                  width={48}
                  height={48}
                  className="size-12 rounded-xl object-cover"
                  unoptimized
                />
              ) : (
                store.name.slice(0, 1)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold sm:text-xl">
                {store.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('اختيارات تستاهل تتشاف')}
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CartLink slug={store.slug} />
            <Link
              href={home + '#products'}
              className="shrink-0 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              {t('تصفح المنتجات')}
            </Link>
          </div>
        </div>
      </header>
      <main
        id="store-content"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12"
      >
        {children}
      </main>
      <footer className="mt-12 border-t border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-8">
          <span className="font-bold">{store.name}</span>
          <StoreContact design={store.design} locale={locale} />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Store className="size-4" />
            {t('مدعوم من سلتي')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
