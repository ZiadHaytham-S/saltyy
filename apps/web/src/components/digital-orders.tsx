'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MerchantOrder } from '@sallty/contracts';
import { mutate } from '@/lib/api/client';
import { useI18n } from './preferences';
import { Button } from './ui/button';

export function DigitalOrderActions({ order }: { order: MerchantOrder }) {
  const { locale } = useI18n(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  const text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  if (!order.digitalItems?.length) return null;
  async function action(path: string, slug?: string) {
    setBusy(true);
    setError('');
    try {
      await mutate('/merchant/orders/' + order.id + '/' + path, {
        version: order.version,
        ...(slug ? { slug } : {}),
      });
      setConfirm(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : text('تعذر تنفيذ العملية.', 'Action failed.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-border p-5">
      <h2 className="text-xl font-bold">
        {text('الدفع والتسليم الرقمي', 'Payment and digital delivery')}
      </h2>
      <p>
        {order.paymentStatus === 'PAID'
          ? text('تم تأكيد استلام المبلغ', 'Payment confirmed')
          : text('لم يتم تأكيد استلام المبلغ', 'Payment not confirmed')}
      </p>
      {order.paidAt && (
        <p className="text-sm text-muted-foreground">
          {new Date(order.paidAt).toLocaleString(locale)}
        </p>
      )}
      {order.paymentStatus === 'PAID' && (
        <p className="text-sm text-muted-foreground">
          {text(
            'إلغاء طلب رقمي مدفوع غير متاح قبل إضافة معالجة استرداد المبلغ.',
            'Paid digital orders cannot be cancelled until refunds are supported.',
          )}
        </p>
      )}
      {order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' && (
        <>
          {!confirm ? (
            <Button disabled={busy} onClick={() => setConfirm(true)}>
              {text('تأكيد استلام المبلغ', 'Confirm payment received')}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl bg-muted p-4">
              <p>
                {text(
                  'هل استلمت إجمالي الطلب بالفعل؟ هذا التأكيد يتيح التسليم التلقائي ولا ينفذ تحويلًا ماليًا.',
                  'Have you received the full order amount? This confirmation enables automatic delivery and does not process a payment.',
                )}
              </p>
              <Button
                loading={busy}
                onClick={() => void action('confirm-payment')}
              >
                {text('نعم، استلمت المبلغ كاملًا', 'Yes, full amount received')}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {text('رجوع', 'Back')}
              </Button>
            </div>
          )}
        </>
      )}
      {order.digitalItems.map((item) => (
        <div
          key={item.slug}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3"
        >
          <span>
            {item.name} —{' '}
            {item.released
              ? text('التسليم متاح للعميل', 'Available to customer')
              : item.automatic
                ? text('تلقائي بعد تأكيد المبلغ', 'Automatic after payment')
                : text('تسليم يدوي', 'Manual release')}
          </span>
          {!item.automatic &&
            !item.released &&
            order.paymentStatus === 'PAID' &&
            order.status !== 'CANCELLED' && (
              <Button
                loading={busy}
                onClick={() => void action('release-digital', item.slug)}
              >
                {text('إتاحة التسليم', 'Release delivery')}
              </Button>
            )}
        </div>
      ))}
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    </section>
  );
}
export function DigitalDeliveryButton({
  storeSlug,
  token,
  productSlug,
  name,
}: {
  storeSlug: string;
  token: string;
  productSlug: string;
  name: string;
}) {
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false),
    [url, setUrl] = useState(''),
    [error, setError] = useState('');
  async function retrieve() {
    setBusy(true);
    setError('');
    try {
      const result = (await mutate(
        '/public/stores/' + storeSlug + '/digital-delivery',
        { token, productSlug },
      )) as { url: string };
      setUrl(result.url);
    } catch {
      setError(
        locale === 'ar'
          ? 'التسليم غير متاح أو انتهت صلاحية الرابط.'
          : 'Delivery unavailable or access expired.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="my-4 space-y-2 rounded-xl border border-border p-4">
      <p className="font-bold">{name}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="text-primary underline"
        >
          {locale === 'ar' ? 'فتح المنتج الرقمي' : 'Open digital product'}
        </a>
      ) : (
        <Button loading={busy} onClick={() => void retrieve()}>
          {locale === 'ar' ? 'استلام المنتج الرقمي' : 'Receive digital product'}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
