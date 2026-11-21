'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  GOVERNORATES,
  customerSchema,
  credentialSchema,
  orderStatusLabel,
  type OrderStatus,
} from '@sallty/contracts';
import { useCart, clearCart, readCart } from '@/lib/cart';
import { mutate, ApiError } from '@/lib/api/client';
import { useI18n } from './preferences';
import { useCartQuote, formatPrice } from './cart';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { SalltyLoader } from './ui/sallty-loader';
import { DigitalDeliveryButton } from './digital-orders';
const keyName = (slug: string) => 'sallty:pending-checkout:' + slug;
const receiptKey = (slug: string) => 'sallty:receipt:' + slug;
const randomToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
type Pending = { key: string; fingerprint: string; receiptToken?: string };
function pendingKey(slug: string): Pending | null {
  const raw = sessionStorage.getItem(keyName(slug));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<Pending>;
  return typeof parsed.key === 'string' &&
    credentialSchema.safeParse({ token: parsed.key }).success &&
    typeof parsed.fingerprint === 'string'
    ? (parsed as Pending)
    : null;
}
export function CheckoutForm({ slug }: { slug: string }) {
  const items = useCart(slug),
    { quote, error: quoteError, refresh } = useCartQuote(slug, items),
    { locale } = useI18n(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [fields, setFields] = useState<Record<string, string>>({}),
    [error, setError] = useState('');
  const fingerprint = JSON.stringify(items),
    text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  function finish(
    result: { orderNumber: string; receiptToken: string },
    originalFingerprint: string,
  ) {
    // App Router can mount confirmation before applying its URL fragment.
    // Persist the receipt capability before navigation; never persist customer data.
    sessionStorage.setItem(receiptKey(slug), result.receiptToken);
    const pending = pendingKey(slug);
    if (pending)
      sessionStorage.setItem(
        keyName(slug),
        JSON.stringify({
          ...pending,
          fingerprint: originalFingerprint,
          receiptToken: result.receiptToken,
        }),
      );
    router.replace(
      '/store/' + slug + '/confirmation#token=' + result.receiptToken,
    );
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const pending = pendingKey(slug);
        if (pending) {
          try {
            const result = (await mutate(
              '/public/stores/' + slug + '/checkout/recover',
              { token: pending.key },
            )) as { orderNumber: string; receiptToken: string };
            if (active) {
              sessionStorage.setItem(receiptKey(slug), result.receiptToken);
              sessionStorage.setItem(
                keyName(slug),
                JSON.stringify({
                  ...pending,
                  receiptToken: result.receiptToken,
                }),
              );
              router.replace(
                '/store/' + slug + '/confirmation#token=' + result.receiptToken,
              );
              return;
            }
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e;
          }
        }
        if (active) setReady(true);
      } catch {
        if (active)
          setError(
            locale === 'ar'
              ? 'تعذر التحقق من طلب سابق. أعد تحميل الصفحة قبل المحاولة.'
              : 'Unable to check your previous request. Reload before retrying.',
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, router, locale]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || !quote?.checkoutEnabled || !quote.quoteToken) return;
    setError('');
    setFields({});
    const form = new FormData(event.currentTarget),
      customer = customerSchema.safeParse(Object.fromEntries(form));
    if (!customer.success) {
      const errors: Record<string, string> = {};
      for (const issue of customer.error.issues) {
        const key = String(issue.path[0]);
        errors[key] =
          key === 'phone'
            ? text(
                'أدخل رقم موبايل مصري صحيحًا مثل 01012345678.',
                'Enter a valid Egyptian mobile number, such as 01012345678.',
              )
            : key === 'address'
              ? text(
                  'أدخل عنوانًا واضحًا من 10 إلى 500 حرف.',
                  'Enter a detailed address between 10 and 500 characters.',
                )
              : text('يرجى مراجعة هذا الحقل.', 'Please check this field.');
      }
      setFields(errors);
      setError(
        text(
          'راجع الاسم ورقم الموبايل والمحافظة والعنوان.',
          'Check your name, Egyptian mobile number and address.',
        ),
      );
      return;
    }
    setBusy(true);
    let pending: Pending | null = null;
    try {
      pending = pendingKey(slug) ?? { key: randomToken(), fingerprint };
      sessionStorage.setItem(keyName(slug), JSON.stringify(pending));
      const result = (await mutate(
        '/public/stores/' + slug + '/checkout',
        {
          items,
          customer: customer.data,
          paymentMethod: quote.paymentMethod,
          quoteToken: quote.quoteToken,
        },
        'POST',
        { 'Idempotency-Key': pending.key },
      )) as { orderNumber: string; receiptToken: string };
      finish(result, fingerprint);
    } catch (e) {
      if (
        e instanceof ApiError &&
        ['QUOTE_CHANGED', 'OUT_OF_STOCK', 'CHECKOUT_UNAVAILABLE'].includes(
          e.code,
        )
      )
        refresh();
      if (pending && e instanceof ApiError && e.status === 409) {
        try {
          const result = (await mutate(
            '/public/stores/' + slug + '/checkout/recover',
            { token: pending.key },
          )) as { orderNumber: string; receiptToken: string };
          finish(result, pending.fingerprint);
          return;
        } catch {}
      }
      setError(
        e instanceof Error
          ? e.message
          : text(
              'تعذر تأكيد الطلب. احتفظنا بمفتاح المحاولة لمنع تكراره.',
              'Unable to confirm. Your request key is saved to prevent duplicates.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-3 text-3xl font-bold">
        {text('إتمام الطلب', 'Checkout')}
      </h1>
      <p className="mb-8 text-muted-foreground">
        {quote?.containsDigital
          ? text(
              'يؤكد التاجر استلام المبلغ يدويًا قبل إتاحة المنتجات الرقمية. لا يتم تحصيل أي مبلغ إلكترونيًا هنا.',
              'The merchant confirms receipt of payment before releasing digital products. No online payment is processed here.',
            )
          : text(
              'لا تحتاج إلى حساب. الدفع عند الاستلام فقط.',
              'No account needed. Cash on delivery only.',
            )}
      </p>
      {!items.length ? (
        <Link
          className="text-primary underline"
          href={'/store/' + slug + '/cart'}
        >
          {text(
            'السلة فارغة. عد إلى السلة.',
            'Your cart is empty. Return to cart.',
          )}
        </Link>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr]">
          <form
            onSubmit={submit}
            className="space-y-5 rounded-2xl border border-border p-5 sm:p-8"
          >
            <fieldset disabled={!ready || busy} className="space-y-5">
              {[
                ['name', text('الاسم الكامل', 'Full name'), 100],
                [
                  'phone',
                  text('رقم الموبايل المصري', 'Egyptian mobile number'),
                  40,
                ],
                ...(quote?.requiresShipping
                  ? [['city', text('المدينة أو المنطقة', 'City or area'), 100]]
                  : []),
              ].map(([name, label, max]) => (
                <div key={String(name)}>
                  <Label htmlFor={'checkout-' + name}>{label}</Label>
                  <Input
                    id={'checkout-' + name}
                    aria-invalid={!!fields[String(name)]}
                    aria-describedby={
                      fields[String(name)]
                        ? 'checkout-' + name + '-error'
                        : undefined
                    }
                    name={String(name)}
                    required
                    maxLength={Number(max)}
                    minLength={name === 'phone' ? 10 : 2}
                    type={name === 'phone' ? 'tel' : 'text'}
                    dir={name === 'phone' ? 'ltr' : undefined}
                    autoComplete={
                      name === 'name'
                        ? 'name'
                        : name === 'phone'
                          ? 'tel'
                          : 'address-level2'
                    }
                  />
                  {fields[String(name)] && (
                    <p
                      id={'checkout-' + name + '-error'}
                      className="mt-2 text-sm text-red-600 dark:text-red-400"
                    >
                      {fields[String(name)]}
                    </p>
                  )}
                </div>
              ))}
              {quote?.requiresShipping && (
                <div>
                  <Label htmlFor="checkout-governorate">
                    {text('المحافظة', 'Governorate')}
                  </Label>
                  <Select
                    id="checkout-governorate"
                    aria-invalid={!!fields.governorate}
                    name="governorate"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {text('اختر المحافظة', 'Choose governorate')}
                    </option>
                    {GOVERNORATES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </Select>
                </div>
              )}
              {quote?.requiresShipping && (
                <div>
                  <Label htmlFor="checkout-address">
                    {text('العنوان بالتفصيل', 'Detailed address')}
                  </Label>
                  <Textarea
                    id="checkout-address"
                    aria-invalid={!!fields.address}
                    aria-describedby={
                      fields.address ? 'checkout-address-error' : undefined
                    }
                    name="address"
                    minLength={10}
                    maxLength={500}
                    required
                    autoComplete="street-address"
                  />
                  {fields.address && (
                    <p
                      id="checkout-address-error"
                      className="mt-2 text-sm text-red-600 dark:text-red-400"
                    >
                      {fields.address}
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="checkout-notes">
                  {text('ملاحظات (اختياري)', 'Notes (optional)')}
                </Label>
                <Textarea id="checkout-notes" name="notes" maxLength={500} />
              </div>
            </fieldset>
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            <Button
              type="submit"
              className="w-full"
              loading={busy}
              disabled={busy || !ready || !quote?.checkoutEnabled}
            >
              {quote?.containsDigital
                ? text(
                    'تأكيد الطلب — تأكيد الدفع يدويًا',
                    'Place order — manual payment confirmation',
                  )
                : text(
                    'تأكيد الطلب — الدفع عند الاستلام',
                    'Place order — cash on delivery',
                  )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {text(
                'أعد المحاولة من نفس الصفحة إذا انقطع الاتصال؛ لا تحتاج لإنشاء طلب جديد.',
                'Retry from this page after a connection failure; no need to create a new request.',
              )}
            </p>
          </form>
          <aside className="h-fit rounded-2xl bg-muted p-6">
            <h2 className="mb-5 text-xl font-bold">
              {text('ملخص الطلب', 'Order summary')}
            </h2>
            {quote?.items.map((item) => (
              <p key={item.slug} className="mb-3 flex justify-between gap-4">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatPrice(item.lineTotalPiastres, locale)}</span>
              </p>
            ))}
            {quote?.checkoutEnabled && quote.totalPiastres !== null ? (
              <div className="space-y-3 border-t border-border pt-4">
                <p>
                  {text('المنتجات:', 'Subtotal:')}{' '}
                  {formatPrice(quote.subtotalPiastres, locale)}
                </p>
                {quote.requiresShipping && (
                  <p>
                    {text('الشحن:', 'Shipping:')}{' '}
                    {formatPrice(quote.shippingFeePiastres ?? 0, locale)}
                  </p>
                )}
                <p className="text-xl font-bold">
                  {text('الإجمالي:', 'Total:')}{' '}
                  {formatPrice(quote.totalPiastres, locale)}
                </p>
              </div>
            ) : (
              <p role="status">
                {quoteError ? (
                  text(
                    'تعذر تحميل الإجمالي. أعد تحميل الصفحة.',
                    'Unable to load total. Reload the page.',
                  )
                ) : quote ? (
                  text(
                    'إتمام الطلب غير متاح. راجع السلة والشحن.',
                    'Checkout unavailable. Check stock and shipping.',
                  )
                ) : (
                  <SalltyLoader decorative className="size-10 text-primary" />
                )}
              </p>
            )}
            <Link
              href={'/store/' + slug + '/cart'}
              className="mt-6 block text-primary underline"
            >
              {text('تعديل السلة', 'Edit cart')}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
export function OrderConfirmation({ slug }: { slug: string }) {
  const { locale } = useI18n(),
    [token] = useState(() => {
      if (typeof window === 'undefined') return '';
      const fragment = new URLSearchParams(location.hash.slice(1)).get('token');
      try {
        return fragment ?? sessionStorage.getItem(receiptKey(slug)) ?? '';
      } catch {
        return fragment ?? '';
      }
    }),
    [receipt, setReceipt] = useState<{
      orderNumber: string;
      status: OrderStatus;
      paymentStatus?: 'UNPAID' | 'PAID';
      digitalItems?: { slug: string; name: string; available: boolean }[];
    } | null>(null),
    [error, setError] = useState(''),
    [receiptVersion, setReceiptVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (token) {
      try {
        sessionStorage.setItem(receiptKey(slug), token);
      } catch {
        /* Fragment remains available in component memory. */
      }
      history.replaceState(null, '', location.pathname);
      void mutate('/public/stores/' + slug + '/receipt', { token })
        .then((result) => {
          if (active) {
            setReceipt(result as { orderNumber: string; status: OrderStatus });
            try {
              const pending = pendingKey(slug);
              if (pending?.receiptToken === token) {
                if (pending.fingerprint === JSON.stringify(readCart(slug)))
                  clearCart(slug);
                sessionStorage.removeItem(keyName(slug));
              }
            } catch {
              /* Keep request capability if browser storage is unavailable. */
            }
          }
        })
        .catch(() => {
          if (active) setError('RECEIPT_UNAVAILABLE');
        });
    } else
      void Promise.resolve().then(() => {
        if (active) setError('RECEIPT_UNAVAILABLE');
      });
    return () => {
      active = false;
    };
  }, [slug, token, receiptVersion]);
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-border p-8 text-center">
      <h1 className="text-3xl font-bold">
        {locale === 'ar' ? 'تأكيد الطلب' : 'Order confirmation'}
      </h1>
      {receipt ? (
        <>
          <p className="my-6 text-lg">
            {locale === 'ar'
              ? 'تم استلام طلبك بنجاح.'
              : 'Your order has been received.'}
          </p>
          <p dir="ltr" className="font-mono text-xl font-bold">
            {receipt.orderNumber}
          </p>
          <p className="mt-3">
            {locale === 'ar' ? 'الحالة: ' : 'Status: '}
            {orderStatusLabel(receipt.status, locale)}
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            {locale === 'ar'
              ? 'احتفظ برقم الطلب للمتابعة مع المتجر. لم يتم تحصيل أي مبلغ إلكترونيًا.'
              : 'Save this order number to contact the store. No online payment was collected.'}
          </p>
          {!!receipt.digitalItems?.length && (
            <div className="mt-5">
              {receipt.paymentStatus !== 'PAID' && (
                <p>
                  {locale === 'ar'
                    ? 'بانتظار تأكيد التاجر لاستلام المبلغ. احتفظ بصفحة التأكيد الخاصة بك.'
                    : 'Waiting for the merchant to confirm payment. Keep your private confirmation page.'}
                </p>
              )}
              {receipt.digitalItems.map((item) =>
                item.available ? (
                  <DigitalDeliveryButton
                    key={item.slug}
                    storeSlug={slug}
                    token={token}
                    productSlug={item.slug}
                    name={item.name}
                  />
                ) : (
                  <p key={item.slug}>
                    {item.name} —{' '}
                    {locale === 'ar'
                      ? 'التسليم غير متاح بعد'
                      : 'Not released yet'}
                  </p>
                ),
              )}
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setError('');
                  setReceipt(null);
                  setReceiptVersion((value) => value + 1);
                }}
              >
                {locale === 'ar'
                  ? 'تحديث حالة التسليم'
                  : 'Refresh delivery status'}
              </Button>
            </div>
          )}
        </>
      ) : error ? (
        <p role="alert" className="my-6">
          {locale === 'ar'
            ? 'رابط التأكيد غير صالح أو انتهت صلاحيته. لا تعِد الطلب إذا كان قد تأكد بالفعل.'
            : 'This confirmation link is invalid or expired. Do not reorder if your order was already confirmed.'}
        </p>
      ) : (
        <div className="my-6 flex justify-center text-primary">
          <SalltyLoader
            className="size-14"
            label={locale === 'ar' ? 'جارٍ التحقق من الطلب' : 'Checking order'}
          />
        </div>
      )}
      <Link
        href={'/store/' + slug}
        className="mt-6 block text-primary underline"
      >
        {locale === 'ar' ? 'العودة إلى المتجر' : 'Return to store'}
      </Link>
    </div>
  );
}
