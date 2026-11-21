import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShoppingBag, ShieldCheck } from 'lucide-react';
export async function MerchantShell({
  title,
  description,
  children,
  actions,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const { t } = await getI18n();
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="flex items-center gap-3 text-2xl font-bold">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white">
            <ShoppingBag size={23} />
          </span>
          {t('سلتي')}{' '}
          <span lang="en" className="text-sm font-normal text-muted-foreground">
            Sallty
          </span>
        </Link>
        {actions}
      </header>
      <div
        className={
          wide ? '' : 'grid items-start gap-8 lg:grid-cols-[0.8fr_1fr]'
        }
      >
        {!wide && (
          <aside className="hidden rounded-[2rem] bg-linear-to-br from-blue-700 to-indigo-950 p-10 text-white lg:block">
            <p className="mb-8 text-sm text-blue-200">
              {t('بداية بسيطة. فرصة كبيرة.')}
            </p>
            <h2 className="text-4xl leading-[1.8] font-bold">
              {t('حكاية متجرك')}
              <br />
              {t('بتبدأ من هنا.')}
            </h2>
            <p className="mt-6 leading-8 text-blue-100">
              {t('خطوة بخطوة، بنجهّز لك مكان مرتب تبدأ منه تجارتك.')}
            </p>
            <div className="mt-14 flex items-center gap-3 border-t border-white/20 pt-6 text-sm text-blue-100">
              <ShieldCheck size={22} />
              {t('حسابك ومتجرك في مكان واحد')}
            </div>
          </aside>
        )}
        <main
          className={
            wide
              ? 'min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-8'
              : 'rounded-[2rem] border border-border bg-card p-6 shadow-xl shadow-blue-950/5 sm:p-10'
          }
        >
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-3 mb-8 text-sm leading-7 text-muted-foreground">
            {description}
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
