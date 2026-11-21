import { getOrder } from '@/lib/api/orders';
import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
import { OrderActions } from '@/components/order-management';
import { DigitalOrderActions } from '@/components/digital-orders';
import Link from 'next/link';
import { orderStatusLabel } from '@sallty/contracts';
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    order = await getOrder(id),
    { locale } = await getI18n(),
    text = (ar: string, en: string) => (locale === 'ar' ? ar : en),
    price = (value: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
      }).format(value / 100);
  return (
    <MerchantShell
      title={text('تفاصيل الطلب', 'Order details')}
      description={order.orderNumber}
      actions={<LogoutButton />}
      wide
    >
      <Link className="text-primary underline" href="/dashboard/orders">
        {text('جميع الطلبات', 'All orders')}
      </Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border p-5">
          <h2 className="mb-4 text-xl font-bold">
            {text('بيانات العميل', 'Customer details')}
          </h2>
          <p>{order.customer.name}</p>
          <p dir="ltr">{order.customer.phone}</p>
          {order.requiresShipping && (
            <p>
              {order.customer.governorate} · {order.customer.city}
            </p>
          )}
          {order.requiresShipping && (
            <p className="mt-3 whitespace-pre-wrap break-words">
              {order.customer.address}
            </p>
          )}
          {order.customer.notes && (
            <p className="mt-4 whitespace-pre-wrap break-words">
              {text('ملاحظات:', 'Notes:')} {order.customer.notes}
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-border p-5">
          <h2 className="mb-4 text-xl font-bold">
            {text('المنتجات وقت الطلب', 'Items at purchase')}
          </h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.slug} className="flex justify-between gap-3">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{price(item.lineTotalPiastres)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p>
              {text('المنتجات:', 'Subtotal:')} {price(order.subtotalPiastres)}
            </p>
            {order.requiresShipping && (
              <p>
                {text('الشحن:', 'Shipping:')} {price(order.shippingFeePiastres)}
              </p>
            )}
            <p className="text-lg font-bold">
              {text('الإجمالي:', 'Total:')} {price(order.totalPiastres)}
            </p>
            <p>
              {order.paymentMethod === 'MANUAL'
                ? text('تأكيد الدفع يدويًا', 'Manual payment confirmation')
                : text('الدفع عند الاستلام', 'Cash on delivery')}
            </p>
          </div>
        </section>
      </div>
      <OrderActions order={order} />
      <DigitalOrderActions order={order} />
      <section className="mt-6 rounded-2xl border border-border p-5">
        <h2 className="font-bold">{text('سجل الحالات', 'Status history')}</h2>
        <ul className="mt-3 space-y-2">
          {order.events.map((event, i) => (
            <li key={i}>
              {orderStatusLabel(event.to, locale)} ·{' '}
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Cairo',
              }).format(new Date(event.at))}
            </li>
          ))}
        </ul>
      </section>
    </MerchantShell>
  );
}
