'use client';
import { useI18n } from '@/components/preferences';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { mutate } from '@/lib/api/client';
import { invalidateCatalog } from '@/lib/api/catalog-actions';
import { useHydrated } from '@/lib/use-hydrated';
export function ArchiveProduct({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const router = useRouter();
  const hydrated = useHydrated();
  const busy = pending || !hydrated;
  async function archive() {
    setPending(true);
    setError('');
    try {
      await mutate('/merchant/products/' + id, { version }, 'DELETE');
      await invalidateCatalog();
      router.replace('/dashboard/products?status=ARCHIVED');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t('الأرشفة ما تمّتش'),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mt-8 rounded-2xl border border-border p-5">
      <h2 className="font-bold">{t('حذف المنتج من القائمة النشطة')}</h2>
      <p className="my-3 text-sm leading-7 text-muted-foreground">
        {t(
          'الحذف بيأرشف المنتج وبيحتفظ ببياناته وصوره. تقدر ترجّعه باختيار الحالة \u00ABنشط\u00BB من التعديل. التصنيف والصور المرتبطة بيه بتفضل مستخدمة.',
        )}
      </p>
      {confirm ? (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} loading={pending} onClick={archive}>
            {t('تأكيد الأرشفة')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {t('إلغاء')}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          {t('أرشفة المنتج')}
        </Button>
      )}
      <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
        {error}
      </p>
    </section>
  );
}
