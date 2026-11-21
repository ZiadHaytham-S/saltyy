'use client';
import { useI18n } from '@/components/preferences';

import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-lg px-5 py-20">
      <h1 className="text-2xl font-bold">
        {t('مش قادرين نحمّل الصفحة دلوقتي')}
      </h1>
      <p className="my-6 leading-7">
        {t('اتأكد إن الـ Backend والداتا بيز شغّالين، وبعدها جرّب تاني.')}
      </p>
      <Button onClick={reset}>{t('إعادة المحاولة')}</Button>
    </main>
  );
}
