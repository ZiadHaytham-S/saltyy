import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
export default async function ProductNotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-bold">{t('المنتج مش موجود')}</h1>
      <p className="my-5 text-sm text-muted-foreground">
        {t('ارجع لمنتجات متجرك واختار المنتج من القائمة.')}
      </p>
      <Link href="/dashboard/products" className="text-primary underline">
        {t('رجوع للمنتجات')}
      </Link>
    </main>
  );
}
