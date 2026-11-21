'use client';
import { useI18n } from '@/components/preferences';

import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="text-2xl font-bold">{t('المتجر مش متاح مؤقتًا')}</h1>
      <p className="my-5 text-muted-foreground">
        {t('حصلت مشكلة في تحميل البيانات. جرّب تاني بعد شوية.')}
      </p>
      <Button onClick={reset}>{t('حاول تاني')}</Button>
    </main>
  );
}
