'use client';
import { useI18n } from '@/components/preferences';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { locale } = useI18n();
  return (
    <div role="alert" className="p-8">
      <h1>
        {locale === 'ar' ? 'تعذر تحميل الطلبات.' : 'Unable to load orders.'}
      </h1>
      <Button className="mt-4" onClick={reset}>
        {locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}
      </Button>
    </div>
  );
}
