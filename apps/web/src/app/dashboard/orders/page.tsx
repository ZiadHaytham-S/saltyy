import Link from 'next/link';
import { orderQuerySchema, ORDER_STATUSES } from '@sallty/contracts';
import { getOrders } from '@/lib/api/orders';
import { getI18n } from '@/lib/i18n';
import { MerchantShell } from '@/components/merchant-shell';
import { LogoutButton } from '@/components/merchant-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
const labels = {
  PENDING: ['بانتظار التأكيد', 'Pending'],
  CONFIRMED: ['مؤكد', 'Confirmed'],
  PROCESSING: ['قيد التجهيز', 'Processing'],
  SHIPPED: ['تم الشحن', 'Shipped'],
  DELIVERED: ['تم التسليم', 'Delivered'],
  CANCELLED: ['ملغي', 'Cancelled'],
} as const;
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await getI18n(),
    text = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const parsed = orderQuerySchema.safeParse(await searchParams),
    query = parsed.success ? parsed.data : orderQuerySchema.parse({}),
    data = await getOrders(query);
  const path = (page: number) =>
    '/dashboard/orders?' +
    new URLSearchParams({
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
      page: String(page),
    });
  return (
    <MerchantShell
      title={text('الطلبات', 'Orders')}
      description={text(
        'طلبات متجرك فقط. راجع العميل والمنتجات وحدّث الحالة.',
        'Your store orders. Review customers and items, then update status.',
      )}
      actions={<LogoutButton />}
      wide
    >
      <form className="mb-6 flex flex-wrap gap-3">
        <Input
          className="min-w-0 flex-1"
          name="q"
          aria-label={text('بحث برقم الطلب', 'Search order number')}
          placeholder={text('رقم الطلب', 'Order number')}
          defaultValue={query.q}
          maxLength={50}
        />
        <Select
          className="w-full sm:w-52"
          name="status"
          aria-label={text('حالة الطلب', 'Order status')}
          defaultValue={query.status ?? ''}
        >
          <option value="">{text('كل الحالات', 'All statuses')}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {labels[s][locale === 'ar' ? 0 : 1]}
            </option>
          ))}
        </Select>
        <Button>{text('بحث وتصفية', 'Search and filter')}</Button>
        <Link
          className={buttonVariants({ variant: 'outline' })}
          href="/dashboard/orders"
        >
          {text('مسح', 'Clear')}
        </Link>
      </form>
      {!parsed.success && (
        <p role="alert">
          {text(
            'الفلاتر غير صحيحة. تم عرض القائمة الأساسية.',
            'Invalid filters; showing default list.',
          )}
        </p>
      )}
      {!data.items.length ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <h2>{text('لا توجد طلبات', 'No orders yet')}</h2>
          <p className="mt-3 text-muted-foreground">
            {text(
              'ستظهر هنا الطلبات المؤكدة من Checkout.',
              'Orders placed through checkout will appear here.',
            )}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {data.items.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5"
            >
              <div>
                <h2 dir="ltr" className="font-mono font-bold">
                  {order.orderNumber}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeZone: 'Africa/Cairo',
                  }).format(new Date(order.createdAt))}
                </p>
              </div>
              <p>{labels[order.status][locale === 'ar' ? 0 : 1]}</p>
              <p className="font-bold">
                {new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'EGP',
                }).format(order.totalPiastres / 100)}
              </p>
              <Link
                className={buttonVariants({ variant: 'outline' })}
                href={'/dashboard/orders/' + order.id}
              >
                {text('تفاصيل الطلب', 'Order details')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav
        className="mt-6 flex flex-wrap items-center justify-between gap-3"
        aria-label={text('صفحات الطلبات', 'Order pages')}
      >
        <span>
          {text('إجمالي الطلبات:', 'Total orders:')} {data.total} ·{' '}
          {text('صفحة', 'Page')} {data.page}
        </span>
        <div className="flex gap-3">
          {data.page > 1 && (
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={path(data.page - 1)}
            >
              {text('السابق', 'Previous')}
            </Link>
          )}
          {data.page * data.pageSize < data.total && data.page < 1000 && (
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={path(data.page + 1)}
            >
              {text('التالي', 'Next')}
            </Link>
          )}
        </div>
      </nav>
    </MerchantShell>
  );
}
