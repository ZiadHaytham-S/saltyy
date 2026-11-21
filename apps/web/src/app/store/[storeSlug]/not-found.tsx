import { getI18n } from '@/lib/i18n';
import Link from 'next/link';
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="mb-4 font-bold text-blue-600">404</p>
      <h1 className="text-2xl font-bold">{t('الرابط ده مش متاح')}</h1>
      <p className="my-5 text-muted-foreground">
        {t('المتجر أو المنتج مش موجود، أو المنتج مش منشور حاليًا.')}
      </p>
      <Link href="/" className="text-blue-700 dark:text-blue-300 underline">
        {t('الرجوع لسلتي')}
      </Link>
    </main>
  );
}
