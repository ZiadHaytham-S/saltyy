'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ORDER_TRANSITIONS,
  orderStatusLabel,
  shippingFeeToMinor,
  minorToInput,
  type OrderSummary,
  type OrderStatus,
  type MerchantOrder,
} from '@sallty/contracts';
import { mutate, ApiError } from '@/lib/api/client';
import { useI18n } from './preferences';
import { useHydrated } from '@/lib/use-hydrated';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
export const statusLabel = orderStatusLabel;
export function OrderActions({
  order,
}: {
  order: OrderSummary & Partial<MerchantOrder>;
}) {
  const { locale } = useI18n(),
    router = useRouter(),
    hydrated = useHydrated(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  async function update(status: OrderStatus) {
    setBusy(true);
    setError('');
    try {
      await mutate(
        '/merchant/orders/' + order.id,
        { status, version: order.version },
        'PATCH',
      );
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-border p-5">
      <h2 className="mb-4 font-bold">
        {locale === 'ar' ? 'تحديث حالة الطلب' : 'Update order status'}
      </h2>
      <div className="flex flex-wrap gap-3">
        {(order.requiresShipping === false && order.status === 'PROCESSING'
          ? (['DELIVERED', 'CANCELLED'] as OrderStatus[])
          : ORDER_TRANSITIONS[order.status]
        ).map((status) => (
          <Button
            key={status}
            loading={busy}
            disabled={
              busy ||
              !hydrated ||
              (status === 'CANCELLED' &&
                order.paymentStatus === 'PAID' &&
                !!order.digitalItems?.length) ||
              (status === 'DELIVERED' &&
                !!order.digitalItems?.length &&
                (order.paymentStatus !== 'PAID' ||
                  order.digitalItems?.some((item) => !item.released)))
            }
            variant={status === 'CANCELLED' ? 'outline' : 'default'}
            onClick={() =>
              status === 'CANCELLED' ? setConfirm(true) : void update(status)
            }
          >
            {statusLabel(status, locale)}
          </Button>
        ))}
      </div>
      {!ORDER_TRANSITIONS[order.status].length && (
        <p>
          {locale === 'ar'
            ? 'هذه حالة نهائية؛ لا توجد انتقالات أخرى.'
            : 'This is a final status.'}
        </p>
      )}
      {confirm && (
        <div className="mt-5 rounded-xl bg-muted p-5">
          <p>
            {locale === 'ar'
              ? 'إلغاء الطلب سيعيد المخزون مرة واحدة. لا يمكن التراجع عن الإلغاء.'
              : 'Cancellation restores stock once and cannot be undone.'}
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              disabled={busy}
              loading={busy}
              onClick={() => void update('CANCELLED')}
            >
              {locale === 'ar' ? 'تأكيد إلغاء الطلب' : 'Confirm cancellation'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {locale === 'ar' ? 'رجوع' : 'Back'}
            </Button>
          </div>
        </div>
      )}
      <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    </section>
  );
}
export function ShippingForm({
  fee,
  supported,
}: {
  fee: number | null;
  supported: boolean;
}) {
  const { locale } = useI18n(),
    router = useRouter(),
    hydrated = useHydrated(),
    [value, setValue] = useState(fee === null ? '' : minorToInput(fee)),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');
        setBusy(true);
        try {
          const shippingFeePiastres = shippingFeeToMinor(value);
          await mutate('/merchant/shipping', { shippingFeePiastres }, 'PATCH');
          setMessage(
            locale === 'ar' ? 'تم حفظ رسوم الشحن.' : 'Shipping fee saved.',
          );
          router.refresh();
        } catch (failure) {
          setError(
            failure instanceof ApiError
              ? failure.message
              : locale === 'ar'
                ? 'أدخل رسومًا صحيحة من صفر إلى 10000 جنيه.'
                : 'Enter a valid fee between 0 and 10000 EGP.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        {locale === 'ar'
          ? 'رسوم ثابتة لكل طلب داخل مصر. أدخل صفرًا للشحن المجاني. لن يعمل Checkout قبل حفظ هذا الإعداد.'
          : 'One flat fee per Egyptian order. Enter zero for free shipping. Checkout stays disabled until this setting is saved.'}
      </p>
      {!supported && (
        <p role="alert">
          {locale === 'ar'
            ? 'Checkout المصري غير متاح لعملة أو دولة هذا المتجر.'
            : 'Egyptian checkout is not supported for this store country or currency.'}
        </p>
      )}
      <Label htmlFor="shipping-fee">
        {locale === 'ar' ? 'رسوم الشحن (EGP)' : 'Shipping fee (EGP)'}
      </Label>
      <Input
        id="shipping-fee"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        inputMode="decimal"
        dir="ltr"
        disabled={!hydrated || busy || !supported}
      />
      <Button disabled={!hydrated || busy || !supported} loading={busy}>
        {locale === 'ar' ? 'حفظ رسوم الشحن' : 'Save shipping fee'}
      </Button>
      <p role="status" className="text-primary">
        {message}
      </p>
      <p role="alert" className="text-red-600 dark:text-red-400">
        {error}
      </p>
    </form>
  );
}
