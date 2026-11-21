import { getI18n } from '@/lib/i18n';
import {
  Check,
  ShoppingBag,
  Store,
  Package,
  Tags,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getMerchant } from '@/lib/api/merchant';
export const dynamic = 'force-dynamic';
export default async function HomePage() {
  const { t } = await getI18n();
  const jar = await cookies();
  if (jar.has('sallty_session') || jar.has('__Host-sallty_session')) {
    const merchant = await getMerchant();
    if (merchant)
      redirect(merchant.emailVerified ? '/dashboard' : '/verify-email');
  }
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 sm:px-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:z-10 focus:rounded-lg focus:bg-background focus:p-3"
      >
        {t('انتقل للمحتوى')}
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-7">
        <Link
          href="/"
          aria-label={t('سلتي، الصفحة الرئيسية')}
          className="flex items-center gap-3"
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white">
            <ShoppingBag aria-hidden="true" size={23} />
          </span>
          <span className="text-2xl font-bold">
            {t('سلتي')}{' '}
            <span
              lang="en"
              className="ms-2 text-sm font-normal text-muted-foreground"
            >
              Sallty
            </span>
          </span>
        </Link>
        <Link href="/login" className="text-sm font-semibold text-primary">
          {t('تسجيل الدخول')}
        </Link>
      </header>
      <main id="main">
        <section className="grid items-center gap-12 py-12 sm:py-20 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-5 flex items-center gap-2 text-sm text-primary">
              <span className="size-2 rounded-full bg-primary" />
              {t('للتاجر المصري')}
            </p>
            <h1 className="max-w-xl text-4xl leading-[1.5] font-bold tracking-tight sm:text-5xl">
              {t('منتجاتك مرتّبة.')}
              <br />
              <span className="text-primary">{t('وشغلك أوضح.')}</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-muted-foreground">
              {t(
                'جهّز كتالوج متجرك بالعربي. ضيف المنتجات والصور، ظبّط الأسعار والمخزون، ورتّب التصنيفات من مكان واحد.',
              )}
            </p>
            <Button asChild className="mt-8">
              <Link href="/register">{t('إنشاء حساب تاجر')}</Link>
            </Button>
            <p className="mt-5 text-xs leading-7 text-muted-foreground">
              {t(
                'النسخة الحالية لإدارة الكتالوج. استقبال الطلبات ونشر المتجر للعملاء مش متاحين لسه.',
              )}
            </p>
          </div>
          <div className="overflow-hidden rounded-[2rem] bg-linear-to-br from-blue-700 to-indigo-950 p-8 text-white shadow-2xl shadow-blue-900/20 sm:p-10">
            <div className="mb-8 flex size-16 items-center justify-center rounded-2xl bg-background/15">
              <Store aria-hidden="true" size={30} />
            </div>
            <p className="text-sm text-blue-200">
              {t('مساحة واضحة لإدارة متجرك')}
            </p>
            <h2 className="mt-3 text-2xl leading-relaxed font-bold">
              {t('ابدأ بمنتجك الأول،')}
              <br />
              {t('وخلي التفاصيل تحت إيدك.')}
            </h2>
            <ul className="mt-7 space-y-4 text-sm">
              {[
                t('أسعار بالجنيه المصري ومخزون واضح'),
                t('صور وتصنيفات لكل منتج'),
                t('واجهة عربية تناسب الموبايل'),
              ].map((text) => (
                <li key={text} className="flex items-center gap-3">
                  <Check
                    aria-hidden="true"
                    size={16}
                    className="text-blue-200"
                  />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section
          aria-label={t('إمكانيات إدارة المتجر')}
          className="mb-16 grid gap-4 sm:grid-cols-3"
        >
          {[
            {
              icon: Package,
              title: t('منتجاتك في مكان واحد'),
              text: t('أضف وعدّل وأرشف المنتجات، وابحث بالاسم والحالة.'),
            },
            {
              icon: Tags,
              title: t('تصنيفات مرتّبة'),
              text: t('قسّم الكتالوج لمجموعات تساعدك تدير المنتجات بسهولة.'),
            },
            {
              icon: ShieldCheck,
              title: t('حساب خاص بمتجرك'),
              text: t('إدارة بيانات متجرك متاحة لصاحب الحساب بس.'),
            },
          ].map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-2xl border border-border bg-background p-6"
            >
              <Icon
                aria-hidden="true"
                className="mb-4 text-primary"
                size={24}
              />
              <h2 className="font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {text}
              </p>
            </article>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-sm text-muted-foreground">
        {t('سلتي \u2014 إدارة أبسط لكتالوج متجرك.')}
      </footer>
    </div>
  );
}
